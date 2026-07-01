import { readFile } from "../github-connector";
import { createOpenAIEmbeddingProvider } from "./embedding-provider";
import { deduplicateToFiles, hybridSearch, RAG_SEARCH_MODE } from "./search";
import { getSupabaseAdmin } from "../supabase/admin";

export const MAX_RETRIEVED_FILE_CHARS = 20_000;

export type RetrievalResult = {
  mode: "semantic" | "fallback";
  files: Array<{
    path: string;
    content: string;
    score?: number;
    truncated?: boolean;
  }>;
  reason?: string;
};

type RepositoryStatusRow = {
  id: string;
  status: string;
};

function safeSearchErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9\-_]+/gi, "sk-[REDACTED]")
    .replace(/ghp_[A-Za-z0-9]+/gi, "ghp_[REDACTED]")
    .replace(/postgresql:\/\/[^\s]+/gi, "postgresql://[REDACTED]")
    .slice(0, 300);
}

function previewQuery(query: string): string {
  return query.slice(0, 120);
}

async function loadRepository(params: {
  owner: string;
  repo: string;
  branch: string;
}): Promise<RepositoryStatusRow | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("github_repositories")
    .select("id, status")
    .eq("owner", params.owner)
    .eq("repo", params.repo)
    .eq("branch", params.branch)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load github_repositories: ${error.message}`);
  }

  return (data as RepositoryStatusRow | null) ?? null;
}

function truncateContent(content: string): { content: string; truncated: boolean } {
  if (content.length <= MAX_RETRIEVED_FILE_CHARS) {
    return { content, truncated: false };
  }
  return {
    content: content.slice(0, MAX_RETRIEVED_FILE_CHARS),
    truncated: true,
  };
}

export async function retrieveForQuery(params: {
  query: string;
  owner: string;
  repo: string;
  branch?: string;
}): Promise<RetrievalResult> {
  const owner = params.owner.trim();
  const repo = params.repo.trim();
  const branch = (params.branch ?? "main").trim();
  const query = params.query.trim();
  const startedAt = Date.now();

  console.log("[github-rag] retrieval start", {
    owner,
    repo,
    branch,
    queryPreview: previewQuery(query),
    searchMode: RAG_SEARCH_MODE,
  });

  if (!owner || !repo) {
    return {
      mode: "fallback",
      files: [],
      reason: "owner and repo are required",
    };
  }

  if (!query) {
    return {
      mode: "fallback",
      files: [],
      reason: "query is required",
    };
  }

  try {
    const repository = await loadRepository({ owner, repo, branch });
    console.log("[github-rag] repository lookup", {
      found: Boolean(repository),
      repositoryId: repository?.id ?? null,
      status: repository?.status ?? null,
    });

    if (!repository) {
      const reason = "index not ready: NOT_INDEXED";
      console.log("[github-rag] fallback", { reason, durationMs: Date.now() - startedAt });
      return {
        mode: "fallback",
        files: [],
        reason,
      };
    }

    if (repository.status !== "READY") {
      const reason = `index not ready: ${repository.status}`;
      console.log("[github-rag] fallback", { reason, durationMs: Date.now() - startedAt });
      return {
        mode: "fallback",
        files: [],
        reason,
      };
    }

    const searchResults = await hybridSearch({
      query,
      repositoryId: repository.id,
      topK: 30,
      provider: createOpenAIEmbeddingProvider(),
    });
    const topFiles = deduplicateToFiles(searchResults, query, 3);

    const files: RetrievalResult["files"] = [];
    for (const file of topFiles) {
      const rawContent = await readFile(owner, repo, file.path, branch);
      const { content, truncated } = truncateContent(rawContent);
      files.push({
        path: file.path,
        content,
        score: file.score,
        ...(truncated ? { truncated: true } : {}),
      });
    }

    console.log("[github-rag] retrieval complete", {
      mode: "semantic",
      filePaths: files.map((file) => file.path),
      durationMs: Date.now() - startedAt,
    });

    return {
      mode: "semantic",
      files,
    };
  } catch (err) {
    const reason = `rag search failed: ${safeSearchErrorMessage(err)}`;
    console.error("[github-rag] fallback", {
      reason,
      durationMs: Date.now() - startedAt,
    });
    return {
      mode: "fallback",
      files: [],
      reason,
    };
  }
}
