import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { LogStatus } from "@/lib/office-types";

type RouteParams = { params: Promise<{ logId: string }> };

interface PatchBody {
  status: LogStatus;
  response?: string;
  latency_ms?: number;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: "Supabase не настроен" });
  }

  const { logId } = await params;

  try {
    const body = (await request.json()) as PatchBody;
    if (body.status !== "success" && body.status !== "error" && body.status !== "pending") {
      return NextResponse.json({ error: "Недопустимый status" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("request_logs")
      .update({
        status: body.status,
        response: body.response ?? null,
        latency_ms: body.latency_ms ?? null,
      })
      .eq("id", logId)
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
