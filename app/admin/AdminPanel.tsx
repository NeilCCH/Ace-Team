'use client';

import { useEffect, useState } from 'react';

interface UserAccount {
  email: string;
  name: string | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

interface ApiUsage {
  userEmail: string;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  callCountThisMonth: number;
  inputTokensThisMonth: number;
  outputTokensThisMonth: number;
  lastUsedAt: string | null;
}

interface RecentApiError {
  userEmail: string;
  status: number | null;
  errorType: string | null;
  message: string;
  createdAt: string;
}

function errorLabel(e: RecentApiError): string {
  if (e.errorType === 'billing_error') return '額度不足';
  if (e.errorType) return e.errorType;
  if (e.status) return `狀態碼 ${e.status}`;
  return '連線失敗';
}

interface CostSummary {
  currency: string;
  totalUsd: number;
  periodStart: string;
  periodEnd: string;
}

const STATUS_LABEL: Record<UserAccount['status'], string> = {
  pending: '待審核',
  approved: '已開通',
  rejected: '已拒絕',
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AdminPanel() {
  const [users, setUsers] = useState<UserAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [usage, setUsage] = useState<ApiUsage[] | null>(null);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [recentErrors, setRecentErrors] = useState<RecentApiError[] | null>(null);
  const [cost, setCost] = useState<CostSummary | null>(null);
  const [costError, setCostError] = useState<string | null>(null);
  const [costNotConfigured, setCostNotConfigured] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '讀取失敗');
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : '讀取失敗');
    }
  }

  async function loadUsage() {
    try {
      const res = await fetch('/api/admin/usage');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '讀取失敗');
      setUsage(data.usage);
      setRecentErrors(data.recentErrors ?? []);
    } catch (err) {
      setUsageError(err instanceof Error ? err.message : '讀取失敗');
    }
  }

  // 「尚未設定 Admin API Key」是預期中的狀態（這個功能本來就選配），用
  // 柔和的提示顯示；其他查詢失敗（金鑰無效、Anthropic那邊出錯）才當成
  // 真的錯誤標紅處理。
  async function loadCost() {
    try {
      const res = await fetch('/api/admin/cost');
      const data = await res.json();
      if (res.status === 501) {
        setCostNotConfigured(true);
        setCostError(data.error ?? '尚未設定。');
        return;
      }
      if (!res.ok) throw new Error(data.error ?? '讀取失敗');
      setCost(data);
    } catch (err) {
      setCostError(err instanceof Error ? err.message : '讀取失敗');
    }
  }

  useEffect(() => { void load(); void loadUsage(); void loadCost(); }, []);

  async function decide(email: string, decision: 'approved' | 'rejected') {
    setBusyEmail(email);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '更新失敗');
      setUsers((prev) => prev?.map((u) => (u.email === email ? data.user : u)) ?? null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '更新失敗');
    } finally {
      setBusyEmail(null);
    }
  }

  async function deleteAccount(email: string) {
    if (!window.confirm(`確定要刪除 ${email} 這個帳號申請嗎？刪除後對方要重新申請才能再使用（這個人過去練習過的個案記錄不會被刪除）。`)) return;
    setBusyEmail(email);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '刪除失敗');
      setUsers((prev) => prev?.filter((u) => u.email !== email) ?? null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setBusyEmail(null);
    }
  }

  async function resetPassword(email: string) {
    const newPassword = window.prompt(`幫 ${email} 設一組暫用密碼（至少 8 個字元），再自己用LINE等方式告訴對方：`);
    if (!newPassword) return;
    if (newPassword.length < 8) {
      window.alert('密碼至少需要 8 個字元。');
      return;
    }
    setBusyEmail(email);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '重設失敗');
      window.alert('密碼已重設，請把新密碼告訴對方。');
    } catch (err) {
      window.alert(err instanceof Error ? err.message : '重設失敗');
    } finally {
      setBusyEmail(null);
    }
  }

  return (
    <div className="admin-wrap">
      <div className="admin-card">
        {recentErrors && recentErrors.length > 0 && <div className="admin-alert">
          <strong>⚠️ 最近 7 天內有 AI 教練呼叫失敗，請留意</strong>
          <ul>
            {recentErrors.map((e, i) => <li key={i}>
              {formatDate(e.createdAt)} · {e.userEmail} · {errorLabel(e)}
            </li>)}
          </ul>
        </div>}
        <div className="admin-header">
          <h1>帳號申請審核</h1>
          <a className="ghost-btn" href="/">回主畫面</a>
        </div>
        {error && <p className="login-error">{error}</p>}
        {!users && !error && <p className="dash-loading">載入中…</p>}
        {users && users.length === 0 && <p className="dash-empty">還沒有任何申請。</p>}
        {users && users.length > 0 && <ul className="admin-list">
          {users.map((u) => <li key={u.email} className="admin-row">
            <div className="admin-row-main">
              <span className={`admin-status admin-status-${u.status}`}>{STATUS_LABEL[u.status]}</span>
              <div className="admin-row-info">
                <div className="admin-row-email">{u.email}{u.name ? `（${u.name}）` : ''}</div>
                {u.note && <div className="admin-row-note">{u.note}</div>}
                <div className="admin-row-meta">
                  申請於 {formatDate(u.requestedAt)}
                  {u.decidedAt && u.decidedBy ? ` · ${STATUS_LABEL[u.status]}於 ${formatDate(u.decidedAt)} by ${u.decidedBy}` : ''}
                </div>
              </div>
            </div>
            <div className="admin-row-actions">
              {u.status !== 'approved' && <button type="button" className="primary-btn" disabled={busyEmail === u.email}
                onClick={() => decide(u.email, 'approved')}>開通</button>}
              {u.status !== 'rejected' && <button type="button" className="ghost-btn" disabled={busyEmail === u.email}
                onClick={() => decide(u.email, 'rejected')}>{u.status === 'approved' ? '撤銷' : '拒絕'}</button>}
              {u.status === 'approved' && <button type="button" className="ghost-btn" disabled={busyEmail === u.email}
                onClick={() => resetPassword(u.email)}>重設密碼</button>}
              <button type="button" className="ghost-btn admin-delete-btn" disabled={busyEmail === u.email}
                onClick={() => deleteAccount(u.email)}>刪除</button>
            </div>
          </li>)}
        </ul>}

        <div className="admin-usage-section">
          <div className="admin-header"><h1>API Token 使用量</h1></div>
          {cost && <p className="admin-cost-summary">
            本月（至今，UTC）已花費約 <strong>${cost.totalUsd.toFixed(2)} {cost.currency}</strong>
            <span className="admin-cost-note">資料來源：Anthropic Cost Report，更新可能有數分鐘延遲；這是「花了多少」，不是「剩多少」——真正的剩餘額度仍要到 Anthropic Console 查看。</span>
          </p>}
          {costNotConfigured && <p className="admin-cost-summary muted">{costError}</p>}
          {costError && !costNotConfigured && !cost && <p className="login-error">{costError}</p>}
          {usageError && <p className="login-error">{usageError}</p>}
          {!usage && !usageError && <p className="dash-loading">載入中…</p>}
          {usage && usage.length === 0 && <p className="dash-empty">還沒有使用紀錄。</p>}
          {usage && usage.length > 0 && <div className="admin-usage-table-wrap">
            <table className="admin-usage-table">
              <thead>
                <tr>
                  <th>帳號</th>
                  <th>本月呼叫</th>
                  <th>本月 Token（輸入／輸出）</th>
                  <th>累計呼叫</th>
                  <th>累計 Token（輸入／輸出）</th>
                  <th>最後使用</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => <tr key={u.userEmail}>
                  <td>{u.userEmail}</td>
                  <td className="num">{u.callCountThisMonth.toLocaleString()}</td>
                  <td className="num">{u.inputTokensThisMonth.toLocaleString()} ／ {u.outputTokensThisMonth.toLocaleString()}</td>
                  <td className="num">{u.callCount.toLocaleString()}</td>
                  <td className="num">{u.inputTokens.toLocaleString()} ／ {u.outputTokens.toLocaleString()}</td>
                  <td>{u.lastUsedAt ? formatDate(u.lastUsedAt) : '—'}</td>
                </tr>)}
              </tbody>
            </table>
          </div>}
        </div>
      </div>
    </div>
  );
}
