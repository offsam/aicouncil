/**
 * Read-only GitHub source access for Code Audit (Vercel-safe — no local filesystem).
 */

export type GithubRepoConfig = {
  owner: string;
  repo: string;
  ref: string;
  token: string;
};

export type GithubFileContent = {
  path: string;
  content: string;
  sha?: string;
};

export type GithubApiFailureKind = "auth" | "not_found" | "api_error";

export type GithubApiFailure = {
  kind: GithubApiFailureKind;
  status: number;
  message: string;
};

export type GithubFileFetchOutcome =
  | { ok: true; file: GithubFileContent }
  | { ok: false; error: GithubApiFailure };

export type GithubCodeSearchOutcome = {
  paths: string[];
  error: GithubApiFailure | null;
};

const GITHUB_API = "https://api.github.com";

function classifyGithubStatus(status: number, context: string): GithubApiFailure {
  if (status === 401 || status === 403) {
    return {
      kind: "auth",
      status,
      message: `ошибка авторизации GitHub (${status}): проверьте GITHUB_TOKEN`,
    };
  }
  if (status === 404) {
    return {
      kind: "not_found",
      status,
      message: `${context} не найден`,
    };
  }
  return {
    kind: "api_error",
    status,
    message: `ошибка GitHub API (${status}) при запросе ${context}`,
  };
}

async function readGithubErrorBody(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message?.trim() || null;
  } catch {
    return null;
  }
}

export function resolveGithubRepoConfig(): GithubRepoConfig | null {
  const token = process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_API_TOKEN?.trim();
  const repoFull = process.env.GITHUB_REPO?.trim() || "offsam/aicouncil";
  const ref = process.env.GITHUB_REF?.trim() || "main";
  if (!token) return null;

  const slash = repoFull.indexOf("/");
  if (slash <= 0) return null;
  const owner = repoFull.slice(0, slash);
  const repo = repoFull.slice(slash + 1);
  if (!owner || !repo) return null;

  return { owner, repo, ref, token };
}

function githubHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function fetchGithubFileContent(
  config: GithubRepoConfig,
  path: string,
): Promise<GithubFileFetchOutcome> {
  const normalized = path.replace(/^\/+/, "");
  const url = `${GITHUB_API}/repos/${config.owner}/${config.repo}/contents/${encodeURIComponent(normalized).replace(/%2F/g, "/")}?ref=${encodeURIComponent(config.ref)}`;

  const res = await fetch(url, { headers: githubHeaders(config.token), next: { revalidate: 300 } });
  if (!res.ok) {
    const detail = await readGithubErrorBody(res);
    const failure = classifyGithubStatus(res.status, `файл ${normalized}`);
    if (detail) {
      failure.message = `${failure.message}: ${detail}`;
    }
    return { ok: false, error: failure };
  }

  const data = (await res.json()) as {
    type?: string;
    encoding?: string;
    content?: string;
    sha?: string;
  };
  if (data.type !== "file" || !data.content) {
    return {
      ok: false,
      error: {
        kind: "api_error",
        status: res.status,
        message: `GitHub вернул не файл для ${normalized}`,
      },
    };
  }

  const raw =
    data.encoding === "base64"
      ? Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8")
      : data.content;
  return { ok: true, file: { path: normalized, content: raw, sha: data.sha } };
}

export async function searchGithubCodePaths(
  config: GithubRepoConfig,
  query: string,
  limit = 10,
): Promise<GithubCodeSearchOutcome> {
  const q = `${query} repo:${config.owner}/${config.repo}`;
  const url = `${GITHUB_API}/search/code?q=${encodeURIComponent(q)}&per_page=${Math.min(limit, 30)}`;

  const res = await fetch(url, { headers: githubHeaders(config.token), next: { revalidate: 300 } });
  if (!res.ok) {
    const detail = await readGithubErrorBody(res);
    const failure = classifyGithubStatus(res.status, "поиск кода");
    if (detail) {
      failure.message = `${failure.message}: ${detail}`;
    }
    return { paths: [], error: failure };
  }

  const body = (await res.json()) as {
    items?: Array<{ path?: string; name?: string }>;
  };
  return {
    paths: (body.items ?? []).map((item) => item.path).filter((p): p is string => Boolean(p)),
    error: null,
  };
}

/** Resolve @/ and relative imports to repo-relative paths (best-effort). */
export function resolveImportToRepoPath(importPath: string, fromFile: string): string | null {
  const imp = importPath.trim().replace(/^\.\//, "");
  if (imp.startsWith("@/")) {
    return imp.slice(2);
  }
  if (imp.startsWith(".")) {
    const baseParts = fromFile.split("/");
    baseParts.pop();
    for (const segment of imp.split("/")) {
      if (segment === "." || segment === "") continue;
      if (segment === "..") {
        baseParts.pop();
      } else {
        baseParts.push(segment);
      }
    }
    return baseParts.join("/");
  }
  return null;
}

export async function fetchGithubFileWithExtensions(
  config: GithubRepoConfig,
  basePath: string,
): Promise<GithubFileFetchOutcome> {
  const clean = basePath.replace(/^\/+/, "").replace(/\.(ts|tsx|js|jsx)$/, "");
  const candidates = [
    basePath,
    `${clean}.ts`,
    `${clean}.tsx`,
    `${clean}/index.ts`,
    `${clean}/index.tsx`,
  ];
  const seen = new Set<string>();
  let lastNotFound: GithubApiFailure | null = null;

  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const outcome = await fetchGithubFileContent(config, candidate);
    if (outcome.ok) return outcome;
    if (outcome.error.kind === "auth") return outcome;
    if (outcome.error.kind === "api_error" && outcome.error.status >= 500) {
      return outcome;
    }
    if (outcome.error.kind === "not_found") {
      lastNotFound = outcome.error;
    }
  }

  return {
    ok: false,
    error: lastNotFound ?? {
      kind: "not_found",
      status: 404,
      message: `файл ${basePath} не найден`,
    },
  };
}
