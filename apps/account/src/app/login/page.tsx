import { signIn, auth } from '@/auth';
import { redirect } from 'next/navigation';
import { sanitizeReturnUrl } from '@/lib/return-url';

type SearchParams = Promise<{ return?: string }>;

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { return: rawReturn } = await searchParams;
  const returnUrl = sanitizeReturnUrl(rawReturn);

  const session = await auth();
  if (session?.user) {
    redirect(returnUrl);
  }

  async function withGoogle() {
    'use server';
    await signIn('google', { redirectTo: returnUrl });
  }
  async function withApple() {
    'use server';
    await signIn('apple', { redirectTo: returnUrl });
  }
  async function withEmail(formData: FormData) {
    'use server';
    const email = String(formData.get('email') ?? '').trim();
    if (!email) return;
    await signIn('nodemailer', { email, redirectTo: returnUrl });
  }

  return (
    <main className="mx-auto max-w-sm p-8">
      <h1 className="text-2xl font-bold text-center mb-2">旅コト ログイン</h1>
      <p className="text-sm text-center text-gray-600 mb-8">
        ご希望のログイン方法を選んでください
      </p>

      <div className="space-y-3">
        <form action={withGoogle}>
          <button
            type="submit"
            className="w-full rounded-md border border-gray-300 bg-white py-2 text-sm font-medium hover:bg-gray-50"
          >
            Google でログイン
          </button>
        </form>

        <form action={withApple}>
          <button
            type="submit"
            className="w-full rounded-md bg-black py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Apple でサインイン
          </button>
        </form>
      </div>

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
        <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-500">または</span></div>
      </div>

      <form action={withEmail} className="space-y-2">
        <label htmlFor="email" className="block text-xs font-medium text-gray-700">メールアドレス</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="submit"
          className="w-full rounded-md bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
        >
          メールでログインリンクを受け取る
        </button>
      </form>
    </main>
  );
}
