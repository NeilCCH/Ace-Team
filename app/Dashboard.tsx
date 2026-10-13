'use client';

import { useEffect, useState } from 'react';
import { getModule } from '@/lib/modules';

interface DashboardStats {
  totalCases: number;
  casesThisMonth: number;
  completedCases: number;
  completionRate: number;
  avgScore: number | null;
  pendingFollowUp: number;
  moduleCounts: { moduleId: string; count: number; lastAt: string | null }[];
  recentCases: {
    id: number;
    moduleId: string;
    line: string;
    status: string;
    score: number | null;
    summary: string | null;
    createdAt: string;
    updatedAt: string;
    firstMessage: string;
  }[];
}

function formatDate(iso: string | null): string {
  if (!iso) return '尚未練習';
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/dashboard')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? '讀取失敗');
        if (!cancelled) setStats(data);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : '讀取失敗'); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <section className="dash-wrap"><p className="dash-error">{error}</p></section>;
  if (!stats) return <section className="dash-wrap"><p className="dash-loading">載入中…</p></section>;

  return (
    <section className="dash-wrap">
      <div className="dash-kpis">
        <div className="card kpi"><div className="k-top"><span className="k-lab">累積個案數</span></div>
          <div className="k-val">{stats.totalCases}</div><div className="k-tag">本月 {stats.casesThisMonth}</div></div>
        <div className="card kpi"><div className="k-top"><span className="k-lab">完成個案</span></div>
          <div className="k-val">{stats.completedCases}</div><div className="k-tag">{stats.completionRate}% 完成率</div></div>
        <div className="card kpi"><div className="k-top"><span className="k-lab">平均分數</span></div>
          <div className="k-val">{stats.avgScore ?? '—'}</div><div className="k-tag">滿分 100</div></div>
        <div className="card kpi"><div className="k-top"><span className="k-lab">待跟進個案</span></div>
          <div className="k-val">{stats.pendingFollowUp}</div><div className="k-tag">尚未取得講評</div></div>
      </div>

      <div className="dash-section">
        <h3>模組練習次數</h3>
        <ul className="dash-list">
          {stats.moduleCounts.length === 0 && <li className="dash-empty">還沒有練習紀錄</li>}
          {stats.moduleCounts.map((m) => {
            const mod = getModule(m.moduleId);
            return <li key={m.moduleId}>
              <span className="dash-list-name">{mod?.name ?? m.moduleId}</span>
              <span className="dash-list-meta">已練習 {m.count} 次 · 最近一次 {formatDate(m.lastAt)}</span>
            </li>;
          })}
        </ul>
      </div>

      <div className="dash-section">
        <h3>最近個案</h3>
        <ul className="dash-list dash-cases">
          {stats.recentCases.length === 0 && <li className="dash-empty">還沒有個案紀錄</li>}
          {stats.recentCases.map((c) => {
            const mod = getModule(c.moduleId);
            return <li key={c.id}>
              <span className="dash-case-line">{c.line}</span>
              <div className="dash-case-body">
                <p className="dash-case-text">{c.firstMessage}</p>
                <span className="dash-list-meta">{mod?.name ?? c.moduleId} · {formatDate(c.updatedAt)}</span>
              </div>
              <span className={`dash-case-status ${c.status}`}>
                {c.status === 'completed' ? `已完成${c.score !== null ? ' · ' + c.score + '分' : ''}` : '進行中'}
              </span>
            </li>;
          })}
        </ul>
      </div>
    </section>
  );
}
