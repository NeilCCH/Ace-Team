'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '登入失敗，請再試一次。');
        return;
      }
      const next = searchParams.get('next') || '/';
      router.push(next);
      router.refresh();
    } catch {
      setError('網路異常，請稍後再試一次。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>銷售 AI 教練</h1>
        <p className="login-sub">內部陪練系統</p>
        <label className="login-field">
          <span>帳號（Email）</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />
        </label>
        <label className="login-field">
          <span>密碼</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="你的個人密碼"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        <button type="submit" className="primary-btn login-submit" disabled={loading}>
          {loading ? '登入中…' : '登入'}
        </button>
        <a className="login-apply-link" href="/apply">還沒有帳號？申請帳號</a>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
