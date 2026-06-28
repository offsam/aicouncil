import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ chamberId: string; entryId: string }> };

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { chamberId, entryId } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: chamber, error: chamberError } = await supabase
      .from("chambers")
      .select("entity_registry_id")
      .eq("id", chamberId)
      .maybeSingle();

    if (chamberError) {
      return NextResponse.json({ error: chamberError.message }, { status: 500 });
    }
    if (!chamber?.entity_registry_id) {
      return NextResponse.json({ error: "Отдел не найден" }, { status: 404 });
    }

    const { data: entry, error: entryError } = await supabase
      .from("chamber_archive")
      .select("id, entity_registry_id")
      .eq("id", entryId)
      .maybeSingle();

    if (entryError) {
      return NextResponse.json({ error: entryError.message }, { status: 500 });
    }
    if (!entry) {
      return NextResponse.json({ error: "Запись архива не найдена" }, { status: 404 });
    }
    if (entry.entity_registry_id !== chamber.entity_registry_id) {
      return NextResponse.json({ error: "Запись не принадлежит этому отделу" }, { status: 403 });
    }

    const { error: deleteError } = await supabase.from("chamber_archive").delete().eq("id", entryId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
