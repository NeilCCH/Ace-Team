'use client';

import { useState } from 'react';

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setMessage('');
    if (newPassword.length < 8) {
      setError('新密碼至少需要 8 個字元。');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('兩次輸入的新密碼不一致。');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '更新失敗，請稍後再試一次。');
        return;
      }
      setMessage('密碼已更新，下次登入請用新密碼。');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('網路異常，請稍後再試一次。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="account-wrap">
      <form className="login-card account-card" onSubmit={handleSubmit}>
        <label className="login-field">
          <span>目前密碼</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        <label className="login-field">
          <span>新密碼</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="至少 8 個字元"
            autoComplete="new-password"
            required
          />
        </label>
        <label className="login-field">
          <span>確認新密碼</span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </label>
        {error && <div className="login-error">{error}</div>}
        {message && <div className="apply-success">{message}</div>}
        <button type="submit" className="primary-btn login-submit" disabled={loading}>
          {loading ? '更新中…' : '更新密碼'}
        </button>
      </form>
    </section>
  );
}
