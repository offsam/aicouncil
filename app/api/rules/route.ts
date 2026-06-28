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
      .from("rules")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rules: data ?? [] });
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
      rule_text?: string;
      object_id?: string | null;
    };

    const { entity_type, entity_id, rule_text, object_id } = body;

    if (!entity_type || !entity_id || !rule_text) {
      return NextResponse.json({ error: "entity_type, entity_id и rule_text обязательны" }, { status: 400 });
    }

    const entityRegistryId = await resolveEntityRegistryId(entity_type, entity_id);
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("rules")
      .insert({
        entity_type,
        entity_id,
        entity_registry_id: entityRegistryId,
        rule_text,
        object_id: object_id || null,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
