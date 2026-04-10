-- Analytics table for persistent query tracking (replaces ephemeral JSONL on Vercel)
CREATE TABLE IF NOT EXISTS analytics (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_id TEXT NOT NULL DEFAULT '',
  query TEXT,
  message_count INT DEFAULT 0,
  provider TEXT,
  response_time_ms INT DEFAULT 0,
  success BOOLEAN DEFAULT true,
  no_answer BOOLEAN DEFAULT false,
  status_code INT DEFAULT 200,
  error_message TEXT,
  tool_calls JSONB DEFAULT '[]',
  searches JSONB DEFAULT '[]',
  source_urls JSONB DEFAULT '[]',
  top_search_score DOUBLE PRECISION,
  avg_search_score DOUBLE PRECISION,
  result_count INT DEFAULT 0,
  search_modes JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_analytics_created_at ON analytics (created_at DESC);
