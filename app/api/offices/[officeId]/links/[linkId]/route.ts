import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ officeId: string; linkId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: true });
  }

  const { officeId, linkId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("office_links")
      .delete()
      .eq("id", linkId)
      .eq("office_id", officeId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
