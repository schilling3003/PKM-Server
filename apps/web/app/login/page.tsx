'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { login, register } from '../../lib/auth';

export default function LoginPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);

  useEffect(() => {
    document.title = isLogin ? 'Sign in — PKM' : 'Create account — PKM';
  }, [isLogin]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
      }
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center bg-gray-50 p-8">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded border border-gray-200 bg-white p-6 shadow-sm"
        aria-label={isLogin ? 'Sign in' : 'Create account'}
      >
        <h1 className="text-2xl font-bold text-gray-900">
          {isLogin ? 'Sign in' : 'Create account'}
        </h1>

        {error && (
          <p className="rounded bg-red-50 p-2 text-sm text-red-700" role="alert">{error}</p>
        )}

        <div>
          <label htmlFor="email" className="sr-only">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
            autoComplete="email"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="password" className="sr-only">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            minLength={8}
            required
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isLogin ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          onClick={() => setIsLogin(!isLogin)}
          className="text-sm text-blue-600 hover:underline"
          aria-pressed={!isLogin}
        >
          {isLogin ? 'Need an account? Register' : 'Have an account? Sign in'}
        </button>
      </form>
    </main>
  );
}
