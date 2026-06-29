import { NextRequest, NextResponse } from "next/server";
import {
  parseSystemLlmProvider,
  parseSystemLlmRoleParam,
  updateSystemLlmRoleForOffice,
  type UpdateSystemLlmRolePatch,
} from "@/lib/system-llm-roles";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ officeId: string; role: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId, role: roleParam } = await params;
  const role = parseSystemLlmRoleParam(roleParam);
  if (!role) {
    return NextResponse.json({ error: "role must be planner, router, or summary" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: office, error: officeError } = await supabase
      .from("offices")
      .select("id")
      .eq("id", officeId)
      .maybeSingle();

    if (officeError || !office) {
      return NextResponse.json({ error: "Офис не найден" }, { status: 404 });
    }

    const body = (await request.json()) as {
      primaryProvider?: string;
      primaryModel?: string;
      fallbackProvider?: string;
      fallbackModel?: string;
    };

    const primaryProvider =
      body.primaryProvider !== undefined ? parseSystemLlmProvider(body.primaryProvider) : undefined;
    const fallbackProvider =
      body.fallbackProvider !== undefined ? parseSystemLlmProvider(body.fallbackProvider) : undefined;

    if (body.primaryProvider !== undefined && !primaryProvider) {
      return NextResponse.json({ error: "Invalid primaryProvider" }, { status: 400 });
    }
    if (body.fallbackProvider !== undefined && !fallbackProvider) {
      return NextResponse.json({ error: "Invalid fallbackProvider" }, { status: 400 });
    }

    const patch: UpdateSystemLlmRolePatch = {};
    if (primaryProvider) {
      patch.primaryProvider = primaryProvider;
      patch.primaryModel = body.primaryModel;
    }
    if (fallbackProvider) {
      patch.fallbackProvider = fallbackProvider;
      patch.fallbackModel = body.fallbackModel;
    }

    const updated = await updateSystemLlmRoleForOffice(officeId, role, patch);

    return NextResponse.json({ role: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    const status = message.includes("задаются вместе") || message.includes("Укажите") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
