type SearchParams = Promise<{ error?: string }>;

export default async function LoginErrorPage({ searchParams }: { searchParams: SearchParams }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto max-w-sm p-8 text-center">
      <h1 className="text-xl font-bold mb-4 text-red-600">ログインに失敗しました</h1>
      <p className="text-sm text-gray-600">
        {error ? `理由: ${error}` : '不明なエラーが発生しました。'}
      </p>
      <p className="mt-6">
        <a href="/login" className="text-emerald-600 underline text-sm">ログイン画面に戻る</a>
      </p>
    </main>
  );
}
