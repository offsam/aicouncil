import { AI_COUNCIL_OFFICE_ID } from "../ai-council-ids";
import { getSupabaseAdmin } from "../supabase/admin";

function truncate(text: string, max: number): string {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max).trim() + "…";
}

function extractKeywords(taskText: string): string[] {
  return taskText
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length >= 4)
    .slice(0, 8);
}

/**
 * Server-side read-only diagnostic bundle for Tech Department agents.
 * Injected as systemPromptPrefix — not via tool-calling (v1).
 */
export async function buildTechDepartmentDiagnosticContext(
  taskText: string,
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const keywords = extractKeywords(taskText);

  const [routingRes, archiveRes, connectionsRes, assignmentsRes, buildingsRes] =
    await Promise.all([
      supabase
        .from("routing_logs")
        .select(
          "id, task_text, method, outcome, routing_action, routing_matched_by, routing_confidence, routing_reasoning, routing_trace, chosen_target_entity_registry_id, agent_count, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("chamber_archive")
        .select("id, entity_registry_id, type, content, created_at")
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("connections")
        .select(
          "id, source_entity_id, target_entity_id, is_active, priority, created_at, connection_permissions(read_knowledge, read_rules, read_results, send_tasks)",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("agent_assignments")
        .select("agent_id, chamber_id, role, agents(name, provider), chambers(name, entity_registry_id)")
        .limit(200),
      supabase
        .from("entity_registry")
        .select("id, entity_type, name, slug, routing_description, parent_entity_id")
        .eq("entity_type", "building"),
    ]);

  const entityNameById = new Map<string, string>();
  for (const b of buildingsRes.data ?? []) {
    entityNameById.set(b.id, `${b.name} (${b.slug})`);
  }

  const { data: chamberEntities } = await supabase
    .from("entity_registry")
    .select("id, name, slug, entity_type")
    .in("entity_type", ["chamber", "building", "agent"])
    .limit(500);

  for (const e of chamberEntities ?? []) {
    entityNameById.set(e.id, `${e.name} [${e.entity_type}/${e.slug}]`);
  }

  let routingRows = routingRes.data ?? [];
  if (keywords.length > 0) {
    const filtered = routingRows.filter((row) => {
      const hay = `${row.task_text ?? ""} ${row.routing_reasoning ?? ""} ${row.method ?? ""}`.toLowerCase();
      return keywords.some((k) => hay.includes(k));
    });
    if (filtered.length > 0) routingRows = filtered.slice(0, 20);
  }

  const routingLines = routingRows.slice(0, 20).map((row) => {
    const target = row.chosen_target_entity_registry_id
      ? entityNameById.get(row.chosen_target_entity_registry_id) ??
        row.chosen_target_entity_registry_id
      : "—";
    const trace =
      Array.isArray(row.routing_trace) && row.routing_trace.length > 0
        ? ` trace=${JSON.stringify(row.routing_trace)}`
        : "";
    const fb =
      row.method === "fallback-blocked"
        ? " [FALLBACK-BLOCKED]"
        : row.routing_trace &&
            JSON.stringify(row.routing_trace).includes("fallback")
          ? " [fallback-related]"
          : "";
    return `- ${row.created_at} method=${row.method}${fb} action=${row.routing_action ?? "—"} target=${target} conf=${row.routing_confidence ?? "—"} task="${truncate(row.task_text ?? "", 120)}" reasoning="${truncate(row.routing_reasoning ?? "", 160)}"${trace}`;
  });

  const archiveLines = (archiveRes.data ?? []).slice(0, 15).map((row) => {
    const entity = entityNameById.get(row.entity_registry_id) ?? row.entity_registry_id;
    return `- ${row.created_at} entity=${entity} type=${row.type}: ${truncate(row.content ?? "", 200)}`;
  });

  const connectionLines = (connectionsRes.data ?? []).slice(0, 30).map((row) => {
    const src = entityNameById.get(row.source_entity_id) ?? row.source_entity_id;
    const tgt = entityNameById.get(row.target_entity_id) ?? row.target_entity_id;
    const perms = Array.isArray(row.connection_permissions)
      ? row.connection_permissions[0]
      : row.connection_permissions;
    const permStr = perms
      ? ` rk=${perms.read_knowledge} rr=${perms.read_rules} rres=${perms.read_results} st=${perms.send_tasks}`
      : "";
    return `- ${row.id.slice(0, 8)}… ${src} → ${tgt} active=${row.is_active}${permStr}`;
  });

  const assignmentLines = (assignmentsRes.data ?? []).slice(0, 40).map((row) => {
    const agent = Array.isArray(row.agents) ? row.agents[0] : row.agents;
    const chamber = Array.isArray(row.chambers) ? row.chambers[0] : row.chambers;
    return `- agent=${agent?.name ?? row.agent_id} (${agent?.provider ?? "?"}) → chamber=${chamber?.name ?? row.chamber_id} role=${row.role ?? "—"}`;
  });

  const buildingLines = (buildingsRes.data ?? []).map(
    (b) => `- ${b.name} id=${b.id}: ${truncate(b.routing_description ?? "—", 160)}`,
  );

  return `[Diagnostic snapshot — read-only, generated ${new Date().toISOString()}]
Office: ${AI_COUNCIL_OFFICE_ID}
User question: "${truncate(taskText, 300)}"

[Buildings]
${buildingLines.length > 0 ? buildingLines.join("\n") : "(none)"}

[Recent routing_logs — newest first]
${routingLines.length > 0 ? routingLines.join("\n") : "(no matching logs)"}

[Recent chamber_archive]
${archiveLines.length > 0 ? archiveLines.join("\n") : "(empty)"}

[Active connections]
${connectionLines.length > 0 ? connectionLines.join("\n") : "(none)"}

[Agent assignments sample]
${assignmentLines.length > 0 ? assignmentLines.join("\n") : "(none)"}

Instructions: Base your answer ONLY on the data above. Cite specific log lines, connections, or assignments when explaining. If evidence is missing, say so explicitly.`;
}

export const TECH_DEPARTMENT_DIAGNOSTIC_ANSWER_PREFIX = `[Tech Department — diagnostic mode]
You diagnose system behavior using the Diagnostic snapshot below. Be concise, technical, and factual. No speculation beyond the provided data.`;
