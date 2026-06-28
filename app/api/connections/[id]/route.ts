import { NextRequest, NextResponse } from "next/server";
import {
  fetchConnectionById,
  updateConnectionFields,
} from "@/lib/supabase/connections-query";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { id } = await params;

  try {
    const body = await request.json() as {
      priority?: number;
      is_active?: boolean;
      route_path?: { version: 1; points: Array<{ x: number; y: number }> } | null;
      color?: string | null;
      read_knowledge?: boolean;
      read_rules?: boolean;
      read_results?: boolean;
      send_tasks?: boolean;
    };

    const { priority, is_active, route_path, color, read_knowledge, read_rules, read_results, send_tasks } = body;
    const supabase = getSupabaseAdmin();

    // 1. Update connections fields if provided
    if (priority !== undefined || is_active !== undefined || route_path !== undefined || color !== undefined) {
      const connUpdate: Record<string, unknown> = {};
      if (priority !== undefined) connUpdate.priority = priority;
      if (is_active !== undefined) connUpdate.is_active = is_active;
      if (route_path !== undefined) connUpdate.route_path = route_path;
      if (color !== undefined) connUpdate.color = color;

      const { error: connErr } = await updateConnectionFields(supabase, id, connUpdate);

      if (connErr) {
        return NextResponse.json({ error: connErr.message }, { status: 500 });
      }
    }

    // 2. Update permissions fields if provided
    if (
      read_knowledge !== undefined ||
      read_rules !== undefined ||
      read_results !== undefined ||
      send_tasks !== undefined
    ) {
      const permUpdate: Record<string, any> = {};
      if (read_knowledge !== undefined) permUpdate.read_knowledge = read_knowledge;
      if (read_rules !== undefined) permUpdate.read_rules = read_rules;
      if (read_results !== undefined) permUpdate.read_results = read_results;
      if (send_tasks !== undefined) permUpdate.send_tasks = send_tasks;

      const { error: permErr } = await supabase
        .from("connection_permissions")
        .update(permUpdate)
        .eq("connection_id", id);

      if (permErr) {
        return NextResponse.json({ error: permErr.message }, { status: 500 });
      }
    }

    // 3. Retrieve updated connection row
    const { data: updated, error: fetchErr } = await fetchConnectionById(supabase, id);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    return NextResponse.json({ connection: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("connections")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
