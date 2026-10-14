'use client';

import { useState } from 'react';
import { SECURITY_QUESTIONS } from '@/lib/securityQuestions';

function PasswordForm() {
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
    <form className="login-card account-card" onSubmit={handleSubmit}>
      <h2 className="account-card-title">更改密碼</h2>
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
  );
}

function SecurityQuestionForm() {
  const [questionChoice, setQuestionChoice] = useState<string>(SECURITY_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const isCustomQuestion = questionChoice === '自訂問題';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setMessage('');
    const question = isCustomQuestion ? customQuestion.trim() : questionChoice;
    if (!question) {
      setError('請輸入自訂的安全問題。');
      return;
    }
    if (!answer.trim()) {
      setError('請輸入答案。');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/account/security-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '更新失敗，請稍後再試一次。');
        return;
      }
      setMessage('安全問題已設定，忘記密碼時可以用來驗證身分。');
      setAnswer('');
    } catch {
      setError('網路異常，請稍後再試一次。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card account-card" onSubmit={handleSubmit}>
      <h2 className="account-card-title">忘記密碼用的安全問題</h2>
      <p className="login-sub">設定後，忘記密碼時可以在登入頁用「忘記密碼？」自助重設，不用找管理員</p>
      <label className="login-field">
        <span>安全問題</span>
        <select value={questionChoice} onChange={(e) => setQuestionChoice(e.target.value)}>
          {SECURITY_QUESTIONS.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
      </label>
      {isCustomQuestion && (
        <label className="login-field">
          <span>自訂問題內容</span>
          <input
            type="text"
            value={customQuestion}
            onChange={(e) => setCustomQuestion(e.target.value)}
            placeholder="自己想一個只有你知道答案的問題"
          />
        </label>
      )}
      <label className="login-field">
        <span>答案</span>
        <input
          type="text"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="請記住這個答案"
        />
      </label>
      {error && <div className="login-error">{error}</div>}
      {message && <div className="apply-success">{message}</div>}
      <button type="submit" className="primary-btn login-submit" disabled={loading}>
        {loading ? '更新中…' : '儲存'}
      </button>
    </form>
  );
}

export default function ChangePassword() {
  return (
    <section className="account-wrap">
      <PasswordForm />
      <SecurityQuestionForm />
    </section>
  );
}
