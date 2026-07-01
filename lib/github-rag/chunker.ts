const CHUNK_SIZE_LINES = 80;
const CHUNK_OVERLAP_LINES = 10;
export const MAX_FILE_SIZE_BYTES = 500_000;
export const CHUNK_STRATEGY_VERSION = "v1";

export const INDEXABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".md",
  ".sql",
  ".yaml",
  ".yml",
  ".json",
  ".env.example",
]);

const SKIP_PATH_PREFIXES = ["node_modules/", ".git/", "dist/", ".next/"];

const SKIP_EXTENSIONS = new Set([".lock", ".png", ".jpg", ".jpeg", ".ico", ".gif", ".webp"]);

export function isIndexablePath(path: string, sizeBytes?: number | null): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (SKIP_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix) || normalized.includes(`/${prefix}`))) {
    return false;
  }

  const lower = normalized.toLowerCase();
  if (lower.endsWith(".env.example")) {
    return sizeBytes == null || sizeBytes <= MAX_FILE_SIZE_BYTES;
  }

  const dot = lower.lastIndexOf(".");
  const ext = dot >= 0 ? lower.slice(dot) : "";
  if (!INDEXABLE_EXTENSIONS.has(ext)) {
    return false;
  }
  if (SKIP_EXTENSIONS.has(ext)) {
    return false;
  }

  return sizeBytes == null || sizeBytes <= MAX_FILE_SIZE_BYTES;
}

export function detectLanguage(path: string): string | null {
  const lower = path.toLowerCase();
  if (lower.endsWith(".env.example")) return "env";
  const dot = lower.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = lower.slice(dot);
  const map: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".md": "markdown",
    ".sql": "sql",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".json": "json",
  };
  return map[ext] ?? ext.slice(1);
}

export function chunkFileContent(params: {
  content: string;
  path: string;
  strategyVersion?: string;
}): Array<{ chunkIndex: number; chunkText: string }> {
  void params.path;
  void params.strategyVersion;

  const lines = params.content.split(/\r?\n/);
  if (lines.length === 0) {
    return [];
  }

  const step = Math.max(1, CHUNK_SIZE_LINES - CHUNK_OVERLAP_LINES);
  const chunks: Array<{ chunkIndex: number; chunkText: string }> = [];
  let chunkIndex = 0;

  for (let start = 0; start < lines.length; start += step) {
    const window = lines.slice(start, start + CHUNK_SIZE_LINES);
    const chunkText = window.join("\n").trim();
    if (!chunkText) {
      continue;
    }
    chunks.push({ chunkIndex, chunkText });
    chunkIndex += 1;
    if (start + CHUNK_SIZE_LINES >= lines.length) {
      break;
    }
  }

  return chunks;
}
