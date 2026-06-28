import { NextRequest, NextResponse } from "next/server";
import { withComputedStatus } from "@/lib/agent-status";
import { CITY } from "@/lib/city-labels";
import { ensureBuildingRegistry } from "@/lib/entity-registry-ensure";
import { isPositionInBounds, isRoomInBounds, isWallInBounds } from "@/lib/office-bounds";
import type { AgentRow, OfficeObjectType } from "@/lib/office-types";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { assertUniqueCityHallBuilding } from "@/lib/workspace/city-hall-uniqueness";

type RouteParams = { params: Promise<{ officeId: string; objectId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId, objectId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("office_objects")
      .select("*, agents(*)")
      .eq("id", objectId)
      .eq("office_id", officeId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    }

    const { data: registryRow, error: registryError } = await supabase
      .from("entity_registry")
      .select("routing_description")
      .eq("id", objectId)
      .maybeSingle();

    if (registryError) {
      return NextResponse.json({ error: registryError.message }, { status: 500 });
    }

    const agent = existing.agents as AgentRow | null;
    return NextResponse.json({
      object: {
        ...existing,
        agents: agent ? withComputedStatus(agent) : null,
      },
      routingDescription: registryRow?.routing_description ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId, objectId } = await params;

  try {
    const body = (await request.json()) as {
      position_x?: number;
      position_z?: number;
      rotation_y?: number;
      color?: string | null;
      label?: string | null;
      size_w?: number;
      size_d?: number;
      routing_description?: string | null;
    };

    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("office_objects")
      .select("*")
      .eq("id", objectId)
      .eq("office_id", officeId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    }

    if (existing.object_type === "room" && body.label !== undefined) {
      const uniqueCityHall = await assertUniqueCityHallBuilding(
        supabase,
        officeId,
        body.label?.trim() || null,
        objectId,
      );
      if (!uniqueCityHall.ok) {
        return NextResponse.json({ error: uniqueCityHall.error }, { status: uniqueCityHall.status });
      }
    }

    const positionX = body.position_x ?? existing.position_x;
    const positionZ = body.position_z ?? existing.position_z;
    const rotationY = body.rotation_y ?? existing.rotation_y;
    const objectType = existing.object_type as OfficeObjectType;

    if (objectType === "wall") {
      const length = body.size_w ?? existing.size_w ?? 2;
      if (!isWallInBounds(positionX, positionZ, rotationY, length)) {
        return NextResponse.json({ error: CITY.outsideCity }, { status: 400 });
      }
    } else if (
      objectType !== "room" &&
      !isPositionInBounds(positionX, positionZ, objectType, rotationY)
    ) {
      return NextResponse.json({ error: CITY.outsideCity }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("office_objects")
      .update({
        position_x: positionX,
        position_z: positionZ,
        rotation_y: rotationY,
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.label !== undefined ? { label: body.label?.trim() || null } : {}),
        ...(objectType === "wall" && body.size_w !== undefined ? { size_w: body.size_w } : {}),
        ...(objectType === "room" && body.size_w !== undefined ? { size_w: body.size_w } : {}),
        ...(objectType === "room" && body.size_d !== undefined ? { size_d: body.size_d } : {}),
      })
      .eq("id", objectId)
      .select("*, agents(*)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (objectType === "room") {
      await ensureBuildingRegistry(
        supabase,
        { id: data.id, label: data.label, office_id: officeId },
      );
    }

    if (objectType === "room" && body.label !== undefined) {
      const newLabel = body.label?.trim() || `Building ${objectId.substring(0, 8)}`;
      const newSlug = `building-${objectId.substring(0, 8)}`;
      await supabase
        .from("entity_registry")
        .update({ name: newLabel, slug: newSlug })
        .eq("id", objectId);
    }

    if (body.routing_description !== undefined) {
      await supabase
        .from("entity_registry")
        .update({ routing_description: body.routing_description?.trim() || null })
        .eq("id", objectId);
    }

    const agent = data.agents as AgentRow | null;
    return NextResponse.json({
      object: {
        ...data,
        agents: agent ? withComputedStatus(agent) : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId, objectId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("office_objects")
      .select("*")
      .eq("id", objectId)
      .eq("office_id", officeId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Объект не найден" }, { status: 404 });
    }

    if (existing.object_type === "desk" && existing.agent_id) {
      await supabase
        .from("agents")
        .update({ office_id: officeId })
        .eq("id", existing.agent_id);
    }

    const { error } = await supabase
      .from("office_objects")
      .delete()
      .eq("id", objectId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabase
      .from("entity_registry")
      .delete()
      .eq("id", objectId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
