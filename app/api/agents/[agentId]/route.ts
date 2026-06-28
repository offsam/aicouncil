import { NextRequest, NextResponse } from "next/server";
import { withComputedStatus } from "@/lib/agent-status";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ agentId: string }> };

/** Только назначение агента в офис (PATCH). Данные агента — GET /api/offices/[officeId]/agents/[agentId] */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { agentId } = await params;

  try {
    const body = (await request.json()) as { office_id?: string | null };
    if (body.office_id === undefined) {
      return NextResponse.json({ error: "office_id обязателен" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (body.office_id) {
      const { data: office, error: officeError } = await supabase
        .from("offices")
        .select("id")
        .eq("id", body.office_id)
        .single();

      if (officeError || !office) {
        return NextResponse.json({ error: "Офис не найден" }, { status: 404 });
      }
    }

    const { data, error } = await supabase
      .from("agents")
      .update({ office_id: body.office_id })
      .eq("id", agentId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ agent: withComputedStatus(data) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
