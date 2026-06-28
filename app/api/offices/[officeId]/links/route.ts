import { NextRequest, NextResponse } from "next/server";
import { CITY } from "@/lib/city-labels";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ officeId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ links: [] });
  }

  const { officeId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("office_links")
      .select("*")
      .eq("office_id", officeId)
      .order("created_at");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ links: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId } = await params;

  try {
    const body = (await request.json()) as { to_room_id?: string };
    const toRoomId = body.to_room_id?.trim();

    if (!toRoomId) {
      return NextResponse.json({ error: "to_room_id обязателен" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const { data: room, error: roomError } = await supabase
      .from("office_objects")
      .select("id, object_type")
      .eq("id", toRoomId)
      .eq("office_id", officeId)
      .maybeSingle();

    if (roomError || !room || room.object_type !== "room") {
      return NextResponse.json(
        { error: CITY.buildingNotFound },
        { status: 400 },
      );
    }

    const { data, error } = await supabase
      .from("office_links")
      .insert({ office_id: officeId, to_room_id: toRoomId })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Кабель уже подключён" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ link: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
