import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { resolveEntityRegistryId } from "@/lib/resolve-entity-registry-id";

type RouteParams = { params: Promise<{ officeId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("knowledge")
      .select("*")
      .eq("entity_type", "city")
      .eq("entity_id", officeId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const entries = (data ?? []).map((row) => ({
      id: row.id,
      office_id: row.entity_id,
      title: row.title,
      content: row.content || "",
      created_at: row.created_at,
      updated_at: row.created_at,
    }));

    return NextResponse.json({ entries });
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
    const body = (await request.json()) as { title?: string; content?: string };
    const title = body.title?.trim();
    const content = body.content?.trim() ?? "";

    if (!title) {
      return NextResponse.json({ error: "title обязателен" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const entityRegistryId = await resolveEntityRegistryId("city", officeId);
    const { data, error } = await supabase
      .from("knowledge")
      .insert({
        entity_type: "city",
        entity_id: officeId,
        entity_registry_id: entityRegistryId,
        title,
        content,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const mappedEntry = {
      id: data.id,
      office_id: data.entity_id,
      title: data.title,
      content: data.content || "",
      created_at: data.created_at,
      updated_at: data.created_at,
    };

    return NextResponse.json({ entry: mappedEntry }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
