import {
  ensureBuildingRegistry,
  ensureChamberRegistryByRegistryId,
  ensureCityRegistry,
} from "./entity-registry-ensure";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";

/**
 * Resolves entity_registry.id for a scoped rules/knowledge row.
 * Backfills missing registry rows for legacy buildings/chambers when possible.
 */
export async function resolveEntityRegistryId(
  entityType: string,
  entityId: string,
): Promise<string> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase не настроен");
  }

  const supabase = getSupabaseAdmin();

  async function lookup(): Promise<string | null> {
    const { data, error } = await supabase
      .from("entity_registry")
      .select("id")
      .eq("entity_type", entityType)
      .eq("id", entityId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data?.id ?? null;
  }

  let id = await lookup();
  if (id) return id;

  if (entityType === "city") {
    const { data: office } = await supabase
      .from("offices")
      .select("id, name")
      .eq("id", entityId)
      .maybeSingle();
    if (office) {
      await ensureCityRegistry(supabase, entityId, office.name);
    }
  } else if (entityType === "building") {
    const { data: obj } = await supabase
      .from("office_objects")
      .select("id, label, office_id")
      .eq("id", entityId)
      .maybeSingle();
    if (obj) {
      await ensureBuildingRegistry(supabase, {
        id: obj.id,
        label: obj.label,
        office_id: obj.office_id,
      });
    }
  } else if (entityType === "chamber") {
    await ensureChamberRegistryByRegistryId(supabase, entityId);
  }

  id = await lookup();
  if (!id) {
    throw new Error(
      `entity_registry не найден для ${entityType}/${entityId}. Сначала создайте сущность в реестре.`,
    );
  }

  return id;
}
