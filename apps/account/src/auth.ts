import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import Apple from 'next-auth/providers/apple';
import Nodemailer from 'next-auth/providers/nodemailer';
import { SignJWT, jwtVerify } from 'jose';
import { MisahinaMysqlAdapter } from './lib/adapter-mysql';
import { sendMagicLinkEmail } from './lib/email-ses';
import { getAppleClientSecret } from './lib/apple-secret';
import { getJwtKeys, getJwtIssuer, getJwtAudience, getJwtTtlSeconds } from './lib/jwt-keys';
import { sanitizeReturnUrl } from './lib/return-url';

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? '__Secure-misahina.session';
const COOKIE_DOMAIN = process.env.AUTH_COOKIE_DOMAIN ?? '.hinavi.mediowl.ai';
const COOKIE_SECURE = COOKIE_NAME.startsWith('__Secure-');

export const { handlers, signIn, signOut, auth } = NextAuth(async () => ({
  adapter: MisahinaMysqlAdapter(),
  trustHost: true,
  session: { strategy: 'jwt' as const, maxAge: getJwtTtlSeconds() },
  cookies: {
    sessionToken: {
      name: COOKIE_NAME,
      options: {
        domain: COOKIE_DOMAIN,
        path: '/',
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: COOKIE_SECURE,
      },
    },
    // Apple Sign In は cross-origin の form_post callback を使うため、
    // SameSite=Lax だと callback URL の cookie が POST に乗らずに失われる。
    // SameSite=None;Secure を強制して Apple フローを通す。
    callbackUrl: {
      name: '__Secure-authjs.callback-url',
      options: {
        httpOnly: true,
        sameSite: 'none' as const,
        path: '/',
        secure: true,
      },
    },
    pkceCodeVerifier: {
      name: '__Secure-authjs.pkce.code_verifier',
      options: {
        httpOnly: true,
        sameSite: 'none' as const,
        path: '/',
        secure: true,
        maxAge: 60 * 15,
      },
    },
    state: {
      name: '__Secure-authjs.state',
      options: {
        httpOnly: true,
        sameSite: 'none' as const,
        path: '/',
        secure: true,
        maxAge: 60 * 15,
      },
    },
    nonce: {
      name: '__Secure-authjs.nonce',
      options: {
        httpOnly: true,
        sameSite: 'none' as const,
        path: '/',
        secure: true,
      },
    },
  },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    Apple({
      clientId: process.env.AUTH_APPLE_ID,
      clientSecret: await getAppleClientSecret().catch(() => ''),
      allowDangerousEmailAccountLinking: true,
    }),
    Nodemailer({
      server: { host: 'unused', port: 0, auth: { user: 'unused', pass: 'unused' } },
      from: process.env.AWS_SES_FROM ?? 'noreply@hinavi.mediowl.ai',
      maxAge: Number(process.env.MAGIC_LINK_TTL_SECONDS ?? 900),
      async sendVerificationRequest({ identifier, url }) {
        await sendMagicLinkEmail({ to: identifier, url });
      },
    }),
  ],
  pages: {
    signIn: '/login',
    verifyRequest: '/login/verify-request',
    error: '/login/error',
  },
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`;
      try {
        if (new URL(url).origin === baseUrl) return url;
      } catch {
        return baseUrl;
      }
      const sanitized = sanitizeReturnUrl(url);
      return sanitized;
    },
    async jwt({ token, user, account }) {
      if (user) token.sub = user.id;
      if (account?.provider) token.provider = account.provider;
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  jwt: {
    async encode({ token }) {
      const { privateKey, kid } = await getJwtKeys();
      const iss = getJwtIssuer();
      const aud = getJwtAudience();
      const now = Math.floor(Date.now() / 1000);
      const exp = now + getJwtTtlSeconds();
      const payload = {
        sub: token?.sub,
        email: token?.email,
        email_verified: token?.email_verified ?? true,
        provider: token?.provider,
        name: token?.name ?? null,
      };
      return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuedAt(now)
        .setIssuer(iss)
        .setAudience(aud)
        .setExpirationTime(exp)
        .sign(privateKey);
    },
    async decode({ token }) {
      if (!token) return null;
      const { publicKey } = await getJwtKeys();
      const iss = getJwtIssuer();
      try {
        const { payload } = await jwtVerify(token, publicKey, {
          issuer: iss,
          algorithms: ['RS256'],
        });
        return payload as Record<string, unknown>;
      } catch {
        return null;
      }
    },
  },
}));
