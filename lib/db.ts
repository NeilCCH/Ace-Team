import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    // Vercel 的 Neon 整合依當初設定的 custom prefix 命名環境變數（這個專案是
    // POSTGRES_*，不是 DATABASE_URL），所以兩個都接受；POSTGRES_URL 是
    // pgbouncer 連線池版本，適合 serverless 短生命週期的函式。
    const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (!connectionString) {
      throw new Error('尚未設定 DATABASE_URL 或 POSTGRES_URL，儀表板與個案記錄功能無法使用。');
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

// 中斷後再繼續個案研討：讀回個案本身（確認擁有者、模組）跟完整的歷史訊息。
export async function getCaseById(caseId: number): Promise<CaseRecord | null> {
  const { rows } = await getPool().query<CaseRecord>(`SELECT * FROM cases WHERE id = $1`, [caseId]);
  return rows[0] ?? null;
}

export interface CaseMessageRecord {
  role: 'user' | 'assistant';
  content: string;
}

export async function getCaseMessages(caseId: number): Promise<CaseMessageRecord[]> {
  const { rows } = await getPool().query<CaseMessageRecord>(
    `SELECT role, content FROM case_messages WHERE case_id = $1 ORDER BY id ASC`,
    [caseId],
  );
  return rows;
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

export interface UserAccount {
  email: string;
  name: string | null;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

function toUserAccount(row: {
  email: string;
  name: string | null;
  note: string | null;
  status: string;
  requested_at: string;
  decided_at: string | null;
  decided_by: string | null;
}): UserAccount {
  return {
    email: row.email,
    name: row.name,
    note: row.note,
    status: row.status as UserAccount['status'],
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
  };
}

export async function getUserAccount(email: string): Promise<UserAccount | null> {
  const { rows } = await getPool().query(
    `SELECT email, name, note, status, requested_at, decided_at, decided_by FROM users WHERE email = $1`,
    [email],
  );
  return rows[0] ? toUserAccount(rows[0]) : null;
}

// 只有登入／改密碼流程需要看到密碼雜湊，admin 列表／決定一律不回傳，避免
// 不小心把雜湊值送到前端。
export async function getPasswordHash(email: string): Promise<string | null> {
  const { rows } = await getPool().query<{ password_hash: string | null }>(
    `SELECT password_hash FROM users WHERE email = $1`,
    [email],
  );
  return rows[0]?.password_hash ?? null;
}

// 申請帳號：新 email 一律建立成 pending（含自己設定的密碼、安全問題與答案）；
// 若之前被拒絕過，重新申請會把狀態收回 pending 重新排審，並更新姓名／
// 備註／密碼／安全問題；已經是 pending 或 approved 則原樣返回，不重複
// 建立、不打擾正在排審或已開通的申請（也不會用這次送來的密碼覆寫掉原本的）。
export async function applyForAccount(
  email: string,
  name: string | null,
  note: string | null,
  passwordHash: string,
  securityQuestion: string,
  securityAnswerHash: string,
): Promise<UserAccount> {
  const existing = await getUserAccount(email);
  if (existing && existing.status !== 'rejected') return existing;
  const { rows } = await getPool().query(
    `INSERT INTO users (email, name, note, password_hash, security_question, security_answer_hash, status, requested_at, decided_at, decided_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', now(), NULL, NULL)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name, note = EXCLUDED.note, password_hash = EXCLUDED.password_hash,
       security_question = EXCLUDED.security_question, security_answer_hash = EXCLUDED.security_answer_hash,
       status = 'pending', requested_at = now(), decided_at = NULL, decided_by = NULL
     RETURNING email, name, note, status, requested_at, decided_at, decided_by`,
    [email, name, note, passwordHash, securityQuestion, securityAnswerHash],
  );
  return toUserAccount(rows[0]);
}

// 設定／更新密碼（自助改密碼、忘記密碼答對安全問題後自助重設、或管理員幫
// 忘記密碼的人重設）。如果這個 email 還沒有 users 資料列（例如管理員第一
// 次設定個人密碼），順便建一筆 status=approved 的紀錄——管理員本來就不受
// status 限制，approved 只是讓這筆紀錄看起來一致，不影響登入判斷。
export async function setUserPassword(email: string, passwordHash: string): Promise<void> {
  await getPool().query(
    `INSERT INTO users (email, password_hash, status, requested_at)
     VALUES ($1, $2, 'approved', now())
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
    [email, passwordHash],
  );
}

// 自助設定／更新安全問題（申請時沒設定過的既有帳號——例如管理員——可以
// 之後在「更改密碼」頁補設定）。
export async function setSecurityQuestion(email: string, question: string, answerHash: string): Promise<void> {
  await getPool().query(
    `INSERT INTO users (email, security_question, security_answer_hash, status, requested_at)
     VALUES ($1, $2, $3, 'approved', now())
     ON CONFLICT (email) DO UPDATE SET security_question = EXCLUDED.security_question, security_answer_hash = EXCLUDED.security_answer_hash`,
    [email, question, answerHash],
  );
}

export async function getSecurityQuestion(email: string): Promise<string | null> {
  const { rows } = await getPool().query<{ security_question: string | null }>(
    `SELECT security_question FROM users WHERE email = $1`,
    [email],
  );
  return rows[0]?.security_question ?? null;
}

// 只有忘記密碼流程需要看到答案雜湊，不對外回傳。
export async function getSecurityAnswerHash(email: string): Promise<string | null> {
  const { rows } = await getPool().query<{ security_answer_hash: string | null }>(
    `SELECT security_answer_hash FROM users WHERE email = $1`,
    [email],
  );
  return rows[0]?.security_answer_hash ?? null;
}

export async function listUserAccounts(): Promise<UserAccount[]> {
  const { rows } = await getPool().query(
    `SELECT email, name, note, status, requested_at, decided_at, decided_by
     FROM users ORDER BY (status = 'pending') DESC, requested_at DESC`,
  );
  return rows.map(toUserAccount);
}

export async function decideUserAccount(
  email: string,
  status: 'approved' | 'rejected',
  decidedBy: string,
): Promise<UserAccount | null> {
  const { rows } = await getPool().query(
    `UPDATE users SET status = $2, decided_at = now(), decided_by = $3 WHERE email = $1
     RETURNING email, name, note, status, requested_at, decided_at, decided_by`,
    [email, status, decidedBy],
  );
  return rows[0] ? toUserAccount(rows[0]) : null;
}

// 刪除帳號申請紀錄（整列移除，密碼／安全問題一起清掉）。不動 cases／
// case_messages——帳號刪掉了，但這個人練習過的歷史紀錄還是保留著，當作
// 稽核與統計用，不會因為帳號被刪而憑空消失。
export async function deleteUserAccount(email: string): Promise<boolean> {
  const { rowCount } = await getPool().query(`DELETE FROM users WHERE email = $1`, [email]);
  return (rowCount ?? 0) > 0;
}

// 每次呼叫 Anthropic API 記一筆用量。寫入失敗不能讓教練回覆跟著失敗，呼叫
// 端（app/api/coach/route.ts）一律包在 try/catch 裡、只記錯誤不拋出。
export async function recordApiUsage(
  userEmail: string,
  moduleId: string,
  inputTokens: number,
  outputTokens: number,
): Promise<void> {
  await getPool().query(
    `INSERT INTO api_usage (user_email, module_id, input_tokens, output_tokens) VALUES ($1, $2, $3, $4)`,
    [userEmail, moduleId, inputTokens, outputTokens],
  );
}

export interface ApiUsageByUser {
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

// 管理後台用：依使用者彙總 token 用量（累計與本月），依累計總量由高到低排序。
export async function getApiUsageByUser(): Promise<ApiUsageByUser[]> {
  const { rows } = await getPool().query<{
    user_email: string;
    call_count: string;
    input_tokens: string;
    output_tokens: string;
    call_count_month: string;
    input_tokens_month: string;
    output_tokens_month: string;
    last_used_at: string | null;
  }>(
    `SELECT
       user_email,
       count(*)::text AS call_count,
       coalesce(sum(input_tokens), 0)::text AS input_tokens,
       coalesce(sum(output_tokens), 0)::text AS output_tokens,
       count(*) FILTER (WHERE created_at >= date_trunc('month', now()))::text AS call_count_month,
       coalesce(sum(input_tokens) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::text AS input_tokens_month,
       coalesce(sum(output_tokens) FILTER (WHERE created_at >= date_trunc('month', now())), 0)::text AS output_tokens_month,
       max(created_at)::text AS last_used_at
     FROM api_usage
     GROUP BY user_email
     ORDER BY (sum(input_tokens) + sum(output_tokens)) DESC`,
  );
  return rows.map((r) => ({
    userEmail: r.user_email,
    callCount: Number(r.call_count),
    inputTokens: Number(r.input_tokens),
    outputTokens: Number(r.output_tokens),
    totalTokens: Number(r.input_tokens) + Number(r.output_tokens),
    callCountThisMonth: Number(r.call_count_month),
    inputTokensThisMonth: Number(r.input_tokens_month),
    outputTokensThisMonth: Number(r.output_tokens_month),
    lastUsedAt: r.last_used_at,
  }));
}
