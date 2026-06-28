"use client";

import { useState } from "react";
import Link from "next/link";
import type { ConnectionPermissionRow } from "@/lib/office-types";
import type { InspectorTarget } from "@/lib/workspace/inspector-target";
import type {
  InspectorEntityStats,
  InspectorLoadedData,
  RequestLogEntry,
} from "@/lib/workspace/load-inspector-data";
import type { EntityStatMetricId } from "@/lib/workspace/entity-stat-metric";
import type { BuildingAccentId } from "@/lib/workspace/building-accent";
import type { AgentIconId } from "@/components/workspace/agent-icon-catalog";
import { normalizeCostTier } from "@/lib/cost-tier";
import { CostTierBadge } from "@/components/workspace/CostTierBadge";
import { InspectorColorPicker } from "./InspectorColorPicker";
import { InspectorAgentIconPicker } from "./InspectorAgentIconPicker";
import { ChamberInspectorResourceTabs } from "./ChamberInspectorResourceTabs";
import { BuildingLibrarySection } from "./BuildingLibrarySection";
import { EntityBasicStatsGrid } from "./EntityBasicStatsGrid";
import { EntityStatsDetailModal } from "./EntityStatsDetailModal";

type InspectorAgentListItem = {
  id: string;
  name: string;
  isLead: boolean;
};

function buildChamberAgentList(
  data: InspectorLoadedData,
  managerAgentId: string | null | undefined,
): InspectorAgentListItem[] {
  if (data.assignments.length > 0) {
    return data.assignments.map((assignment) => ({
      id: assignment.agent_id,
      name: assignment.agents?.name ?? assignment.agent_id.slice(0, 8),
      isLead: managerAgentId === assignment.agent_id,
    }));
  }

  return (data.agentsInScope ?? []).map((agent) => ({
    id: agent.id,
    name: agent.name,
    isLead: managerAgentId === agent.id,
  }));
}

function MiniStats({
  stats,
  onStatClick,
}: {
  stats: InspectorEntityStats;
  onStatClick?: (metric: EntityStatMetricId) => void;
}) {
  return <EntityBasicStatsGrid stats={stats} onStatClick={onStatClick} />;
}

function CompactHistory({ logs }: { logs: RequestLogEntry[] }) {
  if (logs.length === 0) {
    return <p className="text-xs text-stone-500">Недавних запросов нет.</p>;
  }
  return (
    <ul className="space-y-1.5" data-testid="workspace-inspector-basic-history">
      {logs.slice(0, 5).map((log) => (
        <li key={log.id} className="workspace-inspector-card text-xs">
          <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--ws-text-faint)]">
            <span>{new Date(log.created_at).toLocaleString()}</span>
            <span
              className={
                log.status === "error"
                  ? "workspace-inspector-stat__value--error"
                  : log.status === "success"
                    ? "workspace-inspector-stat__value--success"
                    : "workspace-inspector-stat__value--accent"
              }
            >
              {log.status}
            </span>
          </div>
          <div className="mt-0.5 line-clamp-2 text-[var(--ws-text-main)]">{log.question}</div>
        </li>
      ))}
    </ul>
  );
}

function ProHint({ onSwitch }: { onSwitch: () => void }) {
  return (
    <p className="workspace-inspector-card workspace-inspector-hint leading-relaxed">
      В{" "}
      <button type="button" onClick={onSwitch} className="workspace-inspector-link">
        профессиональном режиме
      </button>
      {" — "}
      правила, knowledge, routing, назначения и полная статистика.
    </p>
  );
}

type InspectorBasicViewProps = {
  selectedTarget: InspectorTarget;
  data: InspectorLoadedData;
  nameByRegistryId: (id: string) => string;
  isCityHallTarget: boolean;
  labelDraft: string;
  setLabelDraft: (v: string) => void;
  savingLabel: boolean;
  onSaveLabel: () => void;
  selectedColorId: BuildingAccentId;
  setSelectedColorId: (id: BuildingAccentId) => void;
  savingColor: boolean;
  onSaveBuildingColor: () => void;
  onSaveChamberColor: () => void;
  selectedAgentIconId: AgentIconId;
  setSelectedAgentIconId: (id: AgentIconId) => void;
  selectedAgentSizePx: number;
  setSelectedAgentSizePx: (sizePx: number) => void;
  savingAgentAppearance: boolean;
  onSaveAgentAppearance: () => void;
  onSaveConnectionColor: () => void;
  onDelete: () => void;
  onSwitchToProfessional: () => void;
  connDraft: ConnectionPermissionRow | null;
  setConnDraft: (v: ConnectionPermissionRow) => void;
  connActive: boolean;
  setConnActive: (v: boolean) => void;
  savingConn: boolean;
  onSaveConnection: () => void;
  routingDraft?: string;
  setRoutingDraft?: (v: string) => void;
  savingRouting?: boolean;
  onSaveRouting?: () => void;
  onSaveRoutingDescription?: (text: string) => Promise<void>;
  onInspectorReload?: () => Promise<void>;
  routingDescriptionEditable?: boolean;
  chamberManagerAgentId?: string | null;
  chamberBuildingId?: string;
  chamberId?: string;
  chamberRegistryId?: string;
};

export function InspectorBasicView({
  selectedTarget,
  data,
  nameByRegistryId,
  isCityHallTarget,
  labelDraft,
  setLabelDraft,
  savingLabel,
  onSaveLabel,
  selectedColorId,
  setSelectedColorId,
  savingColor,
  onSaveBuildingColor,
  onSaveChamberColor,
  selectedAgentIconId,
  setSelectedAgentIconId,
  selectedAgentSizePx,
  setSelectedAgentSizePx,
  savingAgentAppearance,
  onSaveAgentAppearance,
  onSaveConnectionColor,
  onDelete,
  onSwitchToProfessional,
  connDraft,
  setConnDraft,
  connActive,
  setConnActive,
  savingConn,
  onSaveConnection,
  routingDraft = "",
  setRoutingDraft,
  savingRouting = false,
  onSaveRouting,
  onSaveRoutingDescription,
  onInspectorReload,
  routingDescriptionEditable = false,
  chamberManagerAgentId,
  chamberBuildingId,
  chamberId,
  chamberRegistryId,
}: InspectorBasicViewProps) {
  const [activeStatMetric, setActiveStatMetric] = useState<EntityStatMetricId | null>(null);

  const entityTitle =
    selectedTarget.kind === "connection"
      ? `${selectedTarget.sourceLabel} → ${selectedTarget.targetLabel}`
      : selectedTarget.label;

  const statDetailModal =
    data.entityStats && activeStatMetric ? (
      <EntityStatsDetailModal
        open
        metric={activeStatMetric}
        entityTitle={entityTitle}
        stats={data.entityStats}
        recentLogs={data.recentLogs ?? []}
        connections={data.connections}
        chambersInScope={data.chambersInScope}
        agentStats={data.agentStats}
        chamberAgents={
          selectedTarget.kind === "chamber"
            ? buildChamberAgentList(data, data.managerAgentId ?? chamberManagerAgentId ?? null)
            : undefined
        }
        onClose={() => setActiveStatMetric(null)}
      />
    ) : null;

  if (selectedTarget.kind === "city") {
    return (
      <div className="workspace-inspector-stack" data-testid="workspace-inspector-basic">
        {data.officeRulesText ? (
          <div>
            <div className="workspace-inspector-label mb-1.5 font-medium">Правила города</div>
            <p className="workspace-inspector-card line-clamp-6 whitespace-pre-wrap text-xs">
              {data.officeRulesText}
            </p>
          </div>
        ) : (
          <p className="workspace-inspector-hint">Правила города не заданы.</p>
        )}
        {data.rules.length > 0 && (
          <p className="workspace-inspector-hint">{data.rules.length} локальных правил</p>
        )}
        <ProHint onSwitch={onSwitchToProfessional} />
      </div>
    );
  }

  if (selectedTarget.kind === "connection" && data.connectionDetail && connDraft) {
    return (
      <div className="workspace-inspector-stack" data-testid="workspace-inspector-basic">
        <div className="workspace-inspector-card text-sm">
          <span className="text-[var(--ws-text-muted)]">{data.connectionDetail.sourceLabel}</span>
          <span className="mx-2 text-[var(--ws-accent)]">→</span>
          <span>{data.connectionDetail.targetLabel}</span>
        </div>
        <div>
          <div className="workspace-inspector-label mb-1.5">Цвет кабеля</div>
          <InspectorColorPicker
            compact
            testIdPrefix="workspace-inspector-connection-color"
            selectedColorId={selectedColorId}
            onSelect={setSelectedColorId}
            onApply={onSaveConnectionColor}
            saving={savingColor}
          />
        </div>
        <div>
          <div className="workspace-inspector-label mb-1.5">Что передаёт кабель</div>
          <div className="space-y-1">
            {(
              [
                ["read_knowledge", "Читать знания"],
                ["read_rules", "Читать правила"],
                ["read_results", "Читать результаты"],
                ["send_tasks", "Отправлять задачи"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="workspace-inspector-check">
                <input
                  type="checkbox"
                  checked={connDraft[key]}
                  onChange={(e) => setConnDraft({ ...connDraft, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        {data.entityStats && (
          <MiniStats stats={data.entityStats} onStatClick={setActiveStatMetric} />
        )}
        <label className="workspace-inspector-check">
          <input
            type="checkbox"
            checked={connActive}
            onChange={(e) => setConnActive(e.target.checked)}
          />
          Связь активна
        </label>
        <button
          type="button"
          disabled={savingConn}
          onClick={onSaveConnection}
          className="workspace-bubble-btn workspace-bubble-btn--primary"
        >
          {savingConn ? "…" : "Сохранить"}
        </button>
        <ProHint onSwitch={onSwitchToProfessional} />
        {statDetailModal}
      </div>
    );
  }

  if (selectedTarget.kind === "agent") {
    const provider = data.agentDetail?.provider ?? selectedTarget.provider;
    const model = data.agentDetail?.model_id ?? selectedTarget.modelId;
    const tier = normalizeCostTier(data.agentDetail?.cost_tier ?? selectedTarget.costTier);
    const status = data.agentDetail?.status ?? "—";

    return (
      <div className="workspace-inspector-stack" data-testid="workspace-inspector-basic">
        <div className="workspace-inspector-chip-row">
          <span className="workspace-bubble-chip workspace-bubble-chip--accent">{provider}</span>
          <span className="workspace-bubble-chip">{model}</span>
          <CostTierBadge tier={tier} />
          <span className="workspace-bubble-chip">{status}</span>
        </div>

        <div>
          <div className="workspace-inspector-label mb-1.5">Иконка и размер</div>
          <InspectorAgentIconPicker
            compact
            testIdPrefix="workspace-inspector-agent-icon"
            selectedIconId={selectedAgentIconId}
            onSelect={setSelectedAgentIconId}
            selectedSizePx={selectedAgentSizePx}
            onSizeChange={setSelectedAgentSizePx}
            onApply={onSaveAgentAppearance}
            saving={savingAgentAppearance}
          />
        </div>

        <p className="workspace-inspector-hint">
          Отдел:{" "}
          <span className="text-[var(--ws-text-secondary)]">
            {nameByRegistryId(selectedTarget.chamberRegistryId)}
          </span>
        </p>

        {data.entityStats && (
          <MiniStats stats={data.entityStats} onStatClick={setActiveStatMetric} />
        )}

        {data.recentLogs && data.recentLogs.length > 0 && (
          <div>
            <div className="workspace-inspector-label mb-1.5 font-medium">Последние запросы</div>
            <CompactHistory logs={data.recentLogs} />
          </div>
        )}

        <div className="workspace-bubble-actions">
          <Link
            href={`/agents?highlight=${selectedTarget.agentId}`}
            className="workspace-bubble-btn workspace-bubble-btn--ghost"
          >
            Переименовать в /agents
          </Link>
          <button
            type="button"
            data-testid="workspace-inspector-delete-object"
            onClick={onDelete}
            className="workspace-inspector-btn-danger"
          >
            Снять с отдела
          </button>
        </div>

        <ProHint onSwitch={onSwitchToProfessional} />
        {statDetailModal}
      </div>
    );
  }

  const isBuilding = selectedTarget.kind === "building";
  const isChamber = selectedTarget.kind === "chamber";
  const buildingAgentCount =
    data.chambersInScope?.reduce((sum, chamber) => sum + chamber.agentCount, 0) ?? 0;
  const chamberManagerId = data.managerAgentId ?? chamberManagerAgentId ?? null;
  const chamberAgentList = isChamber ? buildChamberAgentList(data, chamberManagerId) : [];

  return (
    <div className="workspace-inspector-stack" data-testid="workspace-inspector-basic">
      {(isBuilding || isChamber) && (
        <label className="workspace-inspector-label">
          Название
          <input
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            className="workspace-bubble-input mt-1"
          />
          <button
            type="button"
            disabled={savingLabel || !labelDraft.trim()}
            onClick={onSaveLabel}
            className="workspace-bubble-btn workspace-bubble-btn--primary mt-2"
          >
            {savingLabel ? "…" : "Сохранить название"}
          </button>
        </label>
      )}

      {(isBuilding || isChamber) && routingDescriptionEditable && setRoutingDraft && onSaveRouting && (
        <label className="workspace-inspector-label">
          Описание
          <textarea
            value={routingDraft}
            onChange={(e) => setRoutingDraft(e.target.value)}
            rows={3}
            placeholder={
              isChamber
                ? "Чем занимается отдел…"
                : "Чем занимается здание…"
            }
            className="workspace-bubble-textarea mt-1"
          />
          <button
            type="button"
            disabled={savingRouting}
            onClick={onSaveRouting}
            className="workspace-bubble-btn workspace-bubble-btn--primary mt-2"
          >
            {savingRouting ? "…" : "Сохранить описание"}
          </button>
        </label>
      )}

      {(isBuilding || isChamber) &&
        !routingDescriptionEditable &&
        data.routingDescription && (
          <div>
            <div className="workspace-inspector-label mb-1">Описание</div>
            <p className="workspace-inspector-card whitespace-pre-wrap text-xs leading-relaxed">
              {data.routingDescription}
            </p>
          </div>
        )}

      {isBuilding && (
        <div>
          <div className="workspace-inspector-label mb-1.5">Цвет контура</div>
          <InspectorColorPicker
            compact
            selectedColorId={selectedColorId}
            onSelect={setSelectedColorId}
            onApply={onSaveBuildingColor}
            saving={savingColor}
            hint="Рамка нейтральная; выбранный цвет — только в мягкой тени вокруг."
          />
        </div>
      )}

      {isChamber && (
        <div>
          <div className="workspace-inspector-label mb-1.5">Цвет контура отдела</div>
          <InspectorColorPicker
            compact
            testIdPrefix="workspace-inspector-chamber-color"
            selectedColorId={selectedColorId}
            onSelect={setSelectedColorId}
            onApply={onSaveChamberColor}
            saving={savingColor}
            hint="Рамка нейтральная; выбранный цвет — только в мягкой тени вокруг."
          />
        </div>
      )}

      {data.entityStats && (
        <div>
          <div className="workspace-inspector-label mb-1.5 font-medium">Статистика</div>
          <EntityBasicStatsGrid
            stats={data.entityStats}
            showScopeCounts={isBuilding || isChamber}
            chamberCount={isBuilding ? (data.chambersInScope?.length ?? 0) : 1}
            agentCount={isBuilding ? buildingAgentCount : chamberAgentList.length}
            connectionCount={data.connections.length}
            onStatClick={setActiveStatMetric}
          />
        </div>
      )}

      {isBuilding && <BuildingLibrarySection entries={data.localKnowledge} />}

      {isChamber &&
        chamberBuildingId &&
        chamberId &&
        chamberRegistryId &&
        onInspectorReload && (
        <ChamberInspectorResourceTabs
          buildingId={chamberBuildingId}
          chamberId={chamberId}
          registryId={chamberRegistryId}
          rules={data.rules}
          archiveGroups={data.archiveGroups ?? []}
          libraryEntries={data.localKnowledge}
          onReload={onInspectorReload}
        />
      )}

      {data.recentLogs && data.recentLogs.length > 0 && (
        <div>
          <div className="workspace-inspector-label mb-1.5 font-medium">Последние запросы</div>
          <CompactHistory logs={data.recentLogs} />
        </div>
      )}

      <div className="workspace-bubble-actions">
        {((isBuilding && !isCityHallTarget) || isChamber) && (
          <button
            type="button"
            data-testid="workspace-inspector-delete-object"
            onClick={onDelete}
            className="workspace-inspector-btn-danger"
          >
            {isBuilding ? "Удалить здание" : "Удалить отдел"}
          </button>
        )}
      </div>

      {isCityHallTarget && (
        <p className="workspace-inspector-hint">
          City Hall: цвет и название доступны. Удаление недоступно.
        </p>
      )}

      <ProHint onSwitch={onSwitchToProfessional} />
      {statDetailModal}
    </div>
  );
}
