import { NextRequest, NextResponse } from "next/server";
import { executeTechStructurePlan } from "@/lib/tech-department/structure-execute";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

/**
 * Step 2 of confirmation gate: execute a pending structure plan after user confirms.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { planId?: string; confirmed?: boolean };
    const planId = body.planId?.trim();
    if (!planId) {
      return NextResponse.json({ error: "planId обязателен" }, { status: 400 });
    }
    if (body.confirmed !== true) {
      return NextResponse.json(
        { error: "Требуется confirmed: true для выполнения плана" },
        { status: 400 },
      );
    }

    const result = await executeTechStructurePlan(planId);
    return NextResponse.json({
      ok: true,
      planId: result.planId,
      executed: result.executed,
      message: `Выполнено ${result.executed.filter((e) => e.ok).length} шаг(ов).`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
