import { NextResponse } from "next/server";
import { listSystemLlmRolesForOffice } from "@/lib/system-llm-roles";
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
      .select("id")
      .eq("id", officeId)
      .maybeSingle();

    if (officeError || !office) {
      return NextResponse.json({ error: "Офис не найден" }, { status: 404 });
    }

    const roles = await listSystemLlmRolesForOffice(officeId);
    return NextResponse.json({ officeId, roles });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
