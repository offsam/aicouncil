import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";
import { invokeCheapLLM } from "./cheap-llm";
import { resolveOfficeIdForEntityRegistry } from "./system-llm-roles";

/** Keep active raw rows in the fresh layer while their cumulative size from newest stays within this budget. */
export const ARCHIVE_SUMMARIZE_FRESH_RAW_CHARS = 35000;
const ARCHIVE_SUMMARIZE_INACTIVE_DAYS = 7;

type ArchiveRow = {
  id: string;
  entity_registry_id: string;
  type: "raw" | "summary";
  content: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  archived_into: string | null;
};

function formatArchiveContent(params: {
  taskText: string;
  answer: string;
  agentName?: string | null;
  chamberName?: string | null;
  fallbackUsed?: boolean;
}): string {
  const headerParts = [
    params.chamberName ? `Отдел: ${params.chamberName}` : null,
    params.agentName ? `Агент: ${params.agentName}` : null,
    params.fallbackUsed ? "Ответ через fallback-агента" : null,
  ].filter(Boolean);

  return [
    headerParts.length > 0 ? headerParts.join(" · ") : "Chamber archive entry",
    `Задача: ${params.taskText.trim()}`,
    `Итог: ${params.answer.trim()}`,
  ].join("\n");
}

function parseTimestamp(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function daysBetween(a: string | null, b: string): number {
  const aMs = parseTimestamp(a);
  const bMs = parseTimestamp(b);
  if (!aMs || !bMs) return 0;
  return Math.floor((bMs - aMs) / (1000 * 60 * 60 * 24));
}

function truncateText(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}...`;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function extractArchiveSeed(content: string): string {
  const trimmed = content.trim();
  const marker = trimmed.indexOf("Итог:");
  const seed = marker >= 0 ? trimmed.slice(marker + "Итог:".length) : trimmed;
  return truncateText(normalizeWhitespace(seed), 240);
}

function buildHeuristicSummary(params: {
  previousSummary: ArchiveRow | null;
  foldableRows: ArchiveRow[];
}): string {
  const parts: string[] = [];

  if (params.previousSummary?.content.trim()) {
    parts.push(`Предыдущий итог: ${truncateText(normalizeWhitespace(params.previousSummary.content), 260)}`);
  }

  const seeds = params.foldableRows.map((row) => extractArchiveSeed(row.content)).filter(Boolean);
  if (seeds.length > 0) {
    parts.push(`Новые записи: ${seeds.join(" / ")}`);
  }

  return normalizeWhitespace(parts.join(". "));
}

async function buildSummaryContent(params: {
  previousSummary: ArchiveRow | null;
  foldableRows: ArchiveRow[];
  officeId?: string;
}): Promise<string> {
  const sections: string[] = [];

  if (params.previousSummary) {
    sections.push(
      `Previous cumulative summary:\n${truncateText(params.previousSummary.content, 1800)}`,
    );
  }

  sections.push(
    `Raw entries to compress:\n${params.foldableRows
      .map((row) => {
        const stamp = row.created_at;
        return `- [${stamp}] ${truncateText(row.content, 1000)}`;
      })
      .join("\n\n")}`,
  );

  const prompt = [
    "Сожми историю работы отдела в один абзац.",
    "Сохрани ключевые решения, факты, числа, сроки и открытые вопросы.",
    "Не выдумывай ничего сверх исходного текста.",
    "Если есть предыдущая summary, учитывай её как уже накопленный контекст.",
    "",
    sections.join("\n\n"),
  ].join("\n");

  try {
    const summary = await invokeCheapLLM({
      purpose: "chamber-archive-summary",
      prompt,
      responseFormat: "text",
      temperature: 0.2,
      officeId: params.officeId,
    });
    if (summary.trim()) return normalizeWhitespace(summary);
  } catch (err) {
    console.warn("[chamber-archive] cheap LLM summary failed, using heuristic fallback:", err);
  }

  return buildHeuristicSummary(params);
}

export function splitFreshAndFoldableRawRows(rawRows: ArchiveRow[]): {
  freshRows: ArchiveRow[];
  foldableRows: ArchiveRow[];
} {
  if (rawRows.length === 0) {
    return { freshRows: [], foldableRows: [] };
  }

  let freshCharCount = 0;
  let freshStartIndex = rawRows.length - 1;

  for (let i = rawRows.length - 1; i >= 0; i -= 1) {
    const rowLen = rawRows[i]?.content.length ?? 0;
    if (i === rawRows.length - 1) {
      freshCharCount = rowLen;
      freshStartIndex = i;
      continue;
    }
    if (freshCharCount + rowLen > ARCHIVE_SUMMARIZE_FRESH_RAW_CHARS) {
      break;
    }
    freshCharCount += rowLen;
    freshStartIndex = i;
  }

  return {
    freshRows: rawRows.slice(freshStartIndex),
    foldableRows: rawRows.slice(0, freshStartIndex),
  };
}

async function summarizeChamberArchive(entityRegistryId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("chamber_archive")
    .select("id, entity_registry_id, type, content, period_start, period_end, created_at, archived_into")
    .eq("entity_registry_id", entityRegistryId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load chamber archive rows: ${error.message}`);
  }

  const rows = (data ?? []) as ArchiveRow[];
  const rawRows = rows.filter((row) => row.type === "raw" && !row.archived_into);
  const { foldableRows } = splitFreshAndFoldableRawRows(rawRows);
  if (foldableRows.length === 0) return;

  const latestSummary = [...rows].reverse().find((row) => row.type === "summary");
  const latestRaw = rawRows[rawRows.length - 1] ?? null;
  const summaryAgeDays = daysBetween(latestSummary?.created_at ?? null, latestRaw?.created_at ?? new Date().toISOString());
  const shouldSummarizeByVolume = foldableRows.length > 0;
  const shouldSummarizeByInactivity =
    summaryAgeDays >= ARCHIVE_SUMMARIZE_INACTIVE_DAYS && foldableRows.length > 0;

  if (!shouldSummarizeByVolume && !shouldSummarizeByInactivity) return;

  const officeId = (await resolveOfficeIdForEntityRegistry(entityRegistryId)) ?? undefined;
  const summaryContent = await buildSummaryContent({
    previousSummary: latestSummary ?? null,
    foldableRows,
    officeId,
  });

  if (!summaryContent) return;

  const periodStart =
    latestSummary?.period_start ??
    foldableRows[0]?.created_at ??
    latestSummary?.created_at ??
    foldableRows[0]?.created_at ??
    null;
  const periodEnd = foldableRows[foldableRows.length - 1]?.created_at ?? null;

  const { data: summaryRow, error: summaryError } = await supabase
    .from("chamber_archive")
    .insert({
      entity_registry_id: entityRegistryId,
      type: "summary",
      content: summaryContent,
      period_start: periodStart,
      period_end: periodEnd,
    })
    .select("id")
    .single();

  if (summaryError || !summaryRow) {
    throw new Error(`Failed to write chamber summary: ${summaryError?.message ?? "unknown error"}`);
  }

  const foldableIds = foldableRows.map((row) => row.id);
  const { error: updateError } = await supabase
    .from("chamber_archive")
    .update({ archived_into: summaryRow.id })
    .in("id", foldableIds);

  if (updateError) {
    throw new Error(`Failed to mark archived rows: ${updateError.message}`);
  }
}

export async function writeArchiveEntry(
  entityRegistryId: string,
  content: string,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("chamber_archive").insert({
    entity_registry_id: entityRegistryId,
    type: "raw",
    content: content.trim(),
  });

  if (error) {
    throw new Error(`Failed to write chamber archive entry: ${error.message}`);
  }

  try {
    await summarizeChamberArchive(entityRegistryId);
  } catch (err) {
    console.warn("[chamber-archive] summarize failed:", err);
  }
}

export async function writeChamberArchiveEntry(params: {
  entityRegistryId: string;
  taskText: string;
  answer: string;
  agentName?: string | null;
  chamberName?: string | null;
  fallbackUsed?: boolean;
}): Promise<void> {
  await writeArchiveEntry(params.entityRegistryId, formatArchiveContent(params));
}
