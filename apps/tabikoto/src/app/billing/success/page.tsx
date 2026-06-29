import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function BillingSuccessPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-neutral-950 text-neutral-100 px-4">
      <div className="text-center space-y-6 max-w-sm">
        <h1 className="text-2xl font-bold">お支払いありがとうございました</h1>
        <p className="text-sm text-neutral-300 leading-relaxed">
          コトポの付与が完了するまで数秒〜数十秒かかる場合があります。
          反映されない場合はしばらく経ってから再度ご確認ください。
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-lg font-semibold"
        >
          旅コトに戻る
        </Link>
      </div>
    </main>
  );
}
