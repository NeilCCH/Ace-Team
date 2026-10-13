import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('尚未設定 DATABASE_URL，儀表板與個案記錄功能無法使用。');
    }
    pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

export interface CaseRecord {
  id: number;
  user_email: string;
  module_id: string;
  line: string;
  status: 'in_progress' | 'completed';
  score: number | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export async function createCase(userEmail: string, moduleId: string, line: string, firstMessage: string): Promise<CaseRecord> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<CaseRecord>(
      `INSERT INTO cases (user_email, module_id, line) VALUES ($1, $2, $3) RETURNING *`,
      [userEmail, moduleId, line],
    );
    const created = rows[0];
    await client.query(
      `INSERT INTO case_messages (case_id, role, content) VALUES ($1, 'user', $2)`,
      [created.id, firstMessage],
    );
    await client.query('COMMIT');
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function appendMessage(caseId: number, role: 'user' | 'assistant', content: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO case_messages (case_id, role, content) VALUES ($1, $2, $3)`,
      [caseId, role, content],
    );
    await client.query(`UPDATE cases SET updated_at = now() WHERE id = $1`, [caseId]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function completeCase(caseId: number, score: number | null, summary: string | null): Promise<void> {
  await getPool().query(
    `UPDATE cases SET status = 'completed', score = $2, summary = $3, updated_at = now() WHERE id = $1`,
    [caseId, score, summary],
  );
}

export async function getCaseOwner(caseId: number): Promise<string | null> {
  const { rows } = await getPool().query<{ user_email: string }>(
    `SELECT user_email FROM cases WHERE id = $1`,
    [caseId],
  );
  return rows[0]?.user_email ?? null;
}

export interface DashboardStats {
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

export async function getDashboardStats(userEmail: string): Promise<DashboardStats> {
  const pool = getPool();

  const totalsResult = await pool.query<{
    total: string;
    this_month: string;
    completed: string;
    pending: string;
    avg_score: string | null;
  }>(
    `SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE created_at >= date_trunc('month', now()))::text AS this_month,
       count(*) FILTER (WHERE status = 'completed')::text AS completed,
       count(*) FILTER (WHERE status = 'in_progress')::text AS pending,
       avg(score) FILTER (WHERE score IS NOT NULL)::text AS avg_score
     FROM cases WHERE user_email = $1`,
    [userEmail],
  );
  const totals = totalsResult.rows[0];
  const totalCases = Number(totals.total);
  const completedCases = Number(totals.completed);

  const moduleResult = await pool.query<{ module_id: string; count: string; last_at: string | null }>(
    `SELECT module_id, count(*)::text AS count, max(updated_at)::text AS last_at
     FROM cases WHERE user_email = $1 GROUP BY module_id`,
    [userEmail],
  );

  const recentResult = await pool.query<{
    id: number;
    module_id: string;
    line: string;
    status: string;
    score: number | null;
    summary: string | null;
    created_at: string;
    updated_at: string;
    first_message: string;
  }>(
    `SELECT c.id, c.module_id, c.line, c.status, c.score, c.summary, c.created_at, c.updated_at,
            (SELECT content FROM case_messages m WHERE m.case_id = c.id ORDER BY m.id ASC LIMIT 1) AS first_message
     FROM cases c WHERE c.user_email = $1 ORDER BY c.updated_at DESC LIMIT 8`,
    [userEmail],
  );

  return {
    totalCases,
    casesThisMonth: Number(totals.this_month),
    completedCases,
    completionRate: totalCases > 0 ? Math.round((completedCases / totalCases) * 100) : 0,
    avgScore: totals.avg_score ? Math.round(Number(totals.avg_score)) : null,
    pendingFollowUp: Number(totals.pending),
    moduleCounts: moduleResult.rows.map((r) => ({ moduleId: r.module_id, count: Number(r.count), lastAt: r.last_at })),
    recentCases: recentResult.rows.map((r) => ({
      id: r.id,
      moduleId: r.module_id,
      line: r.line,
      status: r.status,
      score: r.score,
      summary: r.summary,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      firstMessage: r.first_message,
    })),
  };
}
