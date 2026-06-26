export default function VerifyRequestPage() {
  return (
    <main className="mx-auto max-w-sm p-8 text-center">
      <h1 className="text-xl font-bold mb-4">メールを確認してください</h1>
      <p className="text-sm text-gray-600">
        入力したメールアドレス宛にログインリンクを送信しました。
        <br />
        メール内のリンクをタップすると自動でログインが完了します。
      </p>
      <p className="text-xs text-gray-400 mt-6">
        リンクの有効期限は 15 分です。届かない場合は迷惑メールフォルダもご確認ください。
      </p>
    </main>
  );
}
