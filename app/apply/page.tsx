'use client';

import { useState } from 'react';

export default function ApplyPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, note }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '申請失敗，請稍後再試一次。');
        return;
      }
      setMessage(data.message || '已送出申請。');
    } catch {
      setError('網路異常，請稍後再試一次。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>申請帳號</h1>
        <p className="login-sub">送出後請等候管理員在後台開通，開通後再回登入頁登入</p>
        {message ? (
          <div className="apply-success">{message}</div>
        ) : (
          <>
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
              <span>姓名（選填）</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="方便管理員辨識身分"
                autoComplete="name"
              />
            </label>
            <label className="login-field">
              <span>備註（選填）</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="例如：所屬單位、誰介紹的"
              />
            </label>
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="primary-btn login-submit" disabled={loading}>
              {loading ? '送出中…' : '送出申請'}
            </button>
          </>
        )}
        <a className="login-apply-link" href="/login">已經有帳號？回登入頁</a>
      </form>
    </div>
  );
}
