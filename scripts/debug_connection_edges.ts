/**
 * Debug: how many connection edges resolve on the workspace graph?
 * Run: npx tsx scripts/debug_connection_edges.ts
 */
import { buildConnectionEdges } from "../lib/workspace/workspace-connections";
import { buildWorkspaceNodes, parseWorkspaceMeta } from "../lib/workspace/build-workspace-graph";
import { workspaceAssignmentNodeId } from "../lib/workspace/agent-nodes";

async function main() {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const officeId = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
  const [officeRes, objectsRes, chambersRes, assignmentsRes, connectionsRes] =
    await Promise.all([
      fetch(`${base}/api/offices/${officeId}`),
      fetch(`${base}/api/offices/${officeId}/objects`),
      fetch(`${base}/api/chambers`),
      fetch(`${base}/api/chambers/assignments`),
      fetch(`${base}/api/connections`),
    ]);

  const office = (await officeRes.json()) as { office?: { name?: string; workspace_meta?: unknown } };
  const objects = (await objectsRes.json()) as { objects?: Array<{ id: string; object_type: string }> };
  const chambers = (await chambersRes.json()) as { chambers?: Array<{ id: string; entity_registry_id: string }> };
  const assignmentsData = (await assignmentsRes.json()) as {
    assignmentsByChamber?: Record<string, Array<{ id: string; agent_id: string }>>;
  };
  const connectionsData = (await connectionsRes.json()) as {
    connections?: Array<{ id: string; source_entity_id: string; target_entity_id: string; is_active: boolean }>;
  };

  const buildings = (objects.objects ?? []).filter((o) => o.object_type === "room");
  const chambersList = chambers.chambers ?? [];
  const assignments = Object.values(assignmentsData.assignmentsByChamber ?? {}).flat();
  const connections = connectionsData.connections ?? [];
  const meta = parseWorkspaceMeta(office.office?.workspace_meta);
  const cityName = office.office?.name ?? "AI Council";

  const nodes = buildWorkspaceNodes(officeId, cityName, meta, buildings, chambersList, assignments);
  const chamberRegistryIds = new Set(
    chambersList.map((c) => c.entity_registry_id).filter(Boolean),
  );
  const buildingRegistryIds = new Set(buildings.map((b) => b.id));
  const agentRegistryIds = new Set(assignments.map((a) => a.agent_id));
  const agentEntityToNodeId = new Map(
    assignments.map((a) => [a.agent_id, workspaceAssignmentNodeId(a.id)]),
  );

  const registry = {
    chamberRegistryIds,
    buildingRegistryIds,
    agentRegistryIds,
    agentEntityToNodeId,
  };

  const { edges, nodeHandles } = buildConnectionEdges(connections, registry, nodes);

  console.log("nodes:", nodes.length, "node types:", [...new Set(nodes.map((n) => n.type))].join(", "));
  console.log("connections API:", connections.length, "active:", connections.filter((c) => c.is_active).length);
  console.log("built edges:", edges.length);
  console.log("nodes with handles:", nodeHandles.size);

  for (const conn of connections.filter((c) => c.is_active)) {
    const edge = edges.find((e) => (e.data as { connectionId?: string })?.connectionId === conn.id);
    if (edge) {
      console.log(" OK", conn.id.slice(0, 8), edge.source.slice(0, 8), "->", edge.target.slice(0, 8));
    } else {
      const srcType = chamberRegistryIds.has(conn.source_entity_id)
        ? "chamber"
        : buildingRegistryIds.has(conn.source_entity_id)
          ? "building"
          : agentRegistryIds.has(conn.source_entity_id)
            ? "agent"
            : "?";
      const tgtType = chamberRegistryIds.has(conn.target_entity_id)
        ? "chamber"
        : buildingRegistryIds.has(conn.target_entity_id)
          ? "building"
          : agentRegistryIds.has(conn.target_entity_id)
            ? "agent"
            : "?";
      console.log(" FAIL", conn.id.slice(0, 8), `src=${srcType}`, conn.source_entity_id.slice(0, 8), `tgt=${tgtType}`, conn.target_entity_id.slice(0, 8));
    }
  }
  for (const edge of edges) {
    const d = edge.data as { connectionId?: string; sourceName?: string; targetName?: string };
    console.log(
      " edge",
      d.connectionId?.slice(0, 8),
      edge.source.slice(0, 8),
      "->",
      edge.target.slice(0, 8),
      "handles",
      edge.sourceHandle,
      edge.targetHandle,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
