import { NextRequest, NextResponse } from "next/server";
import { validateConnectionEntities } from "@/lib/entity-registry-ensure";
import { fetchConnectionsList } from "@/lib/supabase/connections-query";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { NEW_CONNECTION_PERMISSIONS } from "@/lib/workspace/workspace-connections";

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await fetchConnectionsList(supabase);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ connections: data || [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const body = await request.json() as {
      source_entity_id?: string;
      target_entity_id?: string;
      priority?: number;
      is_active?: boolean;
      read_knowledge?: boolean;
      read_rules?: boolean;
      read_results?: boolean;
      send_tasks?: boolean;
    };

    const {
      source_entity_id,
      target_entity_id,
      priority = 0,
      is_active = true,
      read_knowledge = NEW_CONNECTION_PERMISSIONS.read_knowledge,
      read_rules = NEW_CONNECTION_PERMISSIONS.read_rules,
      read_results = NEW_CONNECTION_PERMISSIONS.read_results,
      send_tasks = NEW_CONNECTION_PERMISSIONS.send_tasks,
    } = body;

    if (!source_entity_id || !target_entity_id) {
      return NextResponse.json({ error: "source_entity_id и target_entity_id обязательны" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    const validation = await validateConnectionEntities(
      supabase,
      source_entity_id,
      target_entity_id,
    );
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("connections")
      .select("id")
      .eq("source_entity_id", source_entity_id)
      .eq("target_entity_id", target_entity_id)
      .eq("is_active", true)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "Связь между этими объектами уже существует" },
        { status: 409 },
      );
    }

    // 1. Insert connection
    const { data: conn, error: connErr } = await supabase
      .from("connections")
      .insert({
        source_entity_id,
        target_entity_id,
        priority,
        is_active,
      })
      .select("*")
      .single();

    if (connErr || !conn) {
      return NextResponse.json({ error: connErr?.message || "Failed to create connection" }, { status: 500 });
    }

    // 2. Insert connection permissions
    const { data: perms, error: permsErr } = await supabase
      .from("connection_permissions")
      .insert({
        connection_id: conn.id,
        read_knowledge,
        read_rules,
        read_results,
        send_tasks,
      })
      .select("*")
      .single();

    if (permsErr) {
      // rollback connection if permissions insert fails
      await supabase.from("connections").delete().eq("id", conn.id);
      return NextResponse.json({ error: permsErr.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        connection: {
          ...conn,
          connection_permissions: perms,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
