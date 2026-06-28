import type { SupabaseClient } from "@supabase/supabase-js";
import { isCityHallBuilding } from "./city-hall-building";

export const DUPLICATE_CITY_HALL_ERROR =
  "В этом office уже есть здание City Hall. Можно только одно City Hall на город.";

export function isCityHallLabel(label: string | null | undefined): boolean {
  return isCityHallBuilding({ label: label ?? null });
}

/** Returns existing City Hall building id in office, optionally excluding one object (PATCH self). */
export async function findExistingCityHallBuildingId(
  supabase: SupabaseClient,
  officeId: string,
  excludeObjectId?: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("office_objects")
    .select("id, label")
    .eq("office_id", officeId)
    .eq("object_type", "room");

  if (error) {
    throw new Error(error.message);
  }

  const match = (data ?? []).find(
    (row) =>
      isCityHallBuilding(row) && (!excludeObjectId || row.id !== excludeObjectId),
  );
  return match?.id ?? null;
}

export async function assertUniqueCityHallBuilding(
  supabase: SupabaseClient,
  officeId: string,
  label: string | null | undefined,
  excludeObjectId?: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!isCityHallLabel(label)) {
    return { ok: true };
  }

  const existingId = await findExistingCityHallBuildingId(supabase, officeId, excludeObjectId);
  if (existingId) {
    return { ok: false, error: DUPLICATE_CITY_HALL_ERROR, status: 409 };
  }

  return { ok: true };
}
