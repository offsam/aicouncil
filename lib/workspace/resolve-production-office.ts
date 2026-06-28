import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Production office name from supabase/migrations/20250622120000_ai_council_schema.sql seed. */
const PRODUCTION_OFFICE_NAME = "AI Council";

/**
 * Resolve the canonical production office id from DB (no hardcoded UUID).
 */
export async function resolveProductionOfficeId(): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("offices")
    .select("id")
    .eq("name", PRODUCTION_OFFICE_NAME)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[resolveProductionOfficeId]", error.message);
    return null;
  }
  return data?.id ?? null;
}
