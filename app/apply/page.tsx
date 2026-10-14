'use client';

import { useState } from 'react';
import { SECURITY_QUESTIONS } from '@/lib/securityQuestions';

export default function ApplyPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityQuestionChoice, setSecurityQuestionChoice] = useState<string>(SECURITY_QUESTIONS[0]);
  const [customQuestion, setCustomQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const isCustomQuestion = securityQuestionChoice === '自訂問題';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    setMessage('');
    if (password.length < 8) {
      setError('密碼至少需要 8 個字元。');
      return;
    }
    if (password !== confirmPassword) {
      setError('兩次輸入的密碼不一致。');
      return;
    }
    const securityQuestion = isCustomQuestion ? customQuestion.trim() : securityQuestionChoice;
    if (!securityQuestion) {
      setError('請輸入自訂的安全問題。');
      return;
    }
    if (!securityAnswer.trim()) {
      setError('請輸入安全問題的答案。');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, note, password, securityQuestion, securityAnswer }),
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
        <p className="login-sub">送出後請等候管理員開通；這裡設定的密碼就是之後登入要用的密碼，開通後直接回登入頁用這組帳密登入</p>
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
            <label className="login-field">
              <span>設定密碼</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="至少 8 個字元"
                autoComplete="new-password"
                required
              />
            </label>
            <label className="login-field">
              <span>確認密碼</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="再輸入一次"
                autoComplete="new-password"
                required
              />
            </label>
            <label className="login-field">
              <span>安全問題（忘記密碼時用來驗證身分）</span>
              <select value={securityQuestionChoice} onChange={(e) => setSecurityQuestionChoice(e.target.value)}>
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
                  required
                />
              </label>
            )}
            <label className="login-field">
              <span>答案</span>
              <input
                type="text"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder="請記住這個答案，忘記密碼時要用"
                required
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
