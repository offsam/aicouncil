-- RAG-3-PROD-DB-FIX: GitHub RAG search via Supabase RPC (no direct pg in runtime)

CREATE OR REPLACE FUNCTION match_github_chunks(
  p_repository_id uuid,
  p_query_embedding vector(1536),
  p_match_count integer DEFAULT 30
)
RETURNS TABLE (
  chunk_id uuid,
  file_path text,
  chunk_index integer,
  chunk_text text,
  language text,
  score double precision
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('ivfflat.probes', '10', true);
  RETURN QUERY
  SELECT
    c.id AS chunk_id,
    f.path AS file_path,
    c.chunk_index,
    c.chunk_text,
    f.language,
    (1 - (e.embedding <=> p_query_embedding))::double precision AS score
  FROM github_embeddings e
  JOIN github_chunks c ON c.id = e.chunk_id
  JOIN github_files f ON f.id = c.file_id
  WHERE f.repository_id = p_repository_id
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

CREATE OR REPLACE FUNCTION keyword_search_github_chunks(
  p_repository_id uuid,
  p_terms text[],
  p_match_count integer DEFAULT 30
)
RETURNS TABLE (
  chunk_id uuid,
  file_path text,
  chunk_index integer,
  chunk_text text,
  language text,
  score double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    c.id AS chunk_id,
    f.path AS file_path,
    c.chunk_index,
    c.chunk_text,
    f.language,
    (
      CASE
        WHEN EXISTS (
          SELECT 1 FROM unnest(p_terms) t
          WHERE lower(f.path) LIKE '%' || lower(t) || '%'
        ) THEN 2.0 ELSE 0.0
      END
      +
      (
        SELECT COUNT(*)::double precision * 0.2
        FROM unnest(p_terms) t
        WHERE lower(c.chunk_text) LIKE '%' || lower(t) || '%'
      )
      +
      CASE
        WHEN lower(f.path) LIKE 'lib/%'
          OR lower(f.path) LIKE 'app/%'
          OR lower(f.path) LIKE 'src/%'
          OR lower(f.path) LIKE 'pages/%'
          OR lower(f.path) LIKE 'components/%'
        THEN 0.2 ELSE 0.0
      END
      -
      CASE
        WHEN lower(f.path) ~ '(^|/)(scripts?|tests?|__tests?__|spec|migrations?|verify)(/|$)'
        THEN 0.4 ELSE 0.0
      END
    ) AS score
  FROM github_chunks c
  JOIN github_files f ON f.id = c.file_id
  WHERE f.repository_id = p_repository_id
    AND EXISTS (
      SELECT 1 FROM unnest(p_terms) t
      WHERE lower(f.path) LIKE '%' || lower(t) || '%'
         OR lower(c.chunk_text) LIKE '%' || lower(t) || '%'
    )
  ORDER BY score DESC
  LIMIT p_match_count;
$$;

GRANT EXECUTE ON FUNCTION match_github_chunks(uuid, vector, integer) TO service_role;
GRANT EXECUTE ON FUNCTION keyword_search_github_chunks(uuid, text[], integer) TO service_role;
