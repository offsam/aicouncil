"use client";

import { memo, useRef, useState } from "react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { RouteStepBadge } from "@/components/workspace/RouteStepBadge";
import { NodeConnectionHandles } from "@/components/workspace/nodes/NodeConnectionHandles";
import { WorkspaceNodeTooltip } from "@/components/workspace/nodes/WorkspaceNodeTooltip";
import { AgentRobotAvatar } from "@/components/workspace/nodes/AgentRobotAvatar";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceActionsContext";
import { useWorkspaceSelection } from "@/components/workspace/WorkspaceSelectionContext";
import type { AgentNodeData } from "@/lib/workspace/build-workspace-graph";
import { AGENT_NODE_MAX_PX, AGENT_NODE_MIN_PX, clampAgentSizePx } from "@/lib/workspace/agent-layout";
import type { InspectorTarget } from "@/lib/workspace/inspector-target";
import {
  workspaceCostTierLabel,
  workspaceNodeStatusLabel,
  workspaceNodeStatusTone,
  workspaceRouteLitClass,
} from "@/lib/workspace/node-visuals";

function AgentNodeInner({ data, selected, parentId }: NodeProps) {
  const d = data as AgentNodeData;
  const { persistAgentGeometry, pickConnectEntity, recordUndoSnapshot, finishResizeUndoRecord } = useWorkspaceActions();
  const { openInspector, snapshot } = useWorkspaceSelection();
  const [hovered, setHovered] = useState(false);
  const [resizing, setResizing] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);

  const statusTone = workspaceNodeStatusTone(d.status);
  const statusLabel = workspaceNodeStatusLabel(d.status);
  const tierLabel = workspaceCostTierLabel(d.costTier);
  const showResize = !d.connectPickable && (selected || hovered || resizing);

  const inspectorTarget: InspectorTarget = {
    kind: "agent",
    officeId: snapshot?.officeId ?? d.officeId,
    assignmentId: d.assignmentId,
    agentId: d.agentId,
    chamberId: d.chamberDbId,
    chamberRegistryId: parentId ?? "",
    buildingId: "",
    label: d.label,
    provider: d.provider,
    modelId: d.modelId,
    costTier: d.costTier,
    layoutX: null,
    layoutY: null,
  };

  return (
    <>
      <NodeConnectionHandles
        borderColor="var(--accent-violet)"
        size="sm"
        shape="circle"
        slots={d.connectionHandles}
        connectActive={d.connectPickable}
      />
      {!d.connectPickable && (
        <NodeResizer
          minWidth={AGENT_NODE_MIN_PX}
          minHeight={AGENT_NODE_MIN_PX}
          maxWidth={AGENT_NODE_MAX_PX}
          maxHeight={AGENT_NODE_MAX_PX}
          keepAspectRatio
          isVisible={showResize}
          lineClassName="workspace-agent-resizer-line"
          handleClassName="workspace-agent-resizer-handle nodrag nopan"
          onResizeStart={() => {
            recordUndoSnapshot();
            setResizing(true);
          }}
          onResizeEnd={(_event, params) => {
            setResizing(false);
            finishResizeUndoRecord();
            void persistAgentGeometry({
              assignmentId: d.assignmentId,
              chamberDbId: d.chamberDbId,
              flowX: params.x,
              flowY: params.y,
              sizePx: clampAgentSizePx(Math.max(params.width, params.height)),
            });
          }}
        />
      )}
      <div
        ref={shellRef}
        data-testid={`workspace-agent-${d.assignmentId}`}
        className={`workspace-node-shell workspace-node-shell--agent workspace-node-shell--${statusTone} ${
          d.dimmed ? "workspace-node-dimmed" : ""
        } ${d.routeFading ? "workspace-route-fading" : ""} ${
          d.connectSelected ? "workspace-agent-connect-selected" : ""
        } ${d.connectPickable ? "workspace-agent-connect-pickable" : ""} ${workspaceRouteLitClass(
          d.tronPulse,
          d.signalTone,
        )} ${d.isChamberLead ? "workspace-agent--lead" : ""} ${
          hovered ? "workspace-agent-node--hovered" : ""
        }`}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={(e) => {
          if (!d.connectPickable) return;
          e.stopPropagation();
          pickConnectEntity(d.agentId);
        }}
        onDoubleClick={(e) => {
          if (d.connectPickable) return;
          e.stopPropagation();
          openInspector(inspectorTarget);
        }}
      >
        <div className="workspace-agent-node">
          <div className="workspace-agent-node__icon">
            <AgentRobotAvatar
              label={d.label}
              provider={d.provider}
              modelId={d.modelId}
              agentId={d.agentId}
              tone={statusTone}
              iconId={d.agentIconId ?? null}
              costTier={d.costTier}
              showCostTier
            />
          </div>

          {d.routeStep != null && <RouteStepBadge step={d.routeStep} />}
        </div>
      </div>
      <WorkspaceNodeTooltip
        anchorRef={shellRef}
        title={d.label}
        statusLabel={statusLabel}
        metricLabel="tier"
        metricValue={tierLabel}
      />
    </>
  );
}

export const AgentNode = memo(AgentNodeInner);
