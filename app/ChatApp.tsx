'use client';

import { useEffect, useRef, useState } from 'react';
import { CoachLine, LINES, MODULES, modulesForLine } from '@/lib/modules';
import Dashboard from './Dashboard';
import ChangePassword from './ChangePassword';
import LogoutButton from './LogoutButton';

type Mode = 'case' | 'roleplay';
type View = 'coach' | 'dashboard' | 'account';
type Attachment = { name: string; mediaType: string; data: string };
// speaker 記的是這則回覆「實際上是誰在講話」，跟當下的 mode 不完全一樣——
// 角色扮演快結束時那句「結束對練並取得講評」，mode 還是 roleplay，但AI
// 已經切回教練身份在給講評，不是繼續扮演客戶，見 resolveSpeaker()。
type Speaker = 'coach' | 'customer';
type Message = { role: 'user' | 'assistant'; content: string; attachments?: Attachment[]; isError?: boolean; speaker?: Speaker };
const CASE_LIMIT = 12000;
const MESSAGE_LIMIT = 4000;
const MAX_ATTACHMENTS = 4;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
// 跟 route.ts 的 FINISH_MESSAGE_PREFIX 對應——判斷這一輪是不是「結束對練並
// 取得講評」，用來決定回覆的 speaker 要算教練還是客戶。
const FINISH_MESSAGE_PREFIX = '結束對練並取得講評';

function resolveSpeaker(lastUserContent: string, nextMode: Mode): Speaker {
  if (lastUserContent.startsWith(FINISH_MESSAGE_PREFIX)) return 'coach';
  return nextMode === 'roleplay' ? 'customer' : 'coach';
}
// 目前只支援圖片（拍紙本資料最常見的情境）；PDF需要升級Anthropic SDK才能支援，見route.ts註解。
const ACCEPTED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('讀取檔案失敗'));
    reader.readAsDataURL(file);
  });
}

export default function ChatApp({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  const [view, setView] = useState<View>('coach');
  const [lineId, setLineId] = useState<CoachLine>(MODULES[0].line);
  const [moduleId, setModuleId] = useState(MODULES[0].id);
  const [caseText, setCaseText] = useState('');
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<Mode>('case');
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const caseIdRef = useRef<number | null>(null);
  const busy = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const module = MODULES.find((item) => item.id === moduleId) ?? MODULES[0];
  const lineModules = modulesForLine(lineId);
  // 「教練正在整理回饋…」等候字樣要跟即將出現的回覆是誰講的一致——開始／
  // 結束角色扮演那兩個轉場訊息送出時，mode 狀態還沒切換，所以不能直接用
  // mode 判斷，要跟 resolveSpeaker() 用一樣的邏輯從最後一句使用者訊息反推。
  const lastUserMessageContent = [...messages].reverse().find((item) => item.role === 'user')?.content ?? '';
  const pendingSpeaker: Speaker = resolveSpeaker(
    lastUserMessageContent,
    lastUserMessageContent.startsWith('開始角色扮演') || mode === 'roleplay' ? 'roleplay' : 'case',
  );

  function switchLine(nextLine: CoachLine) {
    if (nextLine === lineId || busy.current) return;
    restart();
    setLineId(nextLine);
    setModuleId(modulesForLine(nextLine)[0].id);
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setAttachError(null);
    const room = MAX_ATTACHMENTS - attachments.length;
    const files = Array.from(fileList).slice(0, Math.max(room, 0));
    if (fileList.length > files.length) setAttachError(`最多同時附加 ${MAX_ATTACHMENTS} 個檔案。`);
    for (const file of files) {
      if (!ACCEPTED_ATTACHMENT_TYPES.includes(file.type)) {
        setAttachError(`不支援的檔案格式：${file.name}`);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setAttachError(`檔案太大（超過 5MB）：${file.name}`);
        continue;
      }
      try {
        const data = await fileToBase64(file);
        setAttachments((prev) => [...prev, { name: file.name, mediaType: file.type, data }]);
      } catch {
        setAttachError(`讀取失敗：${file.name}`);
      }
    }
  }

  function removeAttachment(index: number) {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }

  async function askCoach(next: Message[], nextMode: Mode) {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const response = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          moduleId, mode: nextMode, caseId: caseIdRef.current,
          messages: next.map(({ role, content, attachments: atts }) => ({ role, content, attachments: atts })),
        }),
      });
      const data = await response.json();
      if (!response.ok || typeof data.reply !== 'string') {
        throw new Error(typeof data.error === 'string' ? data.error : '回覆格式異常，請重試。');
      }
      if (typeof data.caseId === 'number') caseIdRef.current = data.caseId;
      const lastUserContent = next[next.length - 1]?.content ?? '';
      const speaker = resolveSpeaker(lastUserContent, nextMode);
      setMessages((previous) => [...previous, { role: 'assistant', content: data.reply, speaker }]);
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
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '無法載入範例');
    } finally {
      setSampleLoading(false);
    }
  }

  function startCase() {
    if ((!caseText.trim() && attachments.length === 0) || busy.current) return;
    const first: Message = { role: 'user', content: caseText.trim(), attachments: attachments.length ? attachments : undefined };
    setStarted(true);
    setMessages([first]);
    setAttachments([]);
    setAttachError(null);
    void askCoach([first], 'case');
  }

  function send() {
    if ((!draft.trim() && attachments.length === 0) || busy.current) return;
    const next: Message[] = [...messages.filter((item) => !item.isError),
      { role: 'user', content: draft.trim(), attachments: attachments.length ? attachments : undefined }];
    setMessages(next);
    setDraft('');
    setAttachments([]);
    setAttachError(null);
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
      { role: 'user', content: `${FINISH_MESSAGE_PREFIX}。請停止扮演客戶，給出具體評分、做得好的地方及下一步建議。` }];
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
    if (ok && lastContent.startsWith(FINISH_MESSAGE_PREFIX)) setMode('case');
  }

  function restart() {
    if (busy.current) return;
    setStarted(false);
    setMessages([]);
    setCaseText('');
    setMode('case');
    setDraft('');
    setAttachments([]);
    setAttachError(null);
    caseIdRef.current = null;
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

  const attachmentPicker = <div className="attach-row">
    <input ref={fileInputRef} type="file" multiple hidden accept={ACCEPTED_ATTACHMENT_TYPES.join(',')}
      onChange={(event) => { void handleFiles(event.target.files); event.target.value = ''; }} />
    <button type="button" className="attach-btn" disabled={loading || attachments.length >= MAX_ATTACHMENTS}
      onClick={() => fileInputRef.current?.click()}>＋ 附加圖片</button>
    {attachments.length > 0 && <ul className="attach-list">
      {attachments.map((a, i) => <li key={i} className="attach-chip">
        <img src={`data:${a.mediaType};base64,${a.data}`} alt="" className="attach-thumb" />
        <span className="attach-name" title={a.name}>{a.name}</span>
        <button type="button" className="attach-remove" aria-label={`移除 ${a.name}`} disabled={loading}
          onClick={() => removeAttachment(i)}>×</button>
      </li>)}
    </ul>}
    {attachError && <p className="attach-error">{attachError}</p>}
  </div>;

  return <div className="app-shell">
    <aside className="sidebar" aria-label="教練模組">
      <div className="brand">
        <img src="/icon-192.png" alt="" width={32} height={32} className="brand-mark" />
        <div><div className="brand-title">銷售教練</div><div className="brand-sub">MENTOR</div></div>
      </div>
      <button type="button" className={`dash-nav-btn ${view === 'dashboard' ? 'active' : ''}`} disabled={loading}
        onClick={() => { if (view !== 'dashboard') { restart(); setView('dashboard'); } }}>儀表板</button>
      <div className="line-tabs" role="tablist" aria-label="選擇訓練線">{LINES.map((line) =>
        <button type="button" key={line.id} role="tab" aria-selected={line.id === lineId && view === 'coach'}
          className={`line-tab ${line.id === lineId && view === 'coach' ? 'active' : ''}`} disabled={loading}
          onClick={() => { setView('coach'); switchLine(line.id); }}>{line.name}</button>)}</div>
      <nav className="module-list" aria-label="選擇模組">{lineModules.map((item) =>
        <button type="button" key={item.id} className={`module-item ${item.id === moduleId && view === 'coach' ? 'active' : ''}`}
          disabled={!item.enabled || loading} aria-current={item.id === moduleId && view === 'coach' ? 'page' : undefined}
          onClick={() => { restart(); setView('coach'); setModuleId(item.id); }}>
          <span className="module-name">{item.name}</span><span className="module-tagline">{item.tagline}</span>
        </button>)}</nav>
      {isAdmin && <a href="/admin" className="dash-nav-btn admin-nav-link">帳號審核後台</a>}
      <div className="sidebar-spacer" />
      <div className="sidebar-footer">
        <div className="sidebar-footer-row">
          <div className="sidebar-avatar" aria-hidden="true">{email.charAt(0).toUpperCase()}</div>
          <span className="sidebar-email" title={email}>{email}</span>
        </div>
        <div className="sidebar-footer-row sidebar-footer-actions">
          <button type="button" className="sidebar-password-btn"
            onClick={() => { if (view !== 'account') { restart(); setView('account'); } }}>更改密碼</button>
          <LogoutButton />
        </div>
      </div>
    </aside>
    {view === 'account' ? <main className="main">
      <header className="main-header"><div><span className="eyebrow">帳號設定</span><h1>更改密碼</h1></div></header>
      <ChangePassword />
    </main> : view === 'dashboard' ? <main className="main">
      <header className="main-header"><div><span className="eyebrow">業務員總覽</span><h1>儀表板</h1></div></header>
      <Dashboard />
    </main> : <main className="main">
      <header className="main-header"><div><span className="eyebrow">互動教練</span><h1>{module.name}</h1></div>
        {started && <div className="header-controls">
          <button type="button" className="ghost-btn" disabled={loading} onClick={restart}>換一個個案</button></div>}</header>
      {!started ? <section className="intro-panel" aria-labelledby="case-title">
        <span className="eyebrow">步驟 1 / 提供背景</span><h2 id="case-title">描述你想討論的客戶情境</h2>
        <p>提供客戶背景、目前進度、客戶說過的關鍵句，以及你希望練習的問題。</p>
        <label className="field-label" htmlFor="case-input">個案內容</label>
        <textarea id="case-input" className="case-input" maxLength={CASE_LIMIT} value={caseText}
          placeholder="例如：客戶約 40 歲，有兩名子女；擔心收入中斷。上次談到保費時說「我想再想想」。我想練習如何回應。"
          onChange={(event) => setCaseText(event.target.value)} />
        <div className="input-meta">{caseText.length.toLocaleString()} / {CASE_LIMIT.toLocaleString()} 字</div>
        {attachmentPicker}
        <div className="action-row"><button type="button" className="ghost-btn" onClick={loadSample} disabled={sampleLoading}>{sampleLoading ? '載入中…' : '載入範例個案'}</button>
          <button type="button" className="primary-btn" onClick={startCase} disabled={(!caseText.trim() && attachments.length === 0) || loading}>開始個案分析</button></div>
      </section> : <>
        <div className={`mode-banner ${mode}`} role="status">
          <span className="mode-banner-icon" aria-hidden="true">{mode === 'roleplay' ? '🎭' : '🧭'}</span>
          <div className="mode-banner-text">
            <strong>{mode === 'roleplay' ? '角色扮演中：AI 正在扮演「客戶」' : '個案分析模式：教練依框架卡給建議'}</strong>
            <span>{mode === 'roleplay' ? '接下來的回覆是模擬客戶會說的話，不是教練本人的講評。' : '跟教練來回討論，準備好了再開始角色扮演練習。'}</span>
          </div>
        </div>
        <div className="chat-scroll" ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions text">
          {messages.map((item, index) => <div key={index} className={`bubble-row ${item.role}`}>
            <div className={`bubble ${item.role} ${item.isError ? 'error' : ''} ${item.speaker === 'customer' ? 'customer-voice' : ''}`}>
              {item.role === 'assistant' && !item.isError && <span className={`bubble-speaker ${item.speaker === 'customer' ? 'customer' : 'coach'}`}>
                {item.speaker === 'customer' ? '客戶' : '教練'}
              </span>}
              {item.attachments && item.attachments.length > 0 && <div className="bubble-attachments">
                {item.attachments.map((a, i) =>
                  <img key={i} src={`data:${a.mediaType};base64,${a.data}`} alt={a.name} className="bubble-attach-thumb" />)}
              </div>}
              {item.content && <div>{item.content}</div>}
              {item.role === 'assistant' && <div className="bubble-actions">
                {item.isError ? <button type="button" onClick={retry} disabled={loading}>重試</button> :
                  <button type="button" onClick={() => copy(item.content, index)}>{copied === index ? '已複製' : '複製回覆'}</button>}
              </div>}</div></div>)}
          {loading && <div className="bubble-row assistant"><div className={`bubble assistant pending ${pendingSpeaker === 'customer' ? 'customer-voice' : ''}`} role="status">
            {pendingSpeaker === 'customer' ? '客戶正在輸入…' : '教練正在整理回饋…'}</div></div>}
        </div>
        <div className="conversation-actions">{mode === 'case' ?
          <button type="button" className="ghost-btn" disabled={loading} onClick={beginRoleplay}>開始角色扮演</button> :
          <button type="button" className="ghost-btn" disabled={loading} onClick={finishRoleplay}>結束對練並取得講評</button>}</div>
        {attachmentPicker}
        <div className="composer"><label className="sr-only" htmlFor="chat-draft">輸入訊息</label>
          <textarea id="chat-draft" rows={2} maxLength={MESSAGE_LIMIT} value={draft}
            placeholder={mode === 'roleplay' ? '對客戶說一句話…' : '回覆教練，或請他示範話術…'}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); send(); } }} />
          <button type="button" className="primary-btn" onClick={send} disabled={loading || (!draft.trim() && attachments.length === 0)}>送出</button></div>
        <p className="keyboard-hint">⌘ / Ctrl + Enter 送出 · Enter 換行</p>
      </>}
    </main>}
  </div>;
}
