import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("chambers")
      .select(`
        id,
        entity_registry_id,
        building_entity_id,
        building_object_id,
        manager_agent_id,
        routing_role,
        name,
        x,
        z,
        width,
        depth,
        created_at,
        entity_registry!entity_registry_id(id, name, slug, entity_type, parent_entity_id, routing_description)
      `)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ chambers: data || [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
