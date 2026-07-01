import {
  CHUNK_STRATEGY_VERSION,
  chunkFileContent,
  detectLanguage,
  isIndexablePath,
} from "./chunker";
import { defaultGithubOwner, defaultGithubRepo, getRepoTree, readFile } from "../github-connector";
import { getSupabaseAdmin } from "../supabase/admin";

const GITHUB_API = "https://api.github.com";
const FILE_READ_BATCH_PAUSE_MS = 100;
const FILE_READ_BATCH_SIZE = 20;

export type SyncResult = {
  status: "completed" | "already_up_to_date" | "failed";
  filesIndexed: number;
  chunksCreated: number;
  filesSkipped: number;
  error?: string;
};

type RepositoryRow = {
  id: string;
  owner: string;
  repo: string;
  branch: string;
  indexed_commit_sha: string | null;
  status: string;
};

type FileRow = {
  id: string;
  path: string;
  last_commit_sha: string | null;
};

async function requireGithubToken(): Promise<string> {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error("GITHUB_TOKEN is not configured — set GITHUB_TOKEN to sync GitHub repositories.");
  }
  return token;
}

async function fetchBranchHeadSha(owner: string, repo: string, branch: string): Promise<string> {
  const token = await requireGithubToken();
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { message?: string };
      message = body.message?.trim() || message;
    } catch {
      /* ignore */
    }
    throw new Error(`GitHub API error (${res.status}) fetching branch HEAD: ${message}`);
  }

  const data = (await res.json()) as { sha?: string };
  const sha = data.sha?.trim();
  if (!sha) {
    throw new Error(`GitHub branch commit SHA missing for ${owner}/${repo}@${branch}`);
  }
  return sha;
}

async function getOrCreateRepository(
  owner: string,
  repo: string,
  branch: string,
): Promise<RepositoryRow> {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: selectError } = await supabase
    .from("github_repositories")
    .select("id, owner, repo, branch, indexed_commit_sha, status")
    .eq("owner", owner)
    .eq("repo", repo)
    .eq("branch", branch)
    .maybeSingle();

  if (selectError) {
    throw new Error(`Failed to load github_repositories: ${selectError.message}`);
  }
  if (existing) {
    return existing as RepositoryRow;
  }

  const { data: created, error: insertError } = await supabase
    .from("github_repositories")
    .insert({ owner, repo, branch, status: "NOT_INDEXED" })
    .select("id, owner, repo, branch, indexed_commit_sha, status")
    .single();

  if (insertError || !created) {
    throw new Error(`Failed to create github_repositories row: ${insertError?.message ?? "unknown"}`);
  }

  return created as RepositoryRow;
}

async function markRepositoryStatus(
  repositoryId: string,
  patch: {
    status: string;
    current_head_sha?: string | null;
    indexed_commit_sha?: string | null;
    last_sync_at?: string | null;
  },
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("github_repositories")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", repositoryId);

  if (error) {
    throw new Error(`Failed to update github_repositories: ${error.message}`);
  }
}

async function loadExistingFiles(repositoryId: string): Promise<Map<string, FileRow>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("github_files")
    .select("id, path, last_commit_sha")
    .eq("repository_id", repositoryId);

  if (error) {
    throw new Error(`Failed to load github_files: ${error.message}`);
  }

  return new Map((data ?? []).map((row) => [row.path as string, row as FileRow]));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function syncRepository(params: {
  owner: string;
  repo: string;
  branch?: string;
  force?: boolean;
}): Promise<SyncResult> {
  const owner = params.owner.trim();
  const repo = params.repo.trim();
  const branch = (params.branch ?? "main").trim();
  const force = params.force ?? false;

  if (!owner || !repo) {
    return {
      status: "failed",
      filesIndexed: 0,
      chunksCreated: 0,
      filesSkipped: 0,
      error: "owner and repo are required",
    };
  }

  let repository: RepositoryRow | null = null;

  try {
    repository = await getOrCreateRepository(owner, repo, branch);
    await markRepositoryStatus(repository.id, { status: "INDEXING" });

    const currentHeadSha = await fetchBranchHeadSha(owner, repo, branch);
    await markRepositoryStatus(repository.id, { status: "INDEXING", current_head_sha: currentHeadSha });

    if (!force && repository.indexed_commit_sha === currentHeadSha) {
      await markRepositoryStatus(repository.id, { status: "READY", last_sync_at: new Date().toISOString() });
      return {
        status: "already_up_to_date",
        filesIndexed: 0,
        chunksCreated: 0,
        filesSkipped: 0,
      };
    }

    const tree = await getRepoTree(owner, repo, branch);
    const existingFiles = await loadExistingFiles(repository.id);
    const supabase = getSupabaseAdmin();

    let filesIndexed = 0;
    let chunksCreated = 0;
    let filesSkipped = 0;
    let readsSincePause = 0;

    for (const item of tree) {
      if (!isIndexablePath(item.path, item.size)) {
        filesSkipped += 1;
        continue;
      }

      const existing = existingFiles.get(item.path);
      if (!force && existing?.last_commit_sha === currentHeadSha) {
        filesSkipped += 1;
        continue;
      }

      const content = await readFile(owner, repo, item.path, branch);
      readsSincePause += 1;
      if (readsSincePause >= FILE_READ_BATCH_SIZE) {
        readsSincePause = 0;
        await sleep(FILE_READ_BATCH_PAUSE_MS);
      }

      const chunks = chunkFileContent({ content, path: item.path });
      const language = detectLanguage(item.path);
      const now = new Date().toISOString();

      const { data: fileRow, error: fileError } = await supabase
        .from("github_files")
        .upsert(
          {
            repository_id: repository.id,
            path: item.path,
            language,
            size_bytes: item.size ?? Buffer.byteLength(content, "utf8"),
            last_commit_sha: currentHeadSha,
            indexed_at: now,
          },
          { onConflict: "repository_id,path" },
        )
        .select("id")
        .single();

      if (fileError || !fileRow) {
        throw new Error(`Failed to upsert github_files for ${item.path}: ${fileError?.message ?? "unknown"}`);
      }

      const fileId = fileRow.id as string;

      const { error: deleteError } = await supabase.from("github_chunks").delete().eq("file_id", fileId);
      if (deleteError) {
        throw new Error(`Failed to delete old chunks for ${item.path}: ${deleteError.message}`);
      }

      if (chunks.length > 0) {
        const { error: chunkError } = await supabase.from("github_chunks").insert(
          chunks.map((chunk) => ({
            file_id: fileId,
            chunk_index: chunk.chunkIndex,
            chunk_text: chunk.chunkText,
            chunk_strategy_version: CHUNK_STRATEGY_VERSION,
            indexed_at: now,
          })),
        );
        if (chunkError) {
          throw new Error(`Failed to insert chunks for ${item.path}: ${chunkError.message}`);
        }
        chunksCreated += chunks.length;
      }

      filesIndexed += 1;
      existingFiles.set(item.path, { id: fileId, path: item.path, last_commit_sha: currentHeadSha });
    }

    await markRepositoryStatus(repository.id, {
      status: "READY",
      indexed_commit_sha: currentHeadSha,
      current_head_sha: currentHeadSha,
      last_sync_at: new Date().toISOString(),
    });

    return {
      status: "completed",
      filesIndexed,
      chunksCreated,
      filesSkipped,
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    if (repository) {
      try {
        await markRepositoryStatus(repository.id, { status: "FAILED" });
      } catch {
        /* best effort */
      }
    }
    return {
      status: "failed",
      filesIndexed: 0,
      chunksCreated: 0,
      filesSkipped: 0,
      error,
    };
  }
}

export function resolveSyncDefaults(params: {
  owner?: string;
  repo?: string;
  branch?: string;
}): { owner: string; repo: string; branch: string } {
  const owner = params.owner?.trim() || defaultGithubOwner();
  const repo = params.repo?.trim() || defaultGithubRepo();
  const branch = params.branch?.trim() || process.env.GITHUB_REF?.trim() || "main";
  return { owner, repo, branch };
}
