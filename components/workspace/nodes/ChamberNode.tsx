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
import { RouteStepBadge } from "@/components/workspace/RouteStepBadge";
import type { ChamberNodeData } from "@/lib/workspace/build-workspace-graph";
import { buildingAccentCssVars } from "@/lib/workspace/building-accent";
import type { InspectorTarget } from "@/lib/workspace/inspector-target";
import { WORKSPACE_UNIT_PX } from "@/lib/workspace/constants";
import { workspaceRouteLitClass } from "@/lib/workspace/node-visuals";

function ChamberNodeInner({ data, selected }: NodeProps) {
  const d = data as ChamberNodeData;
  const { renameChamber, deleteChamber, persistChamberGeometry, pickConnectEntity, recordUndoSnapshot, finishResizeUndoRecord } =
    useWorkspaceActions();
  const { openInspector, snapshot, selectedTarget } = useWorkspaceSelection();
  const [editing, setEditing] = useState(Boolean(d.startEditing));
  const [draft, setDraft] = useState(d.label);
  const [infoOpen, setInfoOpen] = useState(false);
  const [resizing, setResizing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const infoWrapRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

  const inspectorTarget: InspectorTarget = {
    kind: "chamber",
    officeId: snapshot?.officeId ?? d.officeId,
    buildingId: d.buildingId,
    chamberId: d.chamberId,
    registryId: d.entityRegistryId,
    label: d.label,
  };

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
    if (!selectedTarget || selectedTarget.kind !== "chamber" || selectedTarget.chamberId !== d.chamberId) {
      setInfoOpen(false);
    }
  }, [d.chamberId, selectedTarget]);

  async function commitRename() {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === d.label) {
      setDraft(d.label);
      setEditing(false);
      return;
    }
    setEditing(false);
    try {
      await renameChamber(d.chamberId, d.buildingId, trimmed);
    } catch {
      setDraft(d.label);
    }
  }

  function chamberMenuTarget() {
    return {
      kind: "chamber" as const,
      officeId: d.officeId,
      buildingId: d.buildingId,
      chamberId: d.chamberId,
      registryId: d.entityRegistryId,
      label: d.label,
      accentIndex: d.accentIndex,
    };
  }

  const agentCount = d.agentCount ?? 0;

  return (
    <div className={`workspace-node-root workspace-node-root--chamber${resizing ? " workspace-node-root--resizing" : ""}`}>
      <div
        ref={shellRef}
        style={buildingAccentCssVars(d.accentIndex ?? 0)}
        className={`workspace-node-shell workspace-node-shell--chamber ${
          d.dimmed ? "workspace-node-dimmed" : ""
        } ${d.routeFading ? "workspace-route-fading" : ""} ${
          d.connectSelected ? "workspace-chamber-connect-selected" : ""
        } ${d.connectPickable ? "workspace-chamber-connect-pickable" : ""} ${workspaceRouteLitClass(
          d.tronPulse,
          d.signalTone,
        )} ${d.hovered ? "workspace-node-hovered" : ""} ${
          d.isMainChamber ? "workspace-chamber--main" : ""
        }`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          openInspector(inspectorTarget);
        }}
      >
        <div className="workspace-node-card workspace-node-card--chamber">
          <div className="workspace-node-card__corner workspace-node-card__corner--chamber">
            <div className="workspace-node-card__title-wrap min-w-0">
              <div
                className={`workspace-node-card__title-row${
                  editing ? "" : " workspace-node-drag-zone"
                }`}
              >
                {!editing && <WorkspaceNodeDragHandle label={d.label} size="sm" />}
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
                    className="workspace-node-title-input workspace-node-title-input--corner nodrag nopan"
                  />
                ) : (
                  <button
                    type="button"
                    className="workspace-node-title workspace-node-title--corner nopan"
                    onClick={
                      d.connectPickable
                        ? (e) => {
                            e.stopPropagation();
                            pickConnectEntity(d.entityRegistryId);
                          }
                        : undefined
                    }
                  >
                    {d.label}
                  </button>
                )}
              </div>
            </div>

            <div ref={infoWrapRef} className="workspace-node-card__actions nodrag nopan">
              <button
                type="button"
                className="workspace-node-info-btn"
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

              {!editing && (
                <NodeObjectMenu
                  variant="embedded"
                  testId={`workspace-chamber-menu-${d.entityRegistryId}`}
                  target={chamberMenuTarget()}
                  onDelete={() => deleteChamber(d.chamberId, d.buildingId, d.entityRegistryId)}
                />
              )}

              {infoOpen && !editing && (
                <div
                  className="workspace-node-info-popover workspace-node-info-popover--bubble"
                  onClick={(e) => e.stopPropagation()}
                >
                  {d.routingDescription ? (
                    <p className="workspace-node-info-popover__description">
                      {d.routingDescription}
                    </p>
                  ) : null}
                  <div className="workspace-node-info-popover__line">
                    <span>agents</span>
                    <strong>{agentCount}</strong>
                  </div>
                  {d.isMainChamber ? (
                    <div className="workspace-node-info-popover__line">
                      <span>role</span>
                      <strong>main</strong>
                    </div>
                  ) : null}
                  {d.workflowStepBadge ? (
                    <div className="workspace-node-info-popover__line">
                      <span>workflow</span>
                      <strong>
                        {d.workflowStepBadge.current}/{d.workflowStepBadge.total}
                      </strong>
                    </div>
                  ) : null}
                  <div className="workspace-node-info-popover__line">
                    <span>double click</span>
                    <strong>inspector</strong>
                  </div>
                </div>
              )}
            </div>
          </div>

          {d.workflowStepBadge ? (
            <RouteStepBadge
              step={d.workflowStepBadge.current}
              total={d.workflowStepBadge.total}
              variant="workflow"
            />
          ) : (
            d.routeStep != null && <RouteStepBadge step={d.routeStep} />
          )}
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
        borderColor="var(--accent-violet)"
        size="sm"
        slots={d.connectionHandles}
        connectActive={d.connectPickable}
        nodeResizing={resizing}
      />
      {selected && (
        <NodeResizer
          minWidth={WORKSPACE_UNIT_PX}
          minHeight={WORKSPACE_UNIT_PX}
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
            const persist = () => {
              void persistChamberGeometry({
                chamberId: d.chamberId,
                buildingId: d.buildingId,
                entityRegistryId: d.entityRegistryId,
                flowX: params.x,
                flowY: params.y,
                widthPx: params.width,
                heightPx: params.height,
              }).catch(() => {
                /* error surfaced on canvas */
              });
            };
            requestAnimationFrame(() => {
              requestAnimationFrame(persist);
            });
          }}
        />
      )}
    </div>
  );
}

export const ChamberNode = memo(ChamberNodeInner);
