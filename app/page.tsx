'use client';

import { useEffect, useRef, useState } from 'react';
import { MODULES } from '@/lib/modules';

type Role = 'user' | 'assistant';

interface ChatMessage {
  role: Role;
  content: string;
  isError?: boolean;
}

export default function Home() {
  const activeModule = MODULES.find((m) => m.enabled) ?? MODULES[0];
  const [moduleId, setModuleId] = useState(activeModule.id);
  const [roleplay, setRoleplay] = useState(false);
  const [caseText, setCaseText] = useState('');
  const [started, setStarted] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function sendToCoach(nextMessages: ChatMessage[]) {
    setLoading(true);
    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId,
          mode: roleplay ? 'roleplay' : 'case',
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.error ?? '發生錯誤', isError: true }]);
        return;
      }
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '無法連線到教練，請確認網路後再試一次。', isError: true },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function loadSampleCase() {
    setSampleLoading(true);
    try {
      const res = await fetch(`/api/sample-case?moduleId=${moduleId}`);
      const data = await res.json();
      if (res.ok) setCaseText(data.sampleCase);
    } finally {
      setSampleLoading(false);
    }
  }

  async function startCase() {
    if (!caseText.trim()) return;
    const first: ChatMessage = { role: 'user', content: caseText.trim() };
    setStarted(true);
    setMessages([first]);
    await sendToCoach([first]);
  }

  async function sendFollowUp() {
    if (!draft.trim() || loading) return;
    const next: ChatMessage[] = [...messages, { role: 'user', content: draft.trim() }];
    setMessages(next);
    setDraft('');
    await sendToCoach(next);
  }

  function restart() {
    setStarted(false);
    setMessages([]);
    setCaseText('');
    setRoleplay(false);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title">銷售 AI 教練</div>
          <div className="brand-sub">公勝保經 · 高雄業務中心</div>
        </div>
        <nav className="module-list">
          {MODULES.map((m) => (
            <button
              key={m.id}
              className={`module-item ${m.id === moduleId ? 'active' : ''}`}
              disabled={!m.enabled}
              onClick={() => {
                if (!m.enabled) return;
                setModuleId(m.id);
                restart();
              }}
            >
              <div className="module-name">{m.name}</div>
              <div className="module-tagline">{m.tagline}</div>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        <div className="main-header">
          <h1>{MODULES.find((m) => m.id === moduleId)?.name}</h1>
          <div className="header-controls">
            {started && (
              <label className="toggle">
                角色扮演對練
                <button
                  type="button"
                  className={`switch ${roleplay ? 'on' : ''}`}
                  onClick={() => setRoleplay((v) => !v)}
                  aria-pressed={roleplay}
                />
              </label>
            )}
            {started && (
              <button className="ghost-btn" onClick={restart}>
                換一個個案
              </button>
            )}
          </div>
        </div>

        {!started ? (
          <div className="intro-panel">
            <h2>貼上這個個案的 CN 表或面談紀錄</h2>
            <p>
              把業務員填的客戶需求表（背景／現況／他說的關鍵句）貼進來，教練會依「需求分析．找痛點」框架，
              找出命中的切點、目前卡在痛點深化的第幾步，並給出下一步的具體話術建議。
            </p>
            <textarea
              className="case-input"
              placeholder="貼上 CN 客戶需求表或面談紀錄…"
              value={caseText}
              onChange={(e) => setCaseText(e.target.value)}
            />
            <div className="action-row">
              <button className="ghost-btn" onClick={loadSampleCase} disabled={sampleLoading}>
                {sampleLoading ? '載入中…' : '貼上範例個案'}
              </button>
              <button className="primary-btn" onClick={startCase} disabled={!caseText.trim()}>
                開始個案分析
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="chat-scroll" ref={scrollRef}>
              {messages.map((m, i) => (
                <div key={i} className={`bubble-row ${m.role}`}>
                  <div className={`bubble ${m.role} ${m.isError ? 'error' : ''}`}>{m.content}</div>
                </div>
              ))}
              {loading && (
                <div className="bubble-row assistant">
                  <div className="bubble assistant pending">教練正在整理回饋…</div>
                </div>
              )}
            </div>
            <div className="composer">
              <input
                placeholder={roleplay ? '對客戶說一句話…' : '回覆教練，或請他示範話術…'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendFollowUp();
                }}
              />
              <button className="primary-btn" onClick={sendFollowUp} disabled={loading || !draft.trim()}>
                送出
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
