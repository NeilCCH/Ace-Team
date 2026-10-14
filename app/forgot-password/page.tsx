'use client';

import { useState } from 'react';

type Step = 'email' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleFindQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/forgot-password/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '查詢失敗，請稍後再試一次。');
        return;
      }
      setQuestion(data.question);
      setStep('reset');
    } catch {
      setError('網路異常，請稍後再試一次。');
    } finally {
      setLoading(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
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
      const res = await fetch('/api/forgot-password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, answer, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '重設失敗，請稍後再試一次。');
        return;
      }
      setStep('done');
    } catch {
      setError('網路異常，請稍後再試一次。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={step === 'email' ? handleFindQuestion : handleReset}>
        <h1>忘記密碼</h1>
        {step === 'done' ? (
          <div className="apply-success">密碼已重設，回登入頁用新密碼登入即可。</div>
        ) : step === 'email' ? (
          <>
            <p className="login-sub">輸入申請帳號時用的 Email，確認安全問題</p>
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
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="primary-btn login-submit" disabled={loading}>
              {loading ? '查詢中…' : '下一步'}
            </button>
          </>
        ) : (
          <>
            <p className="login-sub">{question}</p>
            <label className="login-field">
              <span>答案</span>
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
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
            <button type="submit" className="primary-btn login-submit" disabled={loading}>
              {loading ? '更新中…' : '重設密碼'}
            </button>
          </>
        )}
        <a className="login-apply-link" href="/login">回登入頁</a>
      </form>
    </div>
  );
}
