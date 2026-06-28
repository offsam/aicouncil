/**
 * Diagnose City Hall invisible connections / ghost connectors.
 * Run: npx tsx scripts/diagnose_city_hall_connections.ts
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "../lib/ai-council-ids";
import {
  buildingsForWorkspaceCanvas,
  chambersOnWorkspaceCanvas,
  chamberRegistryId,
  resolveCanonicalCityHallBuilding,
} from "../lib/workspace/city-hall-building";
import { buildConnectionEdges } from "../lib/workspace/workspace-connections";
import { buildWorkspaceNodes } from "../lib/workspace/build-workspace-graph";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const [{ data: buildings }, { data: chambers }, { data: assignments }, { data: connections }, { data: office }] =
    await Promise.all([
      supabase.from("office_objects").select("*").eq("office_id", AI_COUNCIL_OFFICE_ID),
      supabase.from("chambers").select("*").eq("office_id", AI_COUNCIL_OFFICE_ID),
      supabase.from("agent_assignments").select("*").eq("office_id", AI_COUNCIL_OFFICE_ID),
      supabase
        .from("connections")
        .select(
          "id, source_entity_id, target_entity_id, is_active, created_at, source:entity_registry!connections_source_entity_id_fkey(name, entity_type), target:entity_registry!connections_target_entity_id_fkey(name, entity_type), connection_permissions(*)",
        )
        .eq("is_active", true)
        .order("created_at"),
      supabase.from("offices").select("workspace_meta").eq("id", AI_COUNCIL_OFFICE_ID).single(),
    ]);

  const canonical = resolveCanonicalCityHallBuilding(buildings ?? [], chambers ?? []);
  const visibleBuildings = buildingsForWorkspaceCanvas(buildings ?? [], chambers ?? []);
  const visibleChambers = chambersOnWorkspaceCanvas(chambers ?? [], visibleBuildings);
  const meta = (office?.workspace_meta ?? {}) as Record<string, unknown>;
  const handleAssignments = (meta.connection_handle_assignments ?? {}) as Record<
    string,
    { sourceHandle: string; targetHandle: string }
  >;

  console.log("=== City Hall buildings ===");
  for (const b of buildings ?? []) {
    if (b.label?.trim() !== "City Hall") continue;
    const chCount = (chambers ?? []).filter((c) => c.building_object_id === b.id).length;
    console.log(`  ${b.id} chambers=${chCount}${canonical?.id === b.id ? " [CANONICAL]" : " [DUPLICATE?]"}`);
  }

  console.log("\n=== City Hall chambers on canvas ===");
  for (const c of visibleChambers.filter((ch) => ch.building_object_id === canonical?.id)) {
    console.log(`  ${c.name} registry=${c.entity_registry_id} role=${c.routing_role ?? "null"}`);
  }

  console.log("\n=== Active connections touching City Hall ===");
  const cityHallIds = new Set<string>();
  if (canonical) cityHallIds.add(canonical.id);
  for (const c of visibleChambers) {
    if (c.entity_registry_id) cityHallIds.add(c.entity_registry_id);
  }

  const cityConns = (connections ?? []).filter(
    (c) => cityHallIds.has(c.source_entity_id) || cityHallIds.has(c.target_entity_id),
  );

  for (const c of cityConns) {
    console.log(
      `  ${c.id.slice(0, 8)}… ${c.source?.name ?? c.source_entity_id} -> ${c.target?.name ?? c.target_entity_id}`,
    );
  }

  console.log("\n=== Meta handle assignments vs DB ===");
  for (const [connId, handles] of Object.entries(handleAssignments)) {
    const row = (connections ?? []).find((c) => c.id === connId);
    const inCity = row && (cityHallIds.has(row.source_entity_id) || cityHallIds.has(row.target_entity_id));
    if (!inCity && row) continue;
    console.log(
      `  ${connId.slice(0, 8)}… handles=${handles.sourceHandle}/${handles.targetHandle} active=${row?.is_active ?? "MISSING"}`,
    );
  }

  const orphanAssignments = Object.keys(handleAssignments).filter(
    (id) => !(connections ?? []).some((c) => c.id === id && c.is_active),
  );
  console.log(`\nOrphan/stale assignments (no active connection): ${orphanAssignments.length}`);
  for (const id of orphanAssignments.slice(0, 10)) {
    console.log(`  ${id}`);
  }

  // Simulate edge build
  const chamberRegistryIds = new Set(
    visibleChambers.map((c) => chamberRegistryId(c)).filter(Boolean),
  );
  const buildingRegistryIds = new Set(visibleBuildings.map((b) => b.id));
  const agentRegistryIds = new Set<string>();
  const agentEntityToNodeId = new Map<string, string>();
  for (const a of assignments ?? []) {
    agentRegistryIds.add(a.agent_id);
    agentEntityToNodeId.set(a.agent_id, `assignment-${a.id}`);
  }

  const nodes = buildWorkspaceNodes(
    AI_COUNCIL_OFFICE_ID,
    "AI Council",
    meta as never,
    visibleBuildings,
    visibleChambers,
    assignments ?? [],
  );

  const { edges, nodeHandles } = buildConnectionEdges(
    connections ?? [],
    { chamberRegistryIds, buildingRegistryIds, agentRegistryIds, agentEntityToNodeId },
    nodes,
    (meta.connection_handle_positions ?? {}) as never,
    (meta.extra_connection_handles ?? {}) as never,
    handleAssignments,
  );

  console.log("\n=== Edge build simulation ===");
  console.log(`Active connections total: ${(connections ?? []).length}`);
  console.log(`Edges rendered: ${edges.length}`);
  console.log(`City Hall connections in DB: ${cityConns.length}`);

  const cityEdges = edges.filter((e) => {
    const d = e.data as { connectionId?: string };
    return cityConns.some((c) => c.id === d.connectionId);
  });
  console.log(`City Hall edges rendered: ${cityEdges.length}`);

  for (const c of cityConns) {
    const edge = edges.find((e) => (e.data as { connectionId?: string }).connectionId === c.id);
    if (!edge) {
      console.log(`  INVISIBLE CABLE: ${c.source?.name} -> ${c.target?.name} (${c.id})`);
      const srcOnCanvas = nodes.some((n) => n.id === c.source_entity_id);
      const tgtOnCanvas = nodes.some((n) => n.id === c.target_entity_id);
      console.log(`    source on canvas: ${srcOnCanvas}, target on canvas: ${tgtOnCanvas}`);
      const handles = nodeHandles.get(c.source_entity_id)?.length ?? 0;
      const handlesT = nodeHandles.get(c.target_entity_id)?.length ?? 0;
      console.log(`    ghost handle slots: source=${handles}, target=${handlesT}`);
    }
  }

  // Duplicate pairs
  const pairs = new Map<string, typeof cityConns>();
  for (const c of cityConns) {
    const key = `${c.source_entity_id}->${c.target_entity_id}`;
    pairs.set(key, [...(pairs.get(key) ?? []), c]);
  }
  console.log("\n=== Duplicate active pairs ===");
  for (const [key, list] of pairs) {
    if (list.length > 1) console.log(`  ${key}: ${list.length} connections`, list.map((c) => c.id.slice(0, 8)));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
