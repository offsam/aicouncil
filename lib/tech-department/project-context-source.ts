import {
  fetchGithubFileWithExtensions,
  resolveGithubRepoConfig,
  searchGithubCodePaths,
  type GithubRepoConfig,
} from "./github-source-read";

export type ProjectContextError = {
  kind: "auth" | "not_found" | "api_error";
  status: number;
  message: string;
};

export type ProjectContextFile = {
  path: string;
  content: string;
  sha?: string;
};

export interface ProjectContextSource {
  describe(): string;
  searchPaths(
    query: string,
    limit: number,
  ): Promise<{ paths: string[]; error: ProjectContextError | null }>;
  readFile(
    path: string,
  ): Promise<
    | { ok: true; file: ProjectContextFile }
    | { ok: false; error: ProjectContextError }
  >;
}

export type GithubProjectContextSource = ProjectContextSource & {
  readonly repo: string;
  readonly ref: string;
};

class GithubProjectContextSourceImpl implements GithubProjectContextSource {
  readonly repo: string;
  readonly ref: string;

  constructor(private readonly config: GithubRepoConfig) {
    this.repo = `${config.owner}/${config.repo}`;
    this.ref = config.ref;
  }

  describe(): string {
    return `${this.repo}@${this.ref}`;
  }

  async searchPaths(
    query: string,
    limit: number,
  ): Promise<{ paths: string[]; error: ProjectContextError | null }> {
    const result = await searchGithubCodePaths(this.config, query, limit);
    return { paths: result.paths, error: result.error };
  }

  async readFile(
    path: string,
  ): Promise<
    | { ok: true; file: ProjectContextFile }
    | { ok: false; error: ProjectContextError }
  > {
    return fetchGithubFileWithExtensions(this.config, path);
  }
}

/** Default production source: GitHub repo from env (GITHUB_TOKEN, GITHUB_REPO, GITHUB_REF). */
export function createGithubProjectContextSource(): GithubProjectContextSource | null {
  const config = resolveGithubRepoConfig();
  if (!config) return null;
  return new GithubProjectContextSourceImpl(config);
}
