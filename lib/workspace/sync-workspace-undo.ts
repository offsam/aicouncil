import type { Node } from "@xyflow/react";
import type { AgentNodeData, ChamberNodeData } from "@/lib/workspace/build-workspace-graph";
import { clampAgentSizePx } from "@/lib/workspace/agent-layout";
import {
  clampAgentFlowGeometry,
  clampChamberFlowGeometry,
  flowNodeToBuildingCenter,
  flowToAgentLocal,
  flowToChamberLocal,
  nodeSizePx,
} from "@/lib/workspace/coords";
import { WORKSPACE_UNIT_PX } from "@/lib/workspace/constants";
import type { WorkspaceUndoSnapshot } from "@/lib/workspace/workspace-undo";

type SyncWorkspaceUndoOptions = {
  officeId: string;
  snapshot: WorkspaceUndoSnapshot;
  parentSizeForChamber: (
    buildingId: string,
    fallbackW: number,
    fallbackH: number,
  ) => { width: number; height: number };
  parentSizeForAgent: (
    chamberRegistryId: string | undefined,
    fallbackW: number,
    fallbackH: number,
  ) => { width: number; height: number };
};

export async function syncWorkspaceUndoSnapshot({
  officeId,
  snapshot,
  parentSizeForChamber,
  parentSizeForAgent,
}: SyncWorkspaceUndoOptions): Promise<void> {
  await syncSnapshotLayouts(officeId, snapshot, parentSizeForChamber, parentSizeForAgent);
  await syncSnapshotMeta(officeId, snapshot);
  await syncSnapshotConnections(snapshot);
}

async function syncSnapshotLayouts(
  officeId: string,
  snapshot: WorkspaceUndoSnapshot,
  parentSizeForChamber: SyncWorkspaceUndoOptions["parentSizeForChamber"],
  parentSizeForAgent: SyncWorkspaceUndoOptions["parentSizeForAgent"],
): Promise<void> {
  for (const node of snapshot.nodes) {
    if (node.type === "building") {
      const { width, height } = nodeSizePx(node, 192, 144);
      const center = flowNodeToBuildingCenter(node.position.x, node.position.y, width, height);
      const res = await fetch(`/api/offices/${officeId}/objects/${node.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          position_x: center.position_x,
          position_z: center.position_z,
          size_w: width / WORKSPACE_UNIT_PX,
          size_d: height / WORKSPACE_UNIT_PX,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Building layout sync failed");
      }
      continue;
    }

    if (node.type === "chamber") {
      const data = node.data as ChamberNodeData;
      const { width, height } = nodeSizePx(node, 48, 48);
      const parent = parentSizeForChamber(data.buildingId, 192, 144);
      const clamped = clampChamberFlowGeometry(
        node.position.x,
        node.position.y,
        width,
        height,
        parent.width,
        parent.height,
      );
      const local = flowToChamberLocal(
        clamped.flowX,
        clamped.flowY,
        clamped.widthPx,
        clamped.heightPx,
        parent.width,
        parent.height,
      );
      const res = await fetch(
        `/api/offices/${officeId}/buildings/${data.buildingId}/chambers/${data.chamberId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(local),
        },
      );
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Chamber layout sync failed");
      }
      continue;
    }

    if (node.type === "agent") {
      const data = node.data as AgentNodeData;
      const sizePx = clampAgentSizePx(
        Number(data.layoutSizePx) || nodeSizePx(node, 48, 48).width,
      );
      const parent = parentSizeForAgent(node.parentId ?? undefined, 48, 48);
      const clamped = clampAgentFlowGeometry(
        node.position.x,
        node.position.y,
        sizePx,
        parent.width,
        parent.height,
      );
      const local = flowToAgentLocal(
        clamped.flowX,
        clamped.flowY,
        sizePx,
        parent.width,
        parent.height,
      );
      const res = await fetch(
        `/api/chambers/${data.chamberDbId}/assignments/${data.assignmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...local, layout_size: sizePx }),
        },
      );
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Agent layout sync failed");
      }
    }
  }
}

async function syncSnapshotMeta(officeId: string, snapshot: WorkspaceUndoSnapshot): Promise<void> {
  const res = await fetch(`/api/offices/${officeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace_meta: snapshot.workspaceMeta }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? "Workspace meta sync failed");
  }
}

async function syncSnapshotConnections(snapshot: WorkspaceUndoSnapshot): Promise<void> {
  const listRes = await fetch("/api/connections");
  const listBody = (await listRes.json()) as {
    connections?: Array<{ id: string; route_path?: unknown }>;
    error?: string;
  };
  if (!listRes.ok) {
    throw new Error(listBody.error ?? "Failed to load connections for undo sync");
  }

  const snapById = new Map(snapshot.connections.map((c) => [c.id, c]));
  const dbConnections = listBody.connections ?? [];

  for (const dbConn of dbConnections) {
    if (!snapById.has(dbConn.id)) {
      const res = await fetch(`/api/connections/${dbConn.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Connection delete sync failed");
      }
    }
  }

  for (const snapConn of snapshot.connections) {
    const dbConn = dbConnections.find((c) => c.id === snapConn.id);
    if (!dbConn) continue;
    const res = await fetch(`/api/connections/${snapConn.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ route_path: snapConn.route_path ?? null }),
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      throw new Error(body.error ?? "Connection route sync failed");
    }
  }
}
