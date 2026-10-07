'use client';

import { useEffect, useRef, useState } from 'react';
import { MODULES } from '@/lib/modules';
import { canContinue, FINAL_FEEDBACK, validReply } from '@/lib/conversation';

type Mode = 'case' | 'roleplay';
type Message = { role: 'user' | 'assistant'; content: string; isError?: boolean };
const CASE_LIMIT = 12000;
const MESSAGE_LIMIT = 4000;

export default function Home() {
  const [moduleId, setModuleId] = useState(MODULES[0].id);
  const [caseText, setCaseText] = useState('');
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>('case');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const busy = useRef(false);
  const sampleRequest = useRef<AbortController | null>(null);
  const [sessionClosed, setSessionClosed] = useState(false);
  const [budgetWarning, setBudgetWarning] = useState(false);
  const pending = useRef<{ messages: Message[]; mode: Mode; afterMode: Mode; close: boolean } | null>(null);
  const cleanMessages = messages.filter((item) => !item.isError);
  const nearLimit = !canContinue([...cleanMessages, { role: 'user', content: draft.trim() || '繼續' }]);

  useEffect(() => () => { sampleRequest.current?.abort(); }, []);

  function cancelSample() {
    sampleRequest.current?.abort();
    sampleRequest.current = null;
    setSampleLoading(false);
  }
  const scrollRef = useRef<HTMLDivElement>(null);
  const module = MODULES.find((item) => item.id === moduleId) ?? MODULES[0];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function askCoach(next: Message[], nextMode: Mode, afterMode: Mode = nextMode, close = false) {
    if (busy.current) return;
    pending.current = { messages: next, mode: nextMode, afterMode, close };
    busy.current = true;
    setLoading(true);
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleId, mode: nextMode, messages: next.map(({ role, content }) => ({ role, content })) }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.reply !== 'string' || !validReply(data.reply)) {
        throw new Error(typeof data.error === 'string' ? data.error : '回覆格式異常，請重試。');
      }
      setMessages((previous) => [...previous, { role: 'assistant', content: data.reply }]);
      setMode(afterMode);
      setSessionClosed(close);
      pending.current = null;
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
    cancelSample();
    const controller = new AbortController();
    sampleRequest.current = controller;
    setSampleLoading(true);
    try {
      const response = await fetch('/api/sample-case?moduleId=' + encodeURIComponent(moduleId), { signal: controller.signal });
      const data = await response.json();
      if (controller.signal.aborted || sampleRequest.current !== controller) return;
      if (!response.ok) throw new Error(data.error ?? '無法載入範例');
      if (typeof data.sampleCase !== 'string') throw new Error('範例格式異常，請重試。');
      setCaseText(data.sampleCase.slice(0, CASE_LIMIT));
    } catch (error) {
      if (!controller.signal.aborted && sampleRequest.current === controller) {
        window.alert(error instanceof Error ? error.message : '無法載入範例');
      }
    } finally {
      if (sampleRequest.current === controller) {
        sampleRequest.current = null;
        setSampleLoading(false);
      }
    }
  }

  function startCase() {
    if (!caseText.trim() || busy.current) return;
    cancelSample();
    const first: Message = { role: 'user', content: caseText.trim() };
    setStarted(true);
    setMessages([first]);
    void askCoach([first], 'case');
  }

  function send() {
    if (!draft.trim() || busy.current || sessionClosed || pending.current) return;
    const next: Message[] = [...messages.filter((item) => !item.isError), { role: 'user', content: draft.trim() }];
    if (!canContinue(next)) { setBudgetWarning(true); return; }
    setBudgetWarning(false);
    setMessages(next);
    setDraft('');
    void askCoach(next, mode);
  }

  async function beginRoleplay() {
    if (busy.current || sessionClosed || pending.current) return;
    const next: Message[] = [...messages.filter((item) => !item.isError),
      { role: 'user', content: '開始角色扮演。請依個案扮演客戶，先說第一句話。' }];
    if (!canContinue(next)) { setBudgetWarning(true); return; }
    setMessages(next);
    // Only switch the badge/button into "roleplay" once the coach actually replied in character —
    // otherwise a failed request left the UI claiming a roleplay was underway that never happened.
    await askCoach(next, 'roleplay');
  }

  async function finishRoleplay() {
    if (busy.current || sessionClosed || pending.current) return;
    const next: Message[] = [...messages.filter((item) => !item.isError),
      { role: 'user', content: '結束對練並取得講評。請停止扮演客戶，給出具體評分、做得好的地方及下一步建議。' }];
    setMessages(next);
    await askCoach(next, 'roleplay', 'case', nearLimit);
  }

  async function closeSession() {
    if (busy.current || sessionClosed || pending.current) return;
    const next: Message[] = [...cleanMessages, { role: 'user', content: FINAL_FEEDBACK }];
    setMessages(next);
    await askCoach(next, mode, 'case', true);
  }

  async function retry() {
    if (busy.current || !pending.current) return;
    const request = pending.current;
    setMessages(request.messages);
    await askCoach(request.messages, request.mode, request.afterMode, request.close);
  }

  function restart() {
    if (busy.current) return;
    cancelSample();
    pending.current = null;
    setSessionClosed(false);
    setBudgetWarning(false);
    setStarted(false);
    setMessages([]);
    setCaseText('');
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
        <p>提供客戶背景、目前進度、客戶說過的關鍵句，以及你希望練習的問題。</p>
        <label className="field-label" htmlFor="case-input">個案內容</label>
        <textarea id="case-input" className="case-input" maxLength={CASE_LIMIT} value={caseText}
          placeholder="例如：客戶約 40 歲，有兩名子女；擔心收入中斷。上次談到保費時說「我想再想想」。我想練習如何回應。"
          onChange={(event) => { cancelSample(); setCaseText(event.target.value); }} />
        <div className="input-meta">{caseText.length.toLocaleString()} / {CASE_LIMIT.toLocaleString()} 字</div>
        <div className="action-row"><button type="button" className="ghost-btn" onClick={loadSample} disabled={sampleLoading}>{sampleLoading ? '載入中…' : '載入範例個案'}</button>
          <button type="button" className="primary-btn" onClick={startCase} disabled={!caseText.trim() || loading}>開始個案分析</button></div>
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
        {(nearLimit || budgetWarning) && !sessionClosed && <p role="status">本次對話接近上限，已保留最後講評空間。請先取得講評，再開啟新個案；目前對話不會被刪減。若只是這則訊息太長，也可縮短後再送出。</p>}
        {sessionClosed && <p role="status">本次對話已完成，可複製講評，再點選「換一個個案」。</p>}
        <div className="conversation-actions"><button type="button" className="ghost-btn" disabled={loading || sessionClosed || !!pending.current} onClick={closeSession}>取得總結並結束本次對話</button>{mode === 'case' ?
          <button type="button" className="ghost-btn" disabled={loading || sessionClosed || nearLimit || !!pending.current} onClick={beginRoleplay}>開始角色扮演</button> :
          <button type="button" className="ghost-btn" disabled={loading || sessionClosed || !!pending.current} onClick={finishRoleplay}>結束對練並取得講評</button>}</div>
        <div className="composer"><label className="sr-only" htmlFor="chat-draft">輸入訊息</label>
          <textarea id="chat-draft" disabled={sessionClosed} rows={2} maxLength={MESSAGE_LIMIT} value={draft}
            placeholder={mode === 'roleplay' ? '對客戶說一句話…' : '回覆教練，或請他示範話術…'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send(); } }} />
          <button type="button" className="primary-btn" onClick={send} disabled={loading || sessionClosed || nearLimit || !!pending.current || !draft.trim()}>送出</button></div>
        <p className="keyboard-hint">⌘ / Ctrl + Enter 送出 · Enter 換行</p>
      </>}
    </main>
  </div>;
}
