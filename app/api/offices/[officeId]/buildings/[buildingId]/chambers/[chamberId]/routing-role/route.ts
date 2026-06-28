import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = {
  params: Promise<{ officeId: string; buildingId: string; chamberId: string }>;
};

type RoutingRoleBody = {
  routing_role?: string | null;
};

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { buildingId, chamberId } = await params;

  try {
    const body = (await request.json()) as RoutingRoleBody;
    if (!("routing_role" in body)) {
      return NextResponse.json({ error: "routing_role обязателен" }, { status: 400 });
    }

    const routingRole = body.routing_role?.trim() || null;
    if (routingRole !== null && routingRole !== "main") {
      return NextResponse.json(
        { error: "routing_role может быть только 'main' или null" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: chamber, error: chamberError } = await supabase
      .from("chambers")
      .select("id, name, entity_registry_id, building_entity_id, building_object_id, routing_role")
      .eq("id", chamberId)
      .maybeSingle();

    if (chamberError || !chamber) {
      return NextResponse.json({ error: "Отдел не найден" }, { status: 404 });
    }

    if (chamber.building_object_id !== buildingId && chamber.building_entity_id !== buildingId) {
      return NextResponse.json({ error: "Отдел не принадлежит зданию" }, { status: 400 });
    }

    let previousMainChamber: { id: string; name: string; entity_registry_id: string } | null = null;
    const clearedMainChamberIds: string[] = [];

    if (routingRole === "main") {
      const { data: existingMain, error: mainError } = await supabase
        .from("chambers")
        .select("id, name, entity_registry_id")
        .eq("building_object_id", buildingId)
        .eq("routing_role", "main")
        .neq("id", chamberId)
        .maybeSingle();

      if (mainError) {
        return NextResponse.json({ error: mainError.message }, { status: 500 });
      }

      if (existingMain) {
        previousMainChamber = existingMain;
        const { error: clearError } = await supabase
          .from("chambers")
          .update({ routing_role: null })
          .eq("id", existingMain.id);

        if (clearError) {
          return NextResponse.json({ error: clearError.message }, { status: 500 });
        }

        clearedMainChamberIds.push(existingMain.id);
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from("chambers")
      .update({ routing_role: routingRole })
      .eq("id", chamberId)
      .select("id, name, entity_registry_id, routing_role, building_object_id, building_entity_id")
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: updateError?.message ?? "Update failed" }, { status: 500 });
    }

    return NextResponse.json({
      chamber: updated,
      previousMainChamber,
      clearedMainChamberIds,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
