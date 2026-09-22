'use client';

import { useEffect, useRef, useState } from 'react';
import { MODULES } from '@/lib/modules';

type Mode = 'case' | 'roleplay';
type Message = { role: 'user' | 'assistant'; content: string; isError?: boolean };
const CASE_LIMIT = 12000;
const MESSAGE_LIMIT = 4000;
const PERSONAL_DATA = /(?:09\d{2}[-\s]?\d{3}[-\s]?\d{3}|[A-Z][12]\d{8}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/i;

export default function Home() {
  const [moduleId, setModuleId] = useState(MODULES[0].id);
  const [caseText, setCaseText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>('case');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const busy = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const module = MODULES.find((item) => item.id === moduleId) ?? MODULES[0];
  const hasPersonalData = PERSONAL_DATA.test(caseText);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function askCoach(next: Message[], nextMode: Mode) {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, mode: nextMode, messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.reply !== 'string') {
        throw new Error(typeof data.error === 'string' ? data.error : '回覆格式異常，請重試。');
      }
      setMessages((previous) => [...previous, { role: 'assistant', content: data.reply }]);
      return true;
    } catch (error) {
      setMessages((previous) => [...previous, {
        role: 'assistant', content: error instanceof Error ? error.message : '無法連線，請重試。', isError: true,
      }]);
      return false;
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }

  async function loadSample() {
    setSampleLoading(true);
    try {
      const response = await fetch('/api/sample-case?moduleId=' + encodeURIComponent(moduleId));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '無法載入範例');
      setCaseText(data.sampleCase.slice(0, CASE_LIMIT));
      setConfirmed(false);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '無法載入範例');
    } finally {
      setSampleLoading(false);
    }
  }

  function startCase() {
    if (!caseText.trim() || !confirmed || hasPersonalData || busy.current) return;
    const first: Message = { role: 'user', content: caseText.trim() };
    setStarted(true);
    setMessages([first]);
    void askCoach([first], 'case');
  }

  function send() {
    if (!draft.trim() || busy.current) return;
    const next: Message[] = [...messages.filter((item) => !item.isError), { role: 'user', content: draft.trim() }];
    setMessages(next);
    setDraft('');
    void askCoach(next, mode);
  }

  async function beginRoleplay() {
    if (busy.current) return;
    const next: Message[] = [...messages.filter((item) => !item.isError),
      { role: 'user', content: '開始角色扮演。請依個案扮演客戶，先說第一句話。' }];
    setMessages(next);
    // Only switch the badge/button into "roleplay" once the coach actually replied in character —
    // otherwise a failed request left the UI claiming a roleplay was underway that never happened.
    if (await askCoach(next, 'roleplay')) setMode('roleplay');
  }

  async function finishRoleplay() {
    if (busy.current) return;
    const next: Message[] = [...messages.filter((item) => !item.isError),
      { role: 'user', content: '結束對練並取得講評。請停止扮演客戶，給出具體評分、做得好的地方及下一步建議。' }];
    setMessages(next);
    if (await askCoach(next, 'roleplay')) setMode('case');
  }

  async function retry() {
    if (busy.current) return;
    const next = messages.filter((item) => !item.isError);
    const lastContent = next[next.length - 1]?.content ?? '';
    // A failed begin/finish-roleplay attempt never flipped `mode`, so retry must re-derive the
    // intended mode from the message itself rather than trusting current `mode` state.
    const retryMode: Mode = lastContent.startsWith('開始角色扮演') ? 'roleplay' : mode;
    setMessages(next);
    const ok = await askCoach(next, retryMode);
    if (ok && lastContent.startsWith('開始角色扮演')) setMode('roleplay');
    if (ok && lastContent.startsWith('結束對練並取得講評')) setMode('case');
  }

  function restart() {
    if (busy.current) return;
    setStarted(false);
    setMessages([]);
    setCaseText('');
    setConfirmed(false);
    setMode('case');
    setDraft('');
  }

  async function copy(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(index);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      window.alert('無法複製，請檢查剪貼簿權限。');
    }
  }

  return <div className="app-shell">
    <aside className="sidebar" aria-label="教練模組">
      <div className="brand"><div className="brand-title">銷售 AI 教練</div><div className="brand-sub">公勝保經 · 高雄業務中心</div></div>
      <nav className="module-list" aria-label="選擇模組">{MODULES.map((item) =>
        <button type="button" key={item.id} className={`module-item ${item.id === moduleId ? 'active' : ''}`}
          disabled={!item.enabled || loading} aria-current={item.id === moduleId ? 'page' : undefined}
          onClick={() => { restart(); setModuleId(item.id); }}>
          <span className="module-name">{item.name}</span><span className="module-tagline">{item.tagline}</span>
        </button>)}</nav>
    </aside>
    <main className="main">
      <header className="main-header"><div><span className="eyebrow">互動教練</span><h1>{module.name}</h1></div>
        {started && <div className="header-controls"><span className="mode-badge">{mode === 'roleplay' ? '角色扮演中' : '個案分析'}</span>
          <button type="button" className="ghost-btn" disabled={loading} onClick={restart}>換一個個案</button></div>}</header>
      {!started ? <section className="intro-panel" aria-labelledby="case-title">
        <span className="eyebrow">步驟 1 / 提供背景</span><h2 id="case-title">描述你想討論的客戶情境</h2>
        <p>提供客戶背景、目前進度、客戶說過的關鍵句，以及你希望練習的問題。請先移除真實姓名與聯絡方式。</p>
        <label className="field-label" htmlFor="case-input">去識別化個案內容</label>
        <textarea id="case-input" className="case-input" maxLength={CASE_LIMIT} value={caseText}
          placeholder="例如：客戶約 40 歲，有兩名子女；擔心收入中斷。上次談到保費時說「我想再想想」。我想練習如何回應。"
          onChange={(event) => { setCaseText(event.target.value); setConfirmed(false); }} />
        <div className="input-meta">{caseText.length.toLocaleString()} / {CASE_LIMIT.toLocaleString()} 字</div>
        {hasPersonalData && <p className="privacy-warning" role="alert">偵測到可能的電話、身分證字號或電子郵件。請先刪除或改寫。</p>}
        <div className="privacy-panel"><strong>送出前請確認</strong>
          <p>內容會傳送到第三方 AI 服務 Anthropic 進行分析。請勿輸入姓名、電話、身分證字號、地址、保單號碼或其他可辨識個人的資料。自動偵測無法找出所有敏感資訊。</p>
          <label className="confirm-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            我已去識別化，並了解資料傳送方式</label></div>
        <div className="action-row"><button type="button" className="ghost-btn" onClick={loadSample} disabled={sampleLoading}>{sampleLoading ? '載入中…' : '載入範例個案'}</button>
          <button type="button" className="primary-btn" onClick={startCase} disabled={!caseText.trim() || !confirmed || hasPersonalData || loading}>開始個案分析</button></div>
      </section> : <>
        <div className="chat-scroll" ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions text">
          {messages.map((item, index) => <div key={index} className={`bubble-row ${item.role}`}>
            <div className={`bubble ${item.role} ${item.isError ? 'error' : ''}`}><div>{item.content}</div>
              {item.role === 'assistant' && <div className="bubble-actions">
                {item.isError ? <button type="button" onClick={retry} disabled={loading}>重試</button> :
                  <button type="button" onClick={() => copy(item.content, index)}>{copied === index ? '已複製' : '複製回覆'}</button>}
              </div>}</div></div>)}
          {loading && <div className="bubble-row assistant"><div className="bubble assistant pending" role="status">教練正在整理回饋…</div></div>}
        </div>
        <div className="conversation-actions">{mode === 'case' ?
          <button type="button" className="ghost-btn" disabled={loading} onClick={beginRoleplay}>開始角色扮演</button> :
          <button type="button" className="ghost-btn" disabled={loading} onClick={finishRoleplay}>結束對練並取得講評</button>}</div>
        <div className="composer"><label className="sr-only" htmlFor="chat-draft">輸入訊息</label>
          <textarea id="chat-draft" rows={2} maxLength={MESSAGE_LIMIT} value={draft}
            placeholder={mode === 'roleplay' ? '對客戶說一句話…' : '回覆教練，或請他示範話術…'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send(); } }} />
          <button type="button" className="primary-btn" onClick={send} disabled={loading || !draft.trim()}>送出</button></div>
        <p className="keyboard-hint">⌘ / Ctrl + Enter 送出 · Enter 換行</p>
      </>}
    </main>
  </div>;
}
