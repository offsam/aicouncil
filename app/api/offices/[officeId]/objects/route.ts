import { NextRequest, NextResponse } from "next/server";
import { withComputedStatus } from "@/lib/agent-status";
import { CITY } from "@/lib/city-labels";
import { ensureBuildingRegistry, ensureCityRegistry } from "@/lib/entity-registry-ensure";
import { isPositionInBounds, isRoomInBounds, isWallInBounds } from "@/lib/office-bounds";
import type { AgentRow, OfficeObjectType } from "@/lib/office-types";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { assertUniqueCityHallBuilding } from "@/lib/workspace/city-hall-uniqueness";

type RouteParams = { params: Promise<{ officeId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("office_objects")
      .select("*, agents(*)")
      .eq("office_id", officeId)
      .order("created_at");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const objects = (data ?? []).map((row) => ({
      ...row,
      agents: row.agents ? withComputedStatus(row.agents as AgentRow) : null,
    }));

    const roomIds = objects.filter((o) => o.object_type === "room").map((o) => o.id);
    if (roomIds.length > 0) {
      const { data: roleRows } = await supabase
        .from("entity_registry")
        .select("id, building_role")
        .in("id", roomIds);
      const roleById = new Map((roleRows ?? []).map((r) => [r.id, r.building_role]));
      for (const obj of objects) {
        if (obj.object_type === "room") {
          (obj as { building_role?: string | null }).building_role =
            roleById.get(obj.id) ?? null;
        }
      }
    }

    const { data: officeRow } = await supabase
      .from("offices")
      .select("name")
      .eq("id", officeId)
      .maybeSingle();

    await ensureCityRegistry(supabase, officeId, officeRow?.name);
    for (const obj of objects) {
      if (obj.object_type === "room") {
        await ensureBuildingRegistry(supabase, { ...obj, office_id: officeId }, officeRow?.name);
      }
    }

    return NextResponse.json({ objects });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId } = await params;

  try {
    const body = (await request.json()) as {
      object_type?: OfficeObjectType;
      position_x?: number;
      position_z?: number;
      rotation_y?: number;
      agent_id?: string | null;
      color?: string | null;
      size_w?: number;
      size_d?: number;
      label?: string | null;
      routing_description?: string | null;
    };

    const objectType = body.object_type;
    const positionX = body.position_x;
    const positionZ = body.position_z;

    if (!objectType || positionX === undefined || positionZ === undefined) {
      return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
    }

    if (objectType === "room") {
      const sizeW = body.size_w;
      const sizeD = body.size_d;
      const label = body.label?.trim() || null;
      const routingDescription = body.routing_description?.trim() || null;
      if (sizeW === undefined || sizeD === undefined || sizeW <= 0 || sizeD <= 0) {
        return NextResponse.json({ error: "room требует size_w и size_d" }, { status: 400 });
      }
      if (!label) {
        return NextResponse.json({ error: "room требует label" }, { status: 400 });
      }
      if (!routingDescription) {
        return NextResponse.json(
          { error: "room требует routing_description" },
          { status: 400 },
        );
      }
      /* Workspace uses unbounded coords; 3D floor clamps on render. */
    } else if (objectType === "wall") {
      const length = body.size_w ?? 2;
      if (length <= 0) {
        return NextResponse.json({ error: "wall требует положительный size_w" }, { status: 400 });
      }
      if (!isWallInBounds(positionX, positionZ, body.rotation_y ?? 0, length)) {
        return NextResponse.json({ error: "Стена за пределами площадки" }, { status: 400 });
      }
    } else if (
      !isPositionInBounds(positionX, positionZ, objectType, body.rotation_y ?? 0)
    ) {
      return NextResponse.json({ error: CITY.outsideCity }, { status: 400 });
    }

    if (objectType === "desk" && !body.agent_id) {
      return NextResponse.json({ error: "desk требует agent_id" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (objectType === "desk" && body.agent_id) {
      const { data: agent, error: agentError } = await supabase
        .from("agents")
        .select("office_id")
        .eq("id", body.agent_id)
        .single();

      if (agentError || !agent || agent.office_id !== officeId) {
        return NextResponse.json(
          { error: CITY.agentNotInCity },
          { status: 400 },
        );
      }
    }

    if (objectType === "room") {
      const uniqueCityHall = await assertUniqueCityHallBuilding(
        supabase,
        officeId,
        body.label?.trim() || null,
      );
      if (!uniqueCityHall.ok) {
        return NextResponse.json({ error: uniqueCityHall.error }, { status: uniqueCityHall.status });
      }
    }

    const { data, error } = await supabase
      .from("office_objects")
      .insert({
        office_id: officeId,
        object_type: objectType,
        position_x: positionX,
        position_z: positionZ,
        rotation_y: body.rotation_y ?? 0,
        agent_id: objectType === "desk" ? body.agent_id : null,
        color: body.color ?? null,
        size_w:
          objectType === "room" || objectType === "wall"
            ? (body.size_w ?? (objectType === "wall" ? 2 : undefined))
            : null,
        size_d: objectType === "room" ? body.size_d : null,
        label: objectType === "room" ? body.label?.trim() || null : null,
      })
      .select("*, agents(*)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (objectType === "room") {
      await ensureBuildingRegistry(
        supabase,
        {
          id: data.id,
          label: data.label,
          routing_description: body.routing_description?.trim() || null,
          office_id: officeId,
        },
        undefined,
      );
    }

    const agent = data.agents as AgentRow | null;
    return NextResponse.json(
      {
        object: {
          ...data,
          agents: agent ? withComputedStatus(agent) : null,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
