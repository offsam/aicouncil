import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ officeId: string; entryId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId, entryId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("knowledge")
      .delete()
      .eq("id", entryId)
      .eq("entity_type", "city")
      .eq("entity_id", officeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
