import { NextRequest, NextResponse } from "next/server";
import { cancelTechStructurePlan } from "@/lib/tech-department/structure-execute";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { planId?: string };
    const planId = body.planId?.trim();
    if (!planId) {
      return NextResponse.json({ error: "planId обязателен" }, { status: 400 });
    }

    await cancelTechStructurePlan(planId);
    return NextResponse.json({ ok: true, planId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
