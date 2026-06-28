import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { id } = await params;

  try {
    const body = (await request.json()) as { outcome?: string };
    const outcome = body.outcome;

    if (outcome !== "good" && outcome !== "bad") {
      return NextResponse.json({ error: "outcome must be 'good' or 'bad'" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("routing_logs")
      .update({ outcome })
      .eq("id", id)
      .select("id, outcome, chosen_target_entity_registry_id, task_text")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message || "Routing log not found" }, { status: 404 });
    }

    return NextResponse.json({ log: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
