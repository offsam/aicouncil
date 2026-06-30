export type GitHubTreeItem = { path: string; type: "blob" | "tree"; size?: number };

export type GitHubSearchResult = {
  path: string;
  repository: string;
  score: number;
  textMatches?: { fragment: string }[];
};

const GITHUB_API = "https://api.github.com";
const MAX_FILE_BYTES = 1_048_576;

function requireGithubToken(): string {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN is not configured — set GITHUB_TOKEN in environment to use GitHub tools.",
    );
  }
  return token;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function readGithubErrorMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message?.trim() || null;
  } catch {
    return null;
  }
}

function rateLimitMessage(status: number, context: string, apiMessage: string | null): string {
  if (status === 429) {
    return `GitHub API rate limit exceeded (429) while ${context}. Try again later.`;
  }
  if (status === 403) {
    const lower = (apiMessage ?? "").toLowerCase();
    if (lower.includes("rate limit") || lower.includes("abuse")) {
      return `GitHub API rate limit or abuse detection (403) while ${context}: ${apiMessage ?? "forbidden"}`;
    }
  }
  return `GitHub API error (${status}) while ${context}: ${apiMessage ?? "request failed"}`;
}

async function githubFetch(
  url: string,
  context: string,
  accept = "application/vnd.github+json",
): Promise<Response> {
  const token = requireGithubToken();
  const res = await fetch(url, {
    headers: {
      ...githubHeaders(token),
      Accept: accept,
    },
  });
  if (res.status === 403 || res.status === 429) {
    const apiMessage = await readGithubErrorMessage(res);
    throw new Error(rateLimitMessage(res.status, context, apiMessage));
  }
  if (!res.ok) {
    const apiMessage = await readGithubErrorMessage(res);
    throw new Error(`GitHub API error (${res.status}) while ${context}: ${apiMessage ?? "request failed"}`);
  }
  return res;
}

async function resolveBranchSha(owner: string, repo: string, branch: string): Promise<string> {
  const res = await githubFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`,
    `resolving branch ${owner}/${repo}@${branch}`,
  );
  const data = (await res.json()) as { object?: { sha?: string } };
  const sha = data.object?.sha?.trim();
  if (!sha) {
    throw new Error(`GitHub branch ref missing for ${owner}/${repo}@${branch}`);
  }
  return sha;
}

export async function getRepoTree(
  owner: string,
  repo: string,
  branch = "main",
): Promise<GitHubTreeItem[]> {
  const treeSha = await resolveBranchSha(owner, repo, branch);
  const res = await githubFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    `fetching tree for ${owner}/${repo}@${branch}`,
  );
  const data = (await res.json()) as {
    tree?: Array<{ path?: string; type?: string; size?: number }>;
  };

  return (data.tree ?? [])
    .filter((item) => item.type === "blob" && item.path)
    .filter((item) => item.size == null || item.size <= MAX_FILE_BYTES)
    .map((item) => ({
      path: item.path!,
      type: "blob" as const,
      size: item.size,
    }));
}

export async function readFile(
  owner: string,
  repo: string,
  path: string,
  branch = "main",
): Promise<string> {
  const res = await githubFetch(
    `${GITHUB_API}/repos/${owner}/${repo}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}?ref=${encodeURIComponent(branch)}`,
    `reading file ${owner}/${repo}/${path}`,
  );
  const data = (await res.json()) as {
    content?: string;
    encoding?: string;
    size?: number;
  };

  if (data.encoding !== "base64" || !data.content) {
    throw new Error(`GitHub file ${path} is not base64-encoded text content`);
  }
  if (data.size != null && data.size > MAX_FILE_BYTES) {
    throw new Error(`GitHub file ${path} exceeds 1MB limit (${data.size} bytes)`);
  }

  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
}

export async function searchCode(
  owner: string,
  repo: string,
  query: string,
): Promise<GitHubSearchResult[]> {
  const q = `${query} repo:${owner}/${repo}`;
  const res = await githubFetch(
    `${GITHUB_API}/search/code?q=${encodeURIComponent(q)}&per_page=30`,
    `searching code in ${owner}/${repo}`,
    "application/vnd.github.text-match+json",
  );
  const data = (await res.json()) as {
    items?: Array<{
      path?: string;
      repository?: { full_name?: string };
      score?: number;
      text_matches?: Array<{ fragment?: string }>;
    }>;
  };

  return (data.items ?? []).map((item) => ({
    path: item.path ?? "",
    repository: item.repository?.full_name ?? `${owner}/${repo}`,
    score: item.score ?? 0,
    textMatches: item.text_matches
      ?.filter((m) => m.fragment)
      .map((m) => ({ fragment: m.fragment! })),
  }));
}

function parseGithubRepoEnv(): { owner: string; repo: string } | null {
  const repoFull = process.env.GITHUB_REPO?.trim() || "";
  if (!repoFull.includes("/")) return null;
  const slash = repoFull.indexOf("/");
  const owner = repoFull.slice(0, slash).trim();
  const repo = repoFull.slice(slash + 1).trim();
  if (!owner || !repo) return null;
  return { owner, repo };
}

export function defaultGithubOwner(): string {
  return process.env.GITHUB_DEFAULT_OWNER?.trim() || parseGithubRepoEnv()?.owner || "";
}

export function defaultGithubRepo(): string {
  return process.env.GITHUB_DEFAULT_REPO?.trim() || parseGithubRepoEnv()?.repo || "";
}
