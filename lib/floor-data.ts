import { AI_COUNCIL_OFFICE_ID } from "./ai-council-ids";
import { withComputedStatus } from "./agent-status";
import { buildFallbackObjects } from "./floor-objects-storage";
import type { AgentRow, OfficeObjectRow, OfficeRow } from "./office-types";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";

export interface FloorPageData {
  supabaseConfigured: boolean;
  officeId: string;
  office: OfficeRow | null;
  initialObjects: OfficeObjectRow[];
}

export async function getFloorPageData(
  officeId = AI_COUNCIL_OFFICE_ID,
): Promise<FloorPageData> {
  if (!isSupabaseConfigured()) {
    return {
      supabaseConfigured: false,
      officeId,
      office: null,
      initialObjects: buildFallbackObjects(officeId),
    };
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: office } = await supabase
      .from("offices")
      .select("*")
      .eq("id", officeId)
      .single();

    const { data: objects } = await supabase
      .from("office_objects")
      .select("*, agents(*)")
      .eq("office_id", officeId)
      .order("created_at");

    const officeObjects = (objects ?? []).map((row) => ({
      ...row,
      agents: row.agents ? withComputedStatus(row.agents as AgentRow) : null,
    })) as OfficeObjectRow[];

    return {
      supabaseConfigured: true,
      officeId,
      office: office ?? null,
      initialObjects: officeObjects,
    };
  } catch {
    return {
      supabaseConfigured: false,
      officeId,
      office: null,
      initialObjects: buildFallbackObjects(officeId),
    };
  }
}
