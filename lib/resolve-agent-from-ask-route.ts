import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";

/** Map legacy /api/ask-* route path (+ optional body.model) to entity_registry agent slug. */
export function resolveAgentSlugFromAskRoute(routePath: string, body: unknown): string {
  const path = routePath.toLowerCase();
  const model =
    typeof body === "object" && body !== null && "model" in body
      ? String((body as { model?: string }).model ?? "").toLowerCase()
      : "";

  if (path.includes("ask-claude")) return "claude";
  if (path.includes("ask-gpt")) return "gpt";
  if (path.includes("ask-gemini")) return "gemini";
  if (path.includes("ask-deepseek")) return "deepseek";
  if (path.includes("ask-groq")) return "groq";
  if (path.includes("ask-mistral")) return "mistral";
  if (path.includes("ask-openrouter")) {
    if (model.includes("qwen")) return "or-qwen";
    if (model.includes("llama")) return "or-llama";
    if (model.includes("deepseek")) return "or-deepseek-r1";
    if (model.includes("gemma")) return "or-gemma";
    if (model.includes("mistral")) return "or-mistral";
  }
  return "";
}

export async function resolveAgentRegistryIdFromAskRoute(
  routePath: string,
  body: unknown,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const slug = resolveAgentSlugFromAskRoute(routePath, body);
  if (!slug) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("entity_type", "agent")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.warn(`[resolveAgentFromAskRoute] slug=${slug}: ${error.message}`);
    return null;
  }
  return data?.id ?? null;
}
