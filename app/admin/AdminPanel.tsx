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

  useEffect(() => { void load(); }, []);

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

  return (
    <div className="admin-wrap">
      <div className="admin-card">
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
            </div>
          </li>)}
        </ul>}
      </div>
    </div>
  );
}
