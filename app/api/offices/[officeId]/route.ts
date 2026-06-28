import { NextRequest, NextResponse } from "next/server";
import { AI_COUNCIL_OFFICE_ID } from "@/lib/ai-council-ids";
import { withComputedStatus } from "@/lib/agent-status";
import { attachFloorLayout } from "@/lib/floor-agent-layout";
import { listOfficeAgents } from "@/lib/list-office-agents";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ officeId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("*")
      .eq("id", officeId)
      .single();

    if (officeError || !office) {
      return NextResponse.json({ error: "Офис не найден" }, { status: 404 });
    }

    const agents = await listOfficeAgents(supabase, officeId);
    const agentsWithStatus = agents.map(withComputedStatus);
    const floorAgents = attachFloorLayout(agentsWithStatus);

    return NextResponse.json({
      office,
      agents: agentsWithStatus,
      floorAgents,
      isDefaultOffice: officeId === AI_COUNCIL_OFFICE_ID,
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

  const { officeId } = await params;

  try {
    const body = (await request.json()) as {
      scene_paint?: Record<string, string>;
      workspace_meta?: Record<string, unknown>;
    };

    if (!body.scene_paint && !body.workspace_meta) {
      return NextResponse.json(
        { error: "scene_paint или workspace_meta обязателен" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: existing, error: fetchError } = await supabase
      .from("offices")
      .select("scene_paint, workspace_meta")
      .eq("id", officeId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Офис не найден" }, { status: 404 });
    }

    const patch: Record<string, unknown> = {};
    if (body.scene_paint) patch.scene_paint = body.scene_paint;
    if (body.workspace_meta) {
      patch.workspace_meta = {
        ...(typeof existing.workspace_meta === "object" && existing.workspace_meta
          ? existing.workspace_meta
          : {}),
        ...body.workspace_meta,
      };
    }

    const { data, error } = await supabase
      .from("offices")
      .update(patch)
      .eq("id", officeId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ office: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
