import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { resolveEntityRegistryId } from "@/lib/resolve-entity-registry-id";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entity_type");
  const entityId = searchParams.get("entity_id");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entity_type и entity_id обязательны" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("knowledge")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entries: data ?? [] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      entity_type?: string;
      entity_id?: string;
      title?: string;
      content?: string;
      body?: string | null;
      object_id?: string | null;
      file_url?: string | null;
    };

    const { entity_type, entity_id, title, content, body: knowledgeBody, object_id, file_url } = body;

    if (!entity_type || !entity_id || !title) {
      return NextResponse.json({ error: "entity_type, entity_id и title обязательны" }, { status: 400 });
    }

    const entityRegistryId = await resolveEntityRegistryId(entity_type, entity_id);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("knowledge")
      .insert({
        entity_type,
        entity_id,
        entity_registry_id: entityRegistryId,
        title,
        content: content || "",
        body: knowledgeBody ?? null,
        object_id: object_id || null,
        file_url: file_url || null,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entry: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
