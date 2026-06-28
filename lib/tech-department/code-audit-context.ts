import { resolveImportToRepoPath, type GithubApiFailure } from "./github-source-read";
import {
  createGithubProjectContextSource,
  type GithubProjectContextSource,
  type ProjectContextFile,
} from "./project-context-source";

export const MAX_CODE_AUDIT_FILES = 5;
export const MAX_CODE_AUDIT_QUOTED_LINES = 200;

export type CodeAuditSnippet = {
  path: string;
  functionName: string | null;
  startLine: number;
  endLine: number;
  lines: string[];
};

export type CodeAuditSnapshot = {
  configured: boolean;
  repo: string | null;
  ref: string | null;
  filesOpened: string[];
  snippets: CodeAuditSnippet[];
  notFoundNotes: string[];
  quotedLineCount: number;
  githubErrors: GithubApiFailure[];
};

const SEARCH_STOP_WORDS = new Set([
  "почему",
  "как",
  "что",
  "это",
  "для",
  "найди",
  "проверь",
  "проведи",
  "аудит",
  "bug",
  "the",
  "why",
  "how",
  "what",
  "code",
  "audit",
  "файл",
  "функция",
  "function",
  "логик",
  "работает",
  "техническ",
]);

export function extractExplicitFilePaths(taskText: string): string[] {
  const paths = new Set<string>();
  const patterns = [
    /(?:^|[\s('"`])(@\/[\w./-]+\.(?:ts|tsx|js|jsx|sql))/gi,
    /(?:^|[\s('"])((?:lib|app|components|scripts|supabase)\/[\w./-]+\.(?:ts|tsx|js|jsx|sql))/gi,
    /\b([\w.-]+\.(?:ts|tsx|js|jsx|sql))\b/gi,
  ];
  for (const pattern of patterns) {
    for (const match of taskText.matchAll(pattern)) {
      const raw = match[1]?.replace(/^@\//, "") ?? "";
      if (raw && !raw.includes("..")) paths.add(raw);
    }
  }
  return [...paths];
}

export function extractFunctionName(taskText: string): string | null {
  const patterns = [
    /(?:функци[яию]|function|метод)\s+[`'"]?([A-Za-z_$][\w$]*)/iu,
    /\b([A-Za-z_$][\w$]*)\s*\(\s*\)/,
  ];
  for (const pattern of patterns) {
    const m = taskText.match(pattern);
    if (m?.[1] && m[1].length >= 3) return m[1];
  }
  return null;
}

export function extractCodeSearchTerms(taskText: string): string[] {
  const terms = new Set<string>();
  for (const token of taskText.toLowerCase().split(/[^\p{L}\p{N}_]+/u)) {
    if (token.length >= 4 && !SEARCH_STOP_WORDS.has(token)) {
      terms.add(token);
    }
  }
  for (const match of taskText.matchAll(/\b([A-Za-z][A-Za-z0-9_]{2,})\b/g)) {
    const word = match[1];
    if (!SEARCH_STOP_WORDS.has(word.toLowerCase()) && word.length >= 4) {
      terms.add(word);
    }
  }
  return [...terms].slice(0, 6);
}

const IMPORT_PATTERN =
  /(?:import\s+(?:[\w*\s{},]+from\s+)?|export\s+(?:\*|{[^}]*})\s+from\s+|import\s*\(\s*)["']([^"']+)["']/g;

export function parseLocalImports(source: string, fromFile: string): string[] {
  const paths: string[] = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const imp = match[1];
    if (!imp || (!imp.startsWith(".") && !imp.startsWith("@/"))) continue;
    const resolved = resolveImportToRepoPath(imp, fromFile);
    if (resolved) paths.push(resolved);
  }
  return paths;
}

function findFunctionBlock(
  source: string,
  functionName: string,
): { startLine: number; endLine: number; lines: string[] } | null {
  const lines = source.split("\n");
  const patterns = [
    new RegExp(`export\\s+(?:async\\s+)?function\\s+${functionName}\\b`),
    new RegExp(`(?:async\\s+)?function\\s+${functionName}\\b`),
    new RegExp(`export\\s+const\\s+${functionName}\\s*=`),
    new RegExp(`const\\s+${functionName}\\s*=\\s*(?:async\\s*)?\\(`),
  ];

  let startIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (patterns.some((p) => p.test(lines[i]))) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return null;

  let braceDepth = 0;
  let started = false;
  let endIdx = startIdx;
  for (let i = startIdx; i < lines.length; i += 1) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{") {
        braceDepth += 1;
        started = true;
      } else if (ch === "}") {
        braceDepth -= 1;
      }
    }
    endIdx = i;
    if (started && braceDepth <= 0) break;
    if (!started && i > startIdx + 80) break;
  }

  const block = lines.slice(startIdx, endIdx + 1);
  return {
    startLine: startIdx + 1,
    endLine: endIdx + 1,
    lines: block,
  };
}

function importRelatesToQuestion(importPath: string, terms: string[]): boolean {
  const hay = importPath.toLowerCase().replace(/[/\\-]/g, " ");
  return terms.some((t) => hay.includes(t.toLowerCase()));
}

function takeLinesWithinBudget(
  snippets: CodeAuditSnippet[],
  path: string,
  functionName: string | null,
  startLine: number,
  lines: string[],
  budget: number,
): number {
  if (budget <= 0 || lines.length === 0) return 0;
  const slice = lines.slice(0, budget);
  snippets.push({
    path,
    functionName,
    startLine,
    endLine: startLine + slice.length - 1,
    lines: slice,
  });
  return slice.length;
}

export async function buildCodeAuditSnapshot(
  taskText: string,
  source?: GithubProjectContextSource,
): Promise<CodeAuditSnapshot> {
  const empty: CodeAuditSnapshot = {
    configured: false,
    repo: null,
    ref: null,
    filesOpened: [],
    snippets: [],
    notFoundNotes: [],
    quotedLineCount: 0,
    githubErrors: [],
  };

  const resolvedSource = source ?? createGithubProjectContextSource();
  if (!resolvedSource) {
    empty.notFoundNotes.push(
      "GitHub read-only не настроен (нужны GITHUB_TOKEN и GITHUB_REPO в env)",
    );
    return empty;
  }
  const ctx = resolvedSource;

  const searchTerms = extractCodeSearchTerms(taskText);
  const explicitPaths = extractExplicitFilePaths(taskText);
  const targetFunction = extractFunctionName(taskText);

  const candidatePaths: string[] = [...explicitPaths];
  const githubErrors: GithubApiFailure[] = [];
  const notFoundNotes: string[] = [];
  let githubAuthFailed = false;

  function recordGithubError(error: GithubApiFailure): void {
    if (githubErrors.some((e) => e.kind === error.kind && e.status === error.status)) return;
    githubErrors.push(error);
    if (error.kind === "auth") {
      githubAuthFailed = true;
      notFoundNotes.push(`GitHub API: ${error.message}`);
    }
  }

  if (candidatePaths.length === 0 && searchTerms.length > 0) {
    for (const term of searchTerms.slice(0, 3)) {
      if (githubAuthFailed) break;
      const search = await ctx.searchPaths(term, 8);
      if (search.error) {
        recordGithubError(search.error);
        if (githubAuthFailed) break;
      }
      candidatePaths.push(...search.paths);
    }
  }

  const queue = [...new Set(candidatePaths)].slice(0, MAX_CODE_AUDIT_FILES * 2);
  const opened = new Map<string, ProjectContextFile>();
  const filesOpened: string[] = [];
  const snippets: CodeAuditSnippet[] = [];
  let quotedLineCount = 0;

  async function openFile(path: string): Promise<ProjectContextFile | null> {
    if (githubAuthFailed) return null;
    if (opened.has(path)) return opened.get(path) ?? null;
    if (filesOpened.length >= MAX_CODE_AUDIT_FILES) return null;
    const outcome = await ctx.readFile(path);
    if (!outcome.ok) {
      if (outcome.error.kind === "auth") {
        recordGithubError(outcome.error);
      } else if (outcome.error.kind === "not_found") {
        notFoundNotes.push(`Файл не найден в репозитории: ${path}`);
      } else {
        recordGithubError(outcome.error);
        notFoundNotes.push(`GitHub API: ${outcome.error.message}`);
      }
      return null;
    }
    opened.set(outcome.file.path, outcome.file);
    filesOpened.push(outcome.file.path);
    return outcome.file;
  }

  for (const path of queue) {
    if (filesOpened.length >= MAX_CODE_AUDIT_FILES) break;
    await openFile(path);
  }

  if (filesOpened.length === 0 && searchTerms.length > 0 && !githubAuthFailed) {
    notFoundNotes.push(
      `Не найдено файлов по запросу (поиск: ${searchTerms.join(", ")})`,
    );
  }

  for (const path of [...filesOpened]) {
    if (quotedLineCount >= MAX_CODE_AUDIT_QUOTED_LINES) break;
    const file = opened.get(path);
    if (!file) continue;

    const budget = MAX_CODE_AUDIT_QUOTED_LINES - quotedLineCount;
    if (targetFunction) {
      const block = findFunctionBlock(file.content, targetFunction);
      if (block) {
        quotedLineCount += takeLinesWithinBudget(
          snippets,
          file.path,
          targetFunction,
          block.startLine,
          block.lines,
          budget,
        );
      } else {
        notFoundNotes.push(
          `Функция «${targetFunction}» не найдена в ${file.path}`,
        );
      }
    } else {
      const allLines = file.content.split("\n");
      const maxLines = Math.min(80, allLines.length, budget);
      quotedLineCount += takeLinesWithinBudget(
        snippets,
        file.path,
        null,
        1,
        allLines.slice(0, maxLines),
        maxLines,
      );
    }

    if (filesOpened.length < MAX_CODE_AUDIT_FILES) {
      for (const imp of parseLocalImports(file.content, file.path)) {
        if (filesOpened.length >= MAX_CODE_AUDIT_FILES) break;
        if (!importRelatesToQuestion(imp, searchTerms)) continue;
        if (opened.has(imp) || filesOpened.some((p) => p.startsWith(imp))) continue;
        await openFile(imp);
      }
    }
  }

  for (const path of filesOpened) {
    if (snippets.some((s) => s.path === path)) continue;
    if (quotedLineCount >= MAX_CODE_AUDIT_QUOTED_LINES) break;
    const file = opened.get(path);
    if (!file) continue;
    const budget = MAX_CODE_AUDIT_QUOTED_LINES - quotedLineCount;
    const lines = file.content.split("\n").slice(0, Math.min(40, budget));
    quotedLineCount += takeLinesWithinBudget(snippets, file.path, null, 1, lines, lines.length);
  }

  return {
    configured: true,
    repo: ctx.repo,
    ref: ctx.ref,
    filesOpened,
    snippets,
    notFoundNotes,
    quotedLineCount,
    githubErrors,
  };
}

export function formatCodeAuditSnapshotForPrompt(
  taskText: string,
  snapshot: CodeAuditSnapshot,
): string {
  const parts: string[] = [
    `[Code Audit snapshot — read-only, ${new Date().toISOString()}]`,
    snapshot.repo ? `Repository: ${snapshot.repo}@${snapshot.ref ?? "main"}` : "Repository: not configured",
    `User question: "${taskText.trim().slice(0, 500)}"`,
    `Files opened: ${snapshot.filesOpened.length}/${MAX_CODE_AUDIT_FILES}`,
    `Quoted lines: ${snapshot.quotedLineCount}/${MAX_CODE_AUDIT_QUOTED_LINES}`,
    "",
  ];

  if (snapshot.notFoundNotes.length > 0) {
    parts.push("[Not found / skipped]");
    for (const note of snapshot.notFoundNotes) {
      parts.push(`- ${note}`);
    }
    parts.push("");
  }

  if (snapshot.githubErrors.some((e) => e.kind === "auth")) {
    parts.push(
      "ВАЖНО: запрос к GitHub не авторизован. Не цитируй код — сообщи об ошибке авторизации из списка выше.",
    );
    parts.push("");
  }

  if (snapshot.snippets.length === 0) {
    parts.push("Не найдено фрагментов исходного кода для цитирования.");
  } else {
    parts.push("[Source fragments — cite only these in your answer]");
    for (const snip of snapshot.snippets) {
      parts.push(
        `--- ${snip.path}${snip.functionName ? ` :: ${snip.functionName}` : ""} (lines ${snip.startLine}-${snip.endLine}) ---`,
      );
      for (let i = 0; i < snip.lines.length; i += 1) {
        parts.push(`${snip.startLine + i}| ${snip.lines[i]}`);
      }
      parts.push("");
    }
  }

  return parts.join("\n").trim();
}

export async function buildTechDepartmentCodeAuditContext(taskText: string): Promise<string> {
  const snapshot = await buildCodeAuditSnapshot(taskText);
  return formatCodeAuditSnapshotForPrompt(taskText, snapshot);
}

export const TECH_DEPARTMENT_CODE_AUDIT_ANSWER_PREFIX = `[Tech Department — code audit mode]
You analyze ONLY the source fragments in the Code Audit snapshot below (read-only GitHub fetch).
Rules:
- No "вероятно", "возможно", "скорее всего" — only facts visible in the quoted fragments.
- If the answer is not in the fragments, write: «не найдено в прочитанном коде».
- Always cite file path and line numbers from the snapshot.
- Do not propose commits, patches, or pull requests. Read-only analysis only.`;
