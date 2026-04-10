-- Enable pgvector
create extension if not exists vector;

-- Chunks table with embeddings
create table chunks (
  id text primary key,
  source_url text not null,
  filename text not null,
  title text not null,
  content text not null,
  section text not null,
  chunk_index integer not null,
  embedding vector(768)
);

-- HNSW index for fast approximate nearest neighbor search
create index chunks_embedding_idx
  on chunks using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Index for source_url dedup in hybrid scoring
create index chunks_source_url_idx on chunks (source_url);

-- RPC function for semantic search
create or replace function match_chunks(
  query_embedding vector(768),
  match_count int default 30
)
returns table (
  id text,
  source_url text,
  title text,
  section text,
  content text,
  similarity float
)
language plpgsql as $$
begin
  return query
    select
      c.id,
      c.source_url,
      c.title,
      c.section,
      c.content,
      1 - (c.embedding <=> query_embedding) as similarity
    from chunks c
    where c.embedding is not null
    order by c.embedding <=> query_embedding
    limit match_count;
end;
$$;
