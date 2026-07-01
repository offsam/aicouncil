import type { EmbeddingProvider } from "./embedding-provider";
import { getSupabaseAdmin } from "../supabase/admin";

export type SemanticSearchResult = {
  chunkId: string;
  filePath: string;
  chunkIndex: number;
  chunkText: string;
  language: string | null;
  score: number;
};

export const DEFAULT_TOP_K = 30;
export const RAG_SEARCH_MODE = "rpc" as const;

function vectorToPgLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
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

function buildKeywordTerms(query: string, expansionTerms?: string[]): string[] {
  const expansionPhrases = [...new Set(expansionTerms ?? expandCodeAuditQuery(query))];
  return [
    ...new Set([
      ...tokenizeQuery(query),
      ...expansionPhrases.map((term) => term.toLowerCase()),
      ...expansionPathTokens(query, expansionPhrases),
    ]),
  ].filter(Boolean);
}

type RpcChunkRow = {
  chunk_id: string;
  file_path: string;
  chunk_index: number;
  chunk_text: string;
  language: string | null;
  score: number | string;
};

function mapRpcRows(rows: RpcChunkRow[]): SemanticSearchResult[] {
  return rows.map((row) => ({
    chunkId: row.chunk_id,
    filePath: row.file_path,
    chunkIndex: row.chunk_index,
    chunkText: row.chunk_text,
    language: row.language,
    score: normalizeScore(row.score),
  }));
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

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("match_github_chunks", {
    p_repository_id: params.repositoryId,
    p_query_embedding: vectorToPgLiteral(queryVector),
    p_match_count: topK,
  });

  if (error) {
    throw new Error(`match_github_chunks RPC failed: ${error.message}`);
  }

  const results = mapRpcRows((data ?? []) as RpcChunkRow[]);
  console.log("[github-rag] semantic results", {
    searchMode: RAG_SEARCH_MODE,
    count: results.length,
  });
  return results;
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
  const terms = buildKeywordTerms(query, params.expansionTerms);
  if (terms.length === 0) {
    return [];
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("keyword_search_github_chunks", {
    p_repository_id: params.repositoryId,
    p_terms: terms,
    p_match_count: topK,
  });

  if (error) {
    throw new Error(`keyword_search_github_chunks RPC failed: ${error.message}`);
  }

  const results = mapRpcRows((data ?? []) as RpcChunkRow[]).filter((row) => row.score > 0);
  console.log("[github-rag] keyword results", {
    searchMode: RAG_SEARCH_MODE,
    termCount: terms.length,
    count: results.length,
  });
  return results;
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
  const startedAt = Date.now();

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

  const results = [...merged.values()]
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

  console.log("[github-rag] hybrid results", {
    searchMode: RAG_SEARCH_MODE,
    semanticCount: semanticResults.length,
    keywordCount: keywordResults.length,
    hybridCount: results.length,
    durationMs: Date.now() - startedAt,
  });

  return results;
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
