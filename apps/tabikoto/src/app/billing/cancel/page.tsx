import Link from 'next/link';

export default function BillingCancelPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-neutral-950 text-neutral-100 px-4">
      <div className="text-center space-y-6 max-w-sm">
        <h1 className="text-2xl font-bold">支払いはキャンセルされました</h1>
        <p className="text-sm text-neutral-300 leading-relaxed">
          料金は発生していません。引き続き旅コトをご利用いただけます。
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white text-lg font-semibold"
        >
          旅コトに戻る
        </Link>
      </div>
    </main>
  );
}
