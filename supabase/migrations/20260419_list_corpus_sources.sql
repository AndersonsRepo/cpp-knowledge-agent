-- Grouped source listing for the admin Corpus Browser's "Sources" view.
-- Collapses chunks by source_url so admins can see URL-level counts and
-- delete an entire source in one action.

CREATE OR REPLACE FUNCTION list_corpus_sources(
  search_query TEXT DEFAULT NULL,
  result_limit INT DEFAULT 100
)
RETURNS TABLE(
  source_url TEXT,
  title TEXT,
  chunk_count BIGINT,
  ingested_by TEXT,
  latest_ingested_at TIMESTAMPTZ
)
LANGUAGE sql STABLE AS $$
  SELECT
    c.source_url,
    MIN(c.title) AS title,
    COUNT(*)::BIGINT AS chunk_count,
    -- Prefer non-'corpus' provenance so scraper/upload sources show their badge.
    COALESCE(
      (ARRAY_AGG(c.ingested_by ORDER BY
         CASE COALESCE(c.ingested_by, 'corpus')
           WHEN 'corpus' THEN 2
           ELSE 1
         END))[1],
      'corpus'
    ) AS ingested_by,
    MAX(c.ingested_at) AS latest_ingested_at
  FROM chunks c
  WHERE search_query IS NULL
     OR c.source_url ILIKE '%' || search_query || '%'
     OR c.title ILIKE '%' || search_query || '%'
  GROUP BY c.source_url
  ORDER BY COUNT(*) DESC, MAX(c.ingested_at) DESC NULLS LAST
  LIMIT result_limit;
$$;
