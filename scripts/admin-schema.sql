-- Admin portal schema additions
-- Run this in Supabase SQL Editor

-- Track how chunks were ingested
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS ingested_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE chunks ADD COLUMN IF NOT EXISTS ingested_by TEXT DEFAULT 'corpus';

-- Scraper schedules
CREATE TABLE IF NOT EXISTS scraper_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  target_url TEXT NOT NULL,
  url_pattern TEXT,
  cron_expression TEXT NOT NULL,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  chunks_added INTEGER DEFAULT 0,
  pages_crawled INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT true,
  requires_auth BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RPC to get corpus source breakdown
CREATE OR REPLACE FUNCTION get_corpus_sources()
RETURNS TABLE(source_url TEXT, count BIGINT, ingested_by TEXT) AS $$
  SELECT source_url, count(*)::BIGINT, COALESCE(ingested_by, 'corpus') as ingested_by
  FROM chunks
  GROUP BY source_url, ingested_by
  ORDER BY count(*) DESC
  LIMIT 100;
$$ LANGUAGE sql;

-- Seed mock scraper schedules for demo
INSERT INTO scraper_schedules (name, target_url, url_pattern, cron_expression, last_run_at, next_run_at, chunks_added, pages_crawled, enabled, requires_auth)
VALUES
  ('CPP Course Catalog', 'https://catalog.cpp.edu', 'catalog.cpp.edu/**', '0 2 * * 0', '2026-04-13T02:00:00Z', '2026-04-20T02:00:00Z', 1147, 843, true, false),
  ('Faculty Directory', 'https://www.cpp.edu/faculty', 'cpp.edu/*/faculty*', '0 3 1 * *', '2026-04-01T03:00:00Z', '2026-05-01T03:00:00Z', 2027, 1250, true, false),
  ('Financial Aid & Scholarships', 'https://www.cpp.edu/financial-aid', 'cpp.edu/financial-aid/*', '0 3 1 */3 *', '2026-01-15T03:00:00Z', '2026-04-15T03:00:00Z', 461, 312, true, false),
  ('BroncoDirect Course Schedule', 'https://direct.cpp.edu', NULL, '0 0 1 1,8 *', NULL, NULL, 0, 0, false, true)
ON CONFLICT DO NOTHING;
