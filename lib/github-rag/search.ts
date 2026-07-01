import pg from "pg";
import type { EmbeddingProvider } from "./embedding-provider";

export type SemanticSearchResult = {
  chunkId: string;
  filePath: string;
  chunkIndex: number;
  chunkText: string;
  language: string | null;
  score: number;
};

export const DEFAULT_TOP_K = 30;

function vectorToPgLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

async function withPgClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const pwd =
    process.env.SUPABASE_DB_PASSWORD?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const ref = url?.match(/https:\/\/([^.]+)/)?.[1];
  if (!ref || !pwd) {
    throw new Error("Database credentials missing for semantic search");
  }

  const client = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(pwd)}@db.${ref}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function normalizeScore(raw: unknown): number {
  if (typeof raw === "number") {
    return raw;
  }
  return Number.parseFloat(String(raw)) || 0;
}

function tokenizeQuery(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/\W+/).filter((token) => token.length >= 3))];
}

function isCodeAuditQuery(query: string): boolean {
  return /\b(call|invoke|formed|where|function|implement|llm|provider|model)\b/i.test(query);
}

function isTestOrScriptPath(pathLower: string): boolean {
  return /(^|\/)(scripts?|tests?|__tests?__|spec|migrations?|verify)(\/|$)/.test(pathLower);
}

function pathKeywordBoost(filePath: string, query: string): number {
  const queryTokens = tokenizeQuery(query);
  const pathLower = filePath.toLowerCase();
  let boost = 0;

  for (const token of queryTokens) {
    if (pathLower.includes(token)) {
      boost += 0.05;
    }
  }

  const codePathSegments = ["lib/", "app/", "src/", "pages/", "components/"];
  if (codePathSegments.some((segment) => pathLower.includes(segment))) {
    boost += 0.02;
  }

  if (isCodeAuditQuery(query) && isTestOrScriptPath(pathLower)) {
    boost -= 0.05;
  }

  return boost;
}

function pathTieBreakPriority(path: string): number {
  const pathLower = path.toLowerCase();
  const isCoreCode =
    ["lib/", "app/", "src/"].some((segment) => pathLower.includes(segment)) &&
    !isTestOrScriptPath(pathLower);
  if (isCoreCode) {
    return 2;
  }
  if (isTestOrScriptPath(pathLower)) {
    return 0;
  }
  return 1;
}

function expandCodeAuditQuery(query: string): string[] {
  const normalized = query.toLowerCase();
  const shouldExpand =
    /\bllm\b/.test(normalized) ||
    /\bprovider\b/.test(normalized) ||
    /\bmodel\b/.test(normalized) ||
    /\banthropic\b/.test(normalized) ||
    /\bclaude\b/.test(normalized) ||
    /\bcall\b/.test(normalized) ||
    /\binvoke\b/.test(normalized) ||
    /\bformed\b/.test(normalized);

  if (!shouldExpand) {
    return [];
  }

  return [
    "agent-provider-call",
    "callConfiguredAgentProvider",
    "callAnthropicConfigured",
    "invokeAgentForWorkflow",
    "invoke-agent",
    "execute-chat-task",
    "mayor-github-invoke",
    "anthropic",
    "messages",
    "llm",
    "usage",
    "modelId",
    "provider",
  ];
}

function expansionPathTokens(query: string, extraTerms: string[] = []): string[] {
  const terms = [...extraTerms, ...expandCodeAuditQuery(query)];
  const tokens = new Set<string>();
  for (const term of terms) {
    const normalized = term.toLowerCase().trim();
    if (!normalized) continue;
    tokens.add(normalized);
    for (const part of normalized.split("-")) {
      if (part.length >= 3) {
        tokens.add(part);
      }
    }
  }
  return [...tokens];
}

async function fetchKeywordCandidates(
  repositoryId: string,
  patterns: string[],
  mode: "path" | "path_or_text",
  limit: number,
): Promise<
  Array<{
    id: string;
    path: string;
    chunk_index: number;
    chunk_text: string;
    language: string | null;
  }>
> {
  if (patterns.length === 0) {
    return [];
  }

  return withPgClient(async (client) => {
    const ilikePatterns = patterns.map((pattern) => `%${pattern}%`);
    const conditions =
      mode === "path"
        ? ilikePatterns.map((_, index) => `f.path ILIKE $${index + 2}`).join(" OR ")
        : ilikePatterns
            .map((_, index) => `(f.path ILIKE $${index + 2} OR c.chunk_text ILIKE $${index + 2})`)
            .join(" OR ");

    const result = await client.query<{
      id: string;
      path: string;
      chunk_index: number;
      chunk_text: string;
      language: string | null;
    }>(
      `
        SELECT
          c.id,
          f.path,
          c.chunk_index,
          c.chunk_text,
          f.language
        FROM github_chunks c
        JOIN github_files f ON f.id = c.file_id
        WHERE f.repository_id = $1
          AND (${conditions})
        LIMIT $${ilikePatterns.length + 2}
      `,
      [repositoryId, ...ilikePatterns, limit],
    );

    return result.rows;
  });
}

function scoreKeywordMatch(
  filePath: string,
  chunkText: string,
  primaryTokens: string[],
  expansionTokens: string[],
  query: string,
): number {
  const pathLower = filePath.toLowerCase();
  const textLower = chunkText.toLowerCase();
  let score = 0;

  for (const token of expansionTokens) {
    const tokenLower = token.toLowerCase();
    if (pathLower.includes(tokenLower)) {
      score += 0.45;
      if (pathLower.includes(`/${tokenLower}`) || pathLower.endsWith(tokenLower)) {
        score += 0.12;
      }
    }
    if (textLower.includes(tokenLower)) {
      score += 0.12;
    }
  }

  for (const token of primaryTokens) {
    const tokenLower = token.toLowerCase();
    if (pathLower.includes(tokenLower)) {
      score += 0.12;
    }
    if (textLower.includes(tokenLower)) {
      score += 0.06;
    }
  }

  const codePathSegments = ["lib/", "app/", "src/", "pages/", "components/"];
  if (codePathSegments.some((segment) => pathLower.includes(segment))) {
    score += 0.05;
  }

  if (isCodeAuditQuery(query) && isTestOrScriptPath(pathLower)) {
    score -= 0.2;
  }

  return score;
}

export async function semanticSearch(params: {
  query: string;
  repositoryId: string;
  topK?: number;
  provider: EmbeddingProvider;
}): Promise<SemanticSearchResult[]> {
  const query = params.query.trim();
  if (!query) {
    return [];
  }

  const topK = params.topK ?? DEFAULT_TOP_K;
  const [queryVector] = await params.provider.embed([query]);
  if (!queryVector) {
    throw new Error("Embedding provider returned empty query vector");
  }

  return withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ivfflat.probes = 10");

      const result = await client.query<{
        id: string;
        path: string;
        chunk_index: number;
        chunk_text: string;
        language: string | null;
        score: unknown;
      }>(
        `
          SELECT
            c.id,
            f.path,
            c.chunk_index,
            c.chunk_text,
            f.language,
            1 - (e.embedding <=> $2::vector) AS score
          FROM github_embeddings e
          JOIN github_chunks c ON c.id = e.chunk_id
          JOIN github_files f ON f.id = c.file_id
          WHERE f.repository_id = $1
          ORDER BY e.embedding <=> $2::vector
          LIMIT $3
        `,
        [params.repositoryId, vectorToPgLiteral(queryVector), topK],
      );

      await client.query("COMMIT");

      return result.rows.map((row) => ({
        chunkId: row.id,
        filePath: row.path,
        chunkIndex: row.chunk_index,
        chunkText: row.chunk_text,
        language: row.language,
        score: normalizeScore(row.score),
      }));
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

export async function keywordSearch(params: {
  query: string;
  repositoryId: string;
  topK?: number;
  expansionTerms?: string[];
}): Promise<SemanticSearchResult[]> {
  const query = params.query.trim();
  if (!query) {
    return [];
  }

  const topK = params.topK ?? DEFAULT_TOP_K;
  const primaryTokens = tokenizeQuery(query);
  const expansionPhrases = [...new Set(params.expansionTerms ?? expandCodeAuditQuery(query))];
  const expansionTokens = expansionPathTokens(query, expansionPhrases);

  const candidateMap = new Map<
    string,
    {
      id: string;
      path: string;
      chunk_index: number;
      chunk_text: string;
      language: string | null;
    }
  >();

  const expansionFetches = expansionPhrases.map((phrase) =>
    fetchKeywordCandidates(params.repositoryId, [phrase.toLowerCase()], "path_or_text", 12),
  );
  const [primaryRows, ...expansionBatchRows] = await Promise.all([
    fetchKeywordCandidates(params.repositoryId, primaryTokens, "path_or_text", 80),
    ...expansionFetches,
  ]);

  for (const row of [primaryRows, ...expansionBatchRows].flat()) {
    candidateMap.set(row.id, row);
  }

  return [...candidateMap.values()]
    .map((row) => {
      const score = scoreKeywordMatch(
        row.path,
        row.chunk_text,
        primaryTokens,
        expansionTokens,
        query,
      );
      return {
        chunkId: row.id,
        filePath: row.path,
        chunkIndex: row.chunk_index,
        chunkText: row.chunk_text,
        language: row.language,
        score,
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function hybridSearch(params: {
  query: string;
  repositoryId: string;
  topK?: number;
  provider: EmbeddingProvider;
}): Promise<SemanticSearchResult[]> {
  const query = params.query.trim();
  if (!query) {
    return [];
  }

  const topK = params.topK ?? DEFAULT_TOP_K;
  const expandedTerms = expandCodeAuditQuery(query);

  const [semanticResults, keywordResults] = await Promise.all([
    semanticSearch({
      query,
      repositoryId: params.repositoryId,
      topK,
      provider: params.provider,
    }),
    keywordSearch({
      query,
      repositoryId: params.repositoryId,
      topK,
      expansionTerms: expandedTerms,
    }),
  ]);

  const merged = new Map<
    string,
    SemanticSearchResult & { semanticScore: number; keywordScore: number }
  >();

  for (const result of semanticResults) {
    merged.set(result.chunkId, {
      ...result,
      semanticScore: result.score,
      keywordScore: 0,
    });
  }

  for (const result of keywordResults) {
    const existing = merged.get(result.chunkId);
    if (existing) {
      existing.keywordScore = Math.max(existing.keywordScore, result.score);
    } else {
      merged.set(result.chunkId, {
        ...result,
        semanticScore: 0,
        keywordScore: result.score,
      });
    }
  }

  return [...merged.values()]
    .map((result) => ({
      chunkId: result.chunkId,
      filePath: result.filePath,
      chunkIndex: result.chunkIndex,
      chunkText: result.chunkText,
      language: result.language,
      score:
        Math.max(result.semanticScore, result.keywordScore) +
        pathKeywordBoost(result.filePath, query),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export function deduplicateToFiles(
  results: SemanticSearchResult[],
  query: string,
  maxFiles = 3,
): Array<{ path: string; score: number }> {
  void query;

  const bestByPath = new Map<string, number>();
  for (const result of results) {
    const current = bestByPath.get(result.filePath);
    if (current == null || result.score > current) {
      bestByPath.set(result.filePath, result.score);
    }
  }

  return [...bestByPath.entries()]
    .map(([path, score]) => ({ path, score }))
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (Math.abs(diff) <= 0.02) {
        return pathTieBreakPriority(b.path) - pathTieBreakPriority(a.path);
      }
      return diff;
    })
    .slice(0, maxFiles);
}
