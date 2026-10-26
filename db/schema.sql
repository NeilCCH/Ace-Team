-- 銷售 AI 教練．個案記錄與儀表板資料表
-- 在 Neon 的 SQL Editor 貼上整段執行一次即可（可重複執行，不會重複建表）。

CREATE TABLE IF NOT EXISTS cases (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  module_id TEXT NOT NULL,
  line TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress', -- in_progress | completed
  score INTEGER,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS case_messages (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cases_user_email ON cases(user_email);
CREATE INDEX IF NOT EXISTS idx_cases_user_updated ON cases(user_email, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_case_messages_case_id ON case_messages(case_id);

-- 帳號申請與開通。ALLOWED_EMAILS 環境變數列的帳號（管理員）不受此表限制，
-- 一律可登入（開通別人帳號的人本身不能卡在「等人開通」的雞生蛋問題）；
-- 其他 email 一定要先申請、狀態是 approved、且密碼正確才能登入。
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  note TEXT,
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  decided_by TEXT
);

-- 如果是舊資料庫、users 表已經存在但缺欄位，補上去（重複執行安全）。
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 每次呼叫 Anthropic API 記一筆用量，供管理後台統計每人的 token 使用量。
-- 寫入失敗不影響教練回覆（見 app/api/coach/route.ts），單純是統計用途。
CREATE TABLE IF NOT EXISTS api_usage (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  module_id TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_user_email ON api_usage(user_email);
CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at);

-- 呼叫 Anthropic API 失敗時記一筆（例如額度不足的 402 billing_error、
-- 連線逾時等），供管理後台顯示警示，不用等業務員回報「AI壞了」才發現。
CREATE TABLE IF NOT EXISTS api_errors (
  id BIGSERIAL PRIMARY KEY,
  user_email TEXT NOT NULL,
  status INTEGER,
  error_type TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_errors_created_at ON api_errors(created_at);
