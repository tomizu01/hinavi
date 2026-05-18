import type { Metadata, Viewport } from 'next';
import SwRegister from '@/components/SwRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'hinavi',
  description: '自転車用 観光・飲食ガイド',
  manifest: '/manifest.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0a0a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
