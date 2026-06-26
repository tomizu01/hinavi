import { auth } from '@/auth';

export default async function Page() {
  const session = await auth();
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">misahina account</h1>
      {session?.user ? (
        <>
          <p className="mt-4 text-sm">
            ログイン中: <strong>{session.user.email}</strong>
          </p>
          <p className="mt-2">
            <a href="/logout" className="text-emerald-600 underline text-sm">ログアウト</a>
          </p>
        </>
      ) : (
        <p className="mt-4 text-sm">
          <a href="/login" className="text-emerald-600 underline">ログイン画面へ</a>
        </p>
      )}
    </main>
  );
}
