import { invokeCheapLLM } from "./cheap-llm";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";

/** Read view cap ≈500 tokens (task: 300–500). */
export const MAYOR_SHARED_MEMORY_READ_MAX_CHARS = 2000;

/** Summarizer write cap ≈400 tokens. */
export const MAYOR_SHARED_MEMORY_WRITE_MAX_EST_TOKENS = 400;

export const MAYOR_SHARED_MEMORY_SECTION_HEADER =
  "[Shared Mayor project memory — cross-channel context]";

export const MAYOR_SHARED_MEMORY_EMPTY_READ_VIEW = "(no shared memory yet)";

export const MAYOR_SHARED_MEMORY_NO_UPDATE = "NO_UPDATE";

export type MayorSharedMemoryRecord = {
  summary: string | null;
  tokenEstimate: number | null;
  memoryScopeId: string;
};

export function formatMayorSharedMemoryScopeId(officeId: string): string {
  return `mayor:office:${officeId.trim()}`;
}

export function estimateMayorSharedMemoryTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatMayorSharedMemoryPromptSection(readView: string): string {
  return `${MAYOR_SHARED_MEMORY_SECTION_HEADER}\n${readView.trim() || MAYOR_SHARED_MEMORY_EMPTY_READ_VIEW}`;
}

/**
 * Compact read view for Mayor prompt — does not mutate stored summary.
 * Keeps whole lines (bullet points) where possible.
 */
export function compactMayorSharedMemoryReadView(storedSummary: string | null): string {
  if (!storedSummary?.trim()) return MAYOR_SHARED_MEMORY_EMPTY_READ_VIEW;
  const text = storedSummary.trim();
  if (text.length <= MAYOR_SHARED_MEMORY_READ_MAX_CHARS) return text;

  const lines = text.split("\n");
  const kept: string[] = [];
  let chars = 0;
  for (const line of lines) {
    const lineLen = line.length + (kept.length > 0 ? 1 : 0);
    if (chars + lineLen > MAYOR_SHARED_MEMORY_READ_MAX_CHARS) break;
    kept.push(line);
    chars += lineLen;
  }

  if (kept.length === 0) {
    return `${text.slice(0, MAYOR_SHARED_MEMORY_READ_MAX_CHARS).trimEnd()}…`;
  }
  if (kept.length < lines.length) {
    kept.push("…");
  }
  return kept.join("\n");
}

export async function loadMayorSharedMemory(
  officeId: string,
): Promise<MayorSharedMemoryRecord> {
  const scopeId = formatMayorSharedMemoryScopeId(officeId);
  if (!isSupabaseConfigured()) {
    return { summary: null, tokenEstimate: null, memoryScopeId: scopeId };
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("mayor_shared_memory")
    .select("summary, token_estimate, memory_scope_id")
    .eq("office_id", officeId)
    .eq("memory_scope_id", scopeId)
    .maybeSingle();

  if (error) {
    console.warn("[mayor-shared-memory] load failed:", error.message);
    return { summary: null, tokenEstimate: null, memoryScopeId: scopeId };
  }

  return {
    summary: data?.summary ?? null,
    tokenEstimate: data?.token_estimate ?? null,
    memoryScopeId: data?.memory_scope_id ?? scopeId,
  };
}

export async function upsertMayorSharedMemory(
  officeId: string,
  summary: string,
): Promise<void> {
  const trimmed = summary.trim();
  if (!trimmed) return;

  if (!isSupabaseConfigured()) return;

  const scopeId = formatMayorSharedMemoryScopeId(officeId);
  const tokenEstimate = estimateMayorSharedMemoryTokens(trimmed);
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("mayor_shared_memory").upsert(
    {
      office_id: officeId,
      memory_scope_id: scopeId,
      summary: trimmed,
      token_estimate: tokenEstimate,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "office_id,memory_scope_id" },
  );

  if (error) {
    throw new Error(error.message);
  }
}

/** Skip obvious trivial user turns before calling Memory Summarizer. */
export function isTrivialMayorMemoryUserMessage(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  if (t.length <= 2) return true;
  return /^(ок|ok|okay|спасибо|thanks|thank you|понятно|понял|поняла|хорошо|да|yes|нет|no|👍|🙏)[\s!.?,]*$/u.test(
    t,
  );
}

function buildMayorSharedMemorySummarizerPrompt(params: {
  currentSummary: string;
  userMessage: string;
  mayorAnswer: string;
}): string {
  return `You are the Mayor Memory Summarizer. Maintain a compact cross-channel project memory for the AI office Mayor.

Output rules:
- If nothing worth storing happened, respond with exactly: ${MAYOR_SHARED_MEMORY_NO_UPDATE}
- Otherwise output ONLY the updated summary text (no markdown fences, no preamble), max ${MAYOR_SHARED_MEMORY_WRITE_MAX_EST_TOKENS} tokens.
- Prefer concise bullet points for decisions, priorities, bugs, and completed work.
- Do NOT invoke Mayor, routing, or debate. This is a standalone cheap summary task only.

Memory Update Policy — update ONLY when the exchange includes at least one of:
- a decision ("we will do X", "choosing Y", "будем делать X")
- priority or roadmap change
- completed task
- bug or problem discovered
- user explicitly fixed/recorded something for the project

Do NOT update for: "ok", "thanks", "спасибо", "понятно", simple follow-up questions, diagnostic/status-only queries, greetings, or trivial acknowledgments.

Apply this policy in this single response — no separate classification step.

Current shared summary:
${params.currentSummary || "(empty)"}

Latest user message:
${params.userMessage}

Latest Mayor answer:
${params.mayorAnswer}`;
}

/**
 * Best-effort shared memory update after a successful Mayor answer.
 * Never throws — failures are logged only.
 */
export async function maybeUpdateMayorSharedMemory(params: {
  officeId: string;
  userMessage: string;
  mayorAnswer: string;
}): Promise<void> {
  const userMessage = params.userMessage.trim();
  const mayorAnswer = params.mayorAnswer.trim();
  if (!userMessage || !mayorAnswer) return;
  if (isTrivialMayorMemoryUserMessage(userMessage)) return;

  try {
    const current = await loadMayorSharedMemory(params.officeId);
    const prompt = buildMayorSharedMemorySummarizerPrompt({
      currentSummary: current.summary ?? "",
      userMessage,
      mayorAnswer,
    });

    const result = await invokeCheapLLM({
      purpose: "summary",
      prompt,
      responseFormat: "text",
      temperature: 0.1,
      maxTokens: 600,
      officeId: params.officeId,
    });

    const trimmed = result.trim();
    if (!trimmed || trimmed === MAYOR_SHARED_MEMORY_NO_UPDATE) return;
    if (trimmed.toUpperCase().startsWith(MAYOR_SHARED_MEMORY_NO_UPDATE)) return;

    await upsertMayorSharedMemory(params.officeId, trimmed);
  } catch (err) {
    console.warn(
      "[mayor-shared-memory] update failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Fire-and-forget wrapper — Mayor user response must not wait on summarizer. */
export function scheduleMayorSharedMemoryUpdate(params: {
  officeId: string;
  userMessage: string;
  mayorAnswer: string;
}): void {
  void maybeUpdateMayorSharedMemory(params);
}
