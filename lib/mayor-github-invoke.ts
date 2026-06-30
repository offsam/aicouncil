import type { AnthropicSystemBlock } from "./anthropic-prompt-cache";
import { parseAnthropicError } from "./api-types";
import {
  defaultGithubOwner,
  defaultGithubRepo,
  getRepoTree,
  readFile,
  searchCode,
} from "./github-connector";
import { insertLlmUsageLog } from "./llm-usage-log";
import { logAnthropicCacheUsage } from "./mayor-context-budget";
import { MAYOR_GITHUB_TOOL_DEFINITIONS } from "./mayor-github-tools";
import { ProviderInvokeError } from "./provider-user-error";
import { extractRawUsage } from "./tokens";

export type MayorGitHubToolMode = "code_audit" | "coding_task";

type ConversationTurn = { role: "user" | "assistant"; content: string };

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
};

type AnthropicResponse = {
  id?: string;
  type?: string;
  role?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: string | null;
  usage?: unknown;
};

const MAX_TOOL_ITERATIONS = 3;

const CODING_TASK_PATTERNS = [
  /\bпоменяй\s+код\b/i,
  /\bизмени\s+код\b/i,
  /\bисправь\s+код\b/i,
  /\bchange\s+(the\s+)?code\b/i,
  /\bfix\s+(the\s+)?code\b/i,
  /\bmodify\s+(the\s+)?code\b/i,
  /\brefactor\b/i,
  /\bimplement\b.+\bcode\b/i,
  /\bдобавь\b.+\bв\s+код\b/i,
];

const CODE_AUDIT_PATTERNS = [
  /\bгде\s+(находится|искать|лежит)\b/i,
  /\bwhere\s+(is|does)\b.+\b(code|file|located|implemented|defined)\b/i,
  /\blocate\s+(the\s+)?code\b/i,
  /\bfind\s+(the\s+)?(file|code)\b/i,
  /\bкакой\s+файл\b/i,
  /\bв\s+каком\s+файле\b/i,
  /\bwhich\s+file\b/i,
  /\bcode\s+audit\b/i,
  /\bнайди\b.+\b(в\s+коде|файл|где)\b/i,
  /\busage\s+logging\b/i,
];

/** Heuristic gate for GitHub tool path — mirrors Mayor prompt classification without changing it. */
export function detectMayorGitHubToolRequest(text: string): MayorGitHubToolMode | null {
  const normalized = text.trim();
  if (!normalized) return null;
  if (CODING_TASK_PATTERNS.some((p) => p.test(normalized))) return "coding_task";
  if (CODE_AUDIT_PATTERNS.some((p) => p.test(normalized))) return "code_audit";
  return null;
}

function buildInitialMessages(
  question: string,
  conversationHistory: ConversationTurn[],
): AnthropicMessage[] {
  return [
    ...conversationHistory.map((turn) => ({
      role: turn.role,
      content: turn.content,
    })),
    { role: "user" as const, content: question },
  ];
}

function resolveRepoParams(input: Record<string, unknown>): {
  owner: string;
  repo: string;
  branch: string;
} {
  const owner = typeof input.owner === "string" && input.owner.trim()
    ? input.owner.trim()
    : defaultGithubOwner();
  const repo = typeof input.repo === "string" && input.repo.trim()
    ? input.repo.trim()
    : defaultGithubRepo();
  const branch =
    typeof input.branch === "string" && input.branch.trim() ? input.branch.trim() : "main";
  return { owner, repo, branch };
}

async function executeMayorGithubTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  try {
    if (name === "github_get_repo_tree") {
      const { owner, repo, branch } = resolveRepoParams(input);
      if (!owner || !repo) {
        return JSON.stringify({
          error: "owner and repo are required (set GITHUB_DEFAULT_OWNER / GITHUB_DEFAULT_REPO or pass explicitly)",
        });
      }
      const tree = await getRepoTree(owner, repo, branch);
      return JSON.stringify({ owner, repo, branch, files: tree });
    }

    if (name === "github_read_file") {
      const path = typeof input.path === "string" ? input.path.trim() : "";
      if (!path) {
        return JSON.stringify({ error: "path is required" });
      }
      const { owner, repo, branch } = resolveRepoParams(input);
      if (!owner || !repo) {
        return JSON.stringify({
          error: "owner and repo are required (set GITHUB_DEFAULT_OWNER / GITHUB_DEFAULT_REPO or pass explicitly)",
        });
      }
      const content = await readFile(owner, repo, path, branch);
      return JSON.stringify({ owner, repo, branch, path, content });
    }

    if (name === "github_search_code") {
      const query = typeof input.query === "string" ? input.query.trim() : "";
      if (!query) {
        return JSON.stringify({ error: "query is required" });
      }
      const { owner, repo } = resolveRepoParams(input);
      if (!owner || !repo) {
        return JSON.stringify({
          error: "owner and repo are required (set GITHUB_DEFAULT_OWNER / GITHUB_DEFAULT_REPO or pass explicitly)",
        });
      }
      const results = await searchCode(owner, repo, query);
      return JSON.stringify({ owner, repo, query, results });
    }

    return JSON.stringify({ error: `Unknown tool: ${name}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: message });
  }
}

function extractTextAnswer(content: AnthropicContentBlock[] | undefined): string | null {
  const text = (content ?? [])
    .filter((block): block is { type: "text"; text: string } => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  return text || null;
}

async function callAnthropicWithTools(params: {
  modelId: string;
  systemField: string | AnthropicSystemBlock[] | undefined;
  messages: AnthropicMessage[];
  maxTokens: number;
  usagePurpose: string;
  usageIsFallback?: boolean;
}): Promise<AnthropicResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ProviderInvokeError("anthropic", params.modelId, "ANTHROPIC_API_KEY missing");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.modelId,
      max_tokens: params.maxTokens,
      system: params.systemField,
      tools: MAYOR_GITHUB_TOOL_DEFINITIONS,
      messages: params.messages,
    }),
  });

  const data = (await response.json()) as AnthropicResponse;
  const rawUsage = extractRawUsage("anthropic", data);

  if (!response.ok) {
    if (rawUsage != null) {
      await insertLlmUsageLog({
        provider: "anthropic",
        modelId: params.modelId,
        purpose: params.usagePurpose,
        rawUsage,
        error: parseAnthropicError(response.status, data),
        isFallback: params.usageIsFallback ?? false,
      });
    }
    throw new ProviderInvokeError(
      "anthropic",
      params.modelId,
      parseAnthropicError(response.status, data),
    );
  }

  logAnthropicCacheUsage(params.usagePurpose, rawUsage);
  await insertLlmUsageLog({
    provider: "anthropic",
    modelId: params.modelId,
    purpose: params.usagePurpose,
    rawUsage: rawUsage ?? null,
    isFallback: params.usageIsFallback ?? false,
  });

  return data;
}

export async function invokeMayorWithGitHubTools(params: {
  modelId: string;
  systemPrompt: string;
  question: string;
  maxTokens?: number;
  conversationHistory?: ConversationTurn[];
  usagePurpose?: string;
  usageIsFallback?: boolean;
  anthropicSystemBlocks?: AnthropicSystemBlock[];
  toolMode: MayorGitHubToolMode;
}): Promise<string> {
  const maxTokens = params.maxTokens ?? 4096;
  const usagePurpose = params.usagePurpose ?? "mayor_answer";
  console.info(`[mayor-github-tools] classification=${params.toolMode}`);
  const systemField =
    params.anthropicSystemBlocks && params.anthropicSystemBlocks.length > 0
      ? params.anthropicSystemBlocks
      : params.systemPrompt || undefined;

  let messages = buildInitialMessages(params.question, params.conversationHistory ?? []);

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    const data = await callAnthropicWithTools({
      modelId: params.modelId,
      systemField,
      messages,
      maxTokens,
      usagePurpose,
      usageIsFallback: params.usageIsFallback,
    });

    if (data.stop_reason !== "tool_use") {
      const answer = extractTextAnswer(data.content);
      if (!answer) {
        throw new ProviderInvokeError("anthropic", params.modelId, "Anthropic returned empty answer");
      }
      return answer;
    }

    const assistantContent = data.content ?? [];
    const toolUses = assistantContent.filter(
      (block): block is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
        block.type === "tool_use",
    );

    if (toolUses.length === 0) {
      throw new ProviderInvokeError(
        "anthropic",
        params.modelId,
        "Anthropic stop_reason tool_use but no tool_use blocks",
      );
    }

    messages = [
      ...messages,
      { role: "assistant", content: assistantContent },
      {
        role: "user",
        content: await Promise.all(
          toolUses.map(async (toolUse) => ({
            type: "tool_result" as const,
            tool_use_id: toolUse.id,
            content: await executeMayorGithubTool(toolUse.name, toolUse.input),
          })),
        ),
      },
    ];
  }

  throw new ProviderInvokeError(
    "anthropic",
    params.modelId,
    `GitHub tool loop exceeded ${MAX_TOOL_ITERATIONS} iterations`,
  );
}
