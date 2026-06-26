import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async rewrites() {
    return [
      {
        source: '/.well-known/jwks.json',
        destination: '/api/jwks.json',
      },
    ];
  },
};

export default nextConfig;
