'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? `login failed (${res.status})`);
        return;
      }
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'network error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-neutral-900 text-neutral-100 px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 bg-neutral-800 rounded-2xl p-6 shadow-xl">
        <h1 className="text-xl font-semibold text-center">hinavi ログイン</h1>
        <label className="block">
          <span className="block text-sm mb-1">ユーザー名</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            className="w-full rounded-md bg-neutral-700 border border-neutral-600 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="block text-sm mb-1">パスワード</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            className="w-full rounded-md bg-neutral-700 border border-neutral-600 px-3 py-2"
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 font-medium"
        >
          {submitting ? 'ログイン中…' : 'ログイン'}
        </button>
      </form>
    </main>
  );
}
