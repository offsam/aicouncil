import { readFile } from "../github-connector";
import { createOpenAIEmbeddingProvider } from "./embedding-provider";
import { deduplicateToFiles, hybridSearch } from "./search";
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
    if (!repository) {
      return {
        mode: "fallback",
        files: [],
        reason: "index not ready: NOT_INDEXED",
      };
    }

    if (repository.status !== "READY") {
      return {
        mode: "fallback",
        files: [],
        reason: `index not ready: ${repository.status}`,
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

    return {
      mode: "semantic",
      files,
    };
  } catch (err) {
    return {
      mode: "fallback",
      files: [],
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
