import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '旅コト アカウント',
  description: 'みさひな（misahina） 認証',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
