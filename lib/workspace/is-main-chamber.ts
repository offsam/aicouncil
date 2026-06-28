import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** True when chamber is the building's primary entry point (Manager). */
export async function isMainChamber(chamberRegistryId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("chambers")
    .select("routing_role")
    .eq("entity_registry_id", chamberRegistryId)
    .maybeSingle();
  return data?.routing_role === "main";
}
