-- GITHUB-RAG-V1: repository index schema (embeddings populated in RAG-2)

CREATE TABLE github_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'main',
  current_head_sha TEXT,
  indexed_commit_sha TEXT,
  status TEXT NOT NULL DEFAULT 'NOT_INDEXED'
    CHECK (status IN ('NOT_INDEXED', 'INDEXING', 'READY', 'STALE', 'FAILED')),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner, repo, branch)
);

CREATE TABLE github_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repository_id UUID NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  language TEXT,
  size_bytes INTEGER,
  last_commit_sha TEXT,
  indexed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (repository_id, path)
);

CREATE TABLE github_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES github_files(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  chunk_strategy_version TEXT NOT NULL DEFAULT 'v1',
  embedding_model TEXT,
  embedding_dimension INTEGER,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (file_id, chunk_index)
);

CREATE TABLE github_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES github_chunks(id) ON DELETE CASCADE UNIQUE,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_github_files_repository_id ON github_files(repository_id);
CREATE INDEX idx_github_chunks_file_id ON github_chunks(file_id);
CREATE INDEX idx_github_repositories_status ON github_repositories(status);
CREATE INDEX idx_github_repositories_owner_repo ON github_repositories(owner, repo, branch);
