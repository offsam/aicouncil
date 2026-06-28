"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Info } from "lucide-react";
import { NodeResizer, type NodeProps } from "@xyflow/react";
import { NodeObjectMenu } from "@/components/workspace/nodes/NodeObjectMenu";
import { NodeConnectionHandles } from "@/components/workspace/nodes/NodeConnectionHandles";
import { WorkspaceNodeDragHandle } from "@/components/workspace/nodes/WorkspaceNodeDragHandle";
import { WorkspaceNodeTooltip } from "@/components/workspace/nodes/WorkspaceNodeTooltip";
import { useWorkspaceActions } from "@/components/workspace/WorkspaceActionsContext";
import { useWorkspaceSelection } from "@/components/workspace/WorkspaceSelectionContext";
import { AI_COUNCIL_OFFICE_ID } from "@/lib/ai-council-ids";
import { RouteStepBadge } from "@/components/workspace/RouteStepBadge";
import type { BuildingNodeData } from "@/lib/workspace/build-workspace-graph";
import { buildingAccentCssVars } from "@/lib/workspace/building-accent";
import type { InspectorTarget } from "@/lib/workspace/inspector-target";
import { WORKSPACE_UNIT_PX } from "@/lib/workspace/constants";
import { workspaceTronRouteClass } from "@/lib/workspace/node-visuals";

function BuildingNodeInner({ data, selected }: NodeProps) {
  const d = data as BuildingNodeData;
  const { renameBuilding, requestDeleteBuilding, persistBuildingGeometry, pickConnectEntity, recordUndoSnapshot, finishResizeUndoRecord } =
    useWorkspaceActions();
  const { openInspector, snapshot, selectedTarget } = useWorkspaceSelection();
  const [editing, setEditing] = useState(Boolean(d.startEditing));
  const [draft, setDraft] = useState(d.label);
  const [infoOpen, setInfoOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const infoWrapRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setDraft(d.label);
  }, [d.label]);

  useEffect(() => {
    if (d.startEditing) setEditing(true);
  }, [d.startEditing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (infoWrapRef.current && !infoWrapRef.current.contains(e.target as Node)) {
        setInfoOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    if (!selectedTarget || selectedTarget.kind !== "building" || selectedTarget.buildingId !== d.buildingId) {
      setInfoOpen(false);
    }
  }, [d.buildingId, selectedTarget]);

  async function commitRename() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === d.label) {
      setDraft(d.label);
      setEditing(false);
      return;
    }
    setEditing(false);
    try {
      await renameBuilding(d.buildingId, trimmed);
    } catch {
      setDraft(d.label);
    }
  }

  function buildingMenuTarget() {
    return {
      kind: "building" as const,
      officeId: AI_COUNCIL_OFFICE_ID,
      buildingId: d.buildingId,
      label: d.label,
      accentIndex: d.accentIndex,
      isCityHall: d.isCityHall,
    };
  }

  const inspectorTarget: InspectorTarget = {
    kind: "building",
    officeId: snapshot?.officeId ?? AI_COUNCIL_OFFICE_ID,
    buildingId: d.buildingId,
    label: d.label,
  };

  const agentCount = d.agentCount ?? 0;

  return (
    <div className={`workspace-node-root workspace-node-root--building${resizing ? " workspace-node-root--resizing" : ""}`}>
      <div
        ref={shellRef}
        style={buildingAccentCssVars(d.accentIndex ?? 0)}
        className={`workspace-building-shell workspace-node-shell workspace-node-shell--building ${
          d.highlighted ? "workspace-node-route-highlight" : ""
        } ${d.dimmed ? "workspace-node-dimmed" : ""} ${
          d.routeFading ? "workspace-route-fading" : ""
        } ${d.connectSelected ? "workspace-building-connect-selected" : ""} ${
          d.connectPickable ? "workspace-building-connect-pickable" : ""} ${
          workspaceTronRouteClass(d.tronPulse, "building", d.signalTone, d.signalLit)
        } ${d.hovered ? "workspace-node-hovered" : ""} ${d.isCityHall ? "workspace-building--city-hall" : ""} ${
          d.label.toLowerCase().includes("tech") ? "workspace-building--tech-dept" : ""
        }`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          openInspector(inspectorTarget);
        }}
      >
        <div className="workspace-node-card workspace-node-card--building">
          <div className="workspace-node-card__header workspace-node-card__header--building">
            <div className="workspace-node-card__title-wrap min-w-0">
              <div
                className={`workspace-node-card__title-row${
                  editing ? "" : " workspace-node-drag-zone"
                }`}
              >
                {!editing && <WorkspaceNodeDragHandle label={d.label} />}
                {editing ? (
                  <input
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void commitRename();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setDraft(d.label);
                        setEditing(false);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="workspace-node-title-input nodrag nopan"
                  />
                ) : (
                  <button
                    type="button"
                    className="workspace-node-title nopan"
                    onClick={
                      d.connectPickable
                        ? (e) => {
                            e.stopPropagation();
                            pickConnectEntity(d.buildingId);
                          }
                        : undefined
                    }
                  >
                    {d.label}
                  </button>
                )}
              </div>
            </div>
            <div
              ref={infoWrapRef}
              className="workspace-node-card__meta workspace-node-card__meta--building relative"
            >
              <button
                type="button"
                className="workspace-node-info-btn nodrag nopan"
                aria-label={`Быстрый обзор: ${d.label}`}
                title="Быстрый обзор"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setInfoOpen((v) => !v);
                }}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
              <div className="workspace-node-count workspace-node-count--compact">{agentCount}</div>
              {!editing && (
                <NodeObjectMenu
                  variant="embedded"
                  testId={`workspace-building-menu-${d.buildingId}`}
                  target={buildingMenuTarget()}
                  onDelete={() => requestDeleteBuilding(d.buildingId)}
                />
              )}

              {infoOpen && !editing && (
                <div
                  className="workspace-node-info-popover workspace-node-info-popover--bubble nodrag nopan"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="workspace-node-info-popover__line">
                    <span>agents</span>
                    <strong>{agentCount}</strong>
                  </div>
                  <div className="workspace-node-info-popover__line">
                    <span>double click</span>
                    <strong>inspector</strong>
                  </div>
                  <div className="workspace-node-info-popover__line">
                    <span>menu</span>
                    <strong>actions</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          {d.routeStep != null && <RouteStepBadge step={d.routeStep} />}

          <div className="workspace-node-body" aria-hidden="true" />
        </div>
      </div>
      <WorkspaceNodeTooltip
        anchorRef={shellRef}
        title={d.label}
        statusLabel="—"
        metricLabel="agents"
        metricValue={String(agentCount)}
      />
      <NodeConnectionHandles
        borderColor="var(--accent-cyan)"
        size="md"
        slots={d.connectionHandles}
        connectActive={d.connectPickable}
        nodeResizing={resizing}
      />
      {selected && (
        <NodeResizer
          minWidth={WORKSPACE_UNIT_PX * 4}
          minHeight={WORKSPACE_UNIT_PX * 3}
          autoScale={false}
          handleClassName="workspace-node-resizer-handle workspace-node-resizer-handle--corner nodrag nopan"
          lineClassName="workspace-node-resizer-line nodrag nopan"
          onResizeStart={() => {
            recordUndoSnapshot();
            setResizing(true);
          }}
          onResizeEnd={(_event, params) => {
            finishResizeUndoRecord();
            setResizing(false);
            void persistBuildingGeometry({
              buildingId: d.buildingId,
              flowX: params.x,
              flowY: params.y,
              widthPx: params.width,
              heightPx: params.height,
            });
          }}
        />
      )}
    </div>
  );
}

export const BuildingNode = memo(BuildingNodeInner);
