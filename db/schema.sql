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
