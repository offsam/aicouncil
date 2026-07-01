-- Vector similarity search index for github_embeddings (RAG-2)
CREATE INDEX IF NOT EXISTS idx_github_embeddings_vector
ON github_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
