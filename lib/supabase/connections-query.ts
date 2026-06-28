import type { SupabaseClient } from "@supabase/supabase-js";

const CONNECTION_JOINS = `
  source:entity_registry!source_entity_id(name, slug, entity_type),
  target:entity_registry!target_entity_id(name, slug, entity_type),
  connection_permissions(read_knowledge, read_rules, read_results, send_tasks)
`;

const CONNECTION_SELECT_BASE = `
  id,
  source_entity_id,
  target_entity_id,
  priority,
  is_active,
  route_path,
  created_at,
  ${CONNECTION_JOINS}
`;

const CONNECTION_SELECT_WITH_COLOR = `
  id,
  source_entity_id,
  target_entity_id,
  priority,
  is_active,
  route_path,
  color,
  created_at,
  ${CONNECTION_JOINS}
`;

function missingColorColumn(message: string | undefined): boolean {
  return Boolean(message?.includes("connections.color"));
}

export async function fetchConnectionsList(supabase: SupabaseClient) {
  const withColor = await supabase
    .from("connections")
    .select(CONNECTION_SELECT_WITH_COLOR)
    .order("created_at", { ascending: false });

  if (!withColor.error) {
    return withColor;
  }
  if (!missingColorColumn(withColor.error.message)) {
    return withColor;
  }

  const fallback = await supabase
    .from("connections")
    .select(CONNECTION_SELECT_BASE)
    .order("created_at", { ascending: false });

  if (fallback.error) return fallback;

  return {
    ...fallback,
    data: (fallback.data ?? []).map((row) => ({ ...row, color: null })),
  };
}

export async function fetchConnectionById(supabase: SupabaseClient, id: string) {
  const withColor = await supabase
    .from("connections")
    .select(CONNECTION_SELECT_WITH_COLOR)
    .eq("id", id)
    .single();

  if (!withColor.error) {
    return withColor;
  }
  if (!missingColorColumn(withColor.error.message)) {
    return withColor;
  }

  const fallback = await supabase
    .from("connections")
    .select(CONNECTION_SELECT_BASE)
    .eq("id", id)
    .single();

  if (fallback.error || !fallback.data) return fallback;

  return {
    ...fallback,
    data: { ...fallback.data, color: null },
  };
}

export async function updateConnectionFields(
  supabase: SupabaseClient,
  id: string,
  connUpdate: Record<string, unknown>,
) {
  if (Object.keys(connUpdate).length === 0) {
    return { error: null };
  }

  const first = await supabase.from("connections").update(connUpdate).eq("id", id);
  if (!first.error) return first;
  if (!("color" in connUpdate) || !missingColorColumn(first.error.message)) {
    return first;
  }

  const { color: _color, ...rest } = connUpdate;
  if (Object.keys(rest).length === 0) {
    return { error: null };
  }
  return supabase.from("connections").update(rest).eq("id", id);
}
