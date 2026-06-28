import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = {
  params: Promise<{ officeId: string; buildingId: string; chamberId: string }>;
};

function chamberBelongsToBuilding(
  chamber: { building_object_id: string | null; building_entity_id: string | null },
  buildingId: string,
): boolean {
  return (
    chamber.building_object_id === buildingId || chamber.building_entity_id === buildingId
  );
}

function chamberBelongsToAnyBuilding(
  chamber: { building_object_id: string | null; building_entity_id: string | null },
  buildingIds: string[],
): boolean {
  return buildingIds.some((id) => id && chamberBelongsToBuilding(chamber, id));
}

async function loadChamberRoutingDescription(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  entityRegistryId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("entity_registry")
    .select("routing_description")
    .eq("id", entityRegistryId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data?.routing_description ?? null;
}

async function findChamberByRouteId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  chamberId: string,
) {
  const { data, error } = await supabase
    .from("chambers")
    .select("id, entity_registry_id, building_object_id, building_entity_id, name, x, z, width, depth, color")
    .eq("id", chamberId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (data) return data;

  const { data: byRegistry, error: registryError } = await supabase
    .from("chambers")
    .select("id, entity_registry_id, building_object_id, building_entity_id, name, x, z, width, depth, color")
    .eq("entity_registry_id", chamberId)
    .maybeSingle();

  if (registryError) {
    throw new Error(registryError.message);
  }

  return byRegistry;
}

export async function GET(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { buildingId, chamberId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const existing = await findChamberByRouteId(supabase, chamberId);

    if (!existing) {
      return NextResponse.json({ error: "Отдел не найден" }, { status: 404 });
    }

    const resolvedBuildingId =
      existing.building_object_id || existing.building_entity_id || buildingId;
    if (
      !chamberBelongsToAnyBuilding(existing, [buildingId, resolvedBuildingId])
    ) {
      return NextResponse.json({ error: "Отдел не принадлежит зданию" }, { status: 400 });
    }

    const routingDescription = await loadChamberRoutingDescription(
      supabase,
      existing.entity_registry_id,
    );

    return NextResponse.json({ chamber: existing, routingDescription });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { buildingId, chamberId } = await params;

  try {
    const body = (await request.json()) as {
      name?: string;
      x?: number;
      z?: number;
      width?: number;
      depth?: number;
      routing_description?: string | null;
      color?: string;
    };

    const supabase = getSupabaseAdmin();

    const existing = await findChamberByRouteId(supabase, chamberId);

    if (!existing) {
      return NextResponse.json({ error: "Отдел не найден" }, { status: 404 });
    }

    const resolvedBuildingId =
      existing.building_object_id || existing.building_entity_id || buildingId;
    if (!chamberBelongsToAnyBuilding(existing, [buildingId, resolvedBuildingId])) {
      return NextResponse.json({ error: "Отдел не принадлежит зданию" }, { status: 400 });
    }

    const chamberDbId = existing.id;

    const chamberPatch: Record<string, unknown> = {};
    if (body.name !== undefined) chamberPatch.name = body.name.trim();
    if (body.x !== undefined) chamberPatch.x = body.x;
    if (body.z !== undefined) chamberPatch.z = body.z;
    if (body.width !== undefined) chamberPatch.width = body.width;
    if (body.depth !== undefined) chamberPatch.depth = body.depth;
    if (body.color !== undefined) chamberPatch.color = body.color.trim() || null;

    if (Object.keys(chamberPatch).length > 0) {
      const { data: chamber, error: updateError } = await supabase
        .from("chambers")
        .update(chamberPatch)
        .eq("id", chamberDbId)
        .select("*")
        .single();

      if (updateError || !chamber) {
        return NextResponse.json({ error: updateError?.message || "Update failed" }, { status: 500 });
      }

      const registryPatch: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = body.name.trim();
        registryPatch.name = name;
        registryPatch.slug = name.toLowerCase().replace(/[^a-zA-Z0-9]+/g, "-");
      }
      if (body.routing_description !== undefined) {
        registryPatch.routing_description = body.routing_description?.trim() || null;
      }

      if (Object.keys(registryPatch).length > 0) {
        const { error: registryError } = await supabase
          .from("entity_registry")
          .update(registryPatch)
          .eq("id", existing.entity_registry_id);
        if (registryError) {
          return NextResponse.json({ error: registryError.message }, { status: 500 });
        }
      }

      const routingDescription = await loadChamberRoutingDescription(
        supabase,
        existing.entity_registry_id,
      );

      return NextResponse.json({ chamber, routingDescription });
    }

    if (body.routing_description !== undefined) {
      const { error: registryError } = await supabase
        .from("entity_registry")
        .update({ routing_description: body.routing_description?.trim() || null })
        .eq("id", existing.entity_registry_id);
      if (registryError) {
        return NextResponse.json({ error: registryError.message }, { status: 500 });
      }
    }

    const { data: chamber } = await supabase
      .from("chambers")
      .select("*")
      .eq("id", chamberDbId)
      .single();

    const routingDescription = await loadChamberRoutingDescription(
      supabase,
      existing.entity_registry_id,
    );

    return NextResponse.json({ chamber, routingDescription });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { buildingId, chamberId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const chamber = await findChamberByRouteId(supabase, chamberId);

    if (!chamber) {
      return NextResponse.json({ error: "Отдел не найден" }, { status: 404 });
    }

    const resolvedBuildingId =
      chamber.building_object_id || chamber.building_entity_id || buildingId;
    if (!chamberBelongsToAnyBuilding(chamber, [buildingId, resolvedBuildingId])) {
      return NextResponse.json({ error: "Отдел не принадлежит зданию" }, { status: 400 });
    }

    const registryId = chamber.entity_registry_id;

    const { error: workflowStepsError } = await supabase
      .from("workflow_steps")
      .delete()
      .eq("target_chamber_entity_id", registryId);

    if (workflowStepsError) {
      return NextResponse.json({ error: workflowStepsError.message }, { status: 500 });
    }

    const { error: deleteError } = await supabase
      .from("entity_registry")
      .delete()
      .eq("id", registryId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
