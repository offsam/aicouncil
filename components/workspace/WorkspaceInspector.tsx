"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AI_COUNCIL_OFFICE_ID } from "@/lib/ai-council-ids";
import { KNOWLEDGE_FILE_ACCEPT } from "@/lib/knowledge/prepare-knowledge-file";
import { uploadKnowledgeFile, attachKnowledgeFile } from "@/lib/knowledge/upload-knowledge-file-client";
import type { AgentAssignmentRow, ConnectionPermissionRow } from "@/lib/office-types";
import type { InspectorTarget } from "@/lib/workspace/inspector-target";
import { inspectorTargetKey } from "@/lib/workspace/inspector-target";
import {
  loadInspectorData,
  type InspectorEntityStats,
  type InspectorLoadedData,
  type KnowledgeSourceGroup,
  type RequestLogEntry,
} from "@/lib/workspace/load-inspector-data";
import {
  countDeletableTargets,
  groupTargetsByKind,
} from "@/lib/workspace/selection";
import {
  accentIndexFromPaletteId,
  paletteIdFromAccentIndex,
  type BuildingAccentId,
} from "@/lib/workspace/building-accent";
import {
  defaultAgentIconId,
  isAgentIconId,
  type AgentIconId,
} from "@/components/workspace/agent-icon-catalog";
import { isCityHallBuilding } from "@/lib/workspace/city-hall-building";
import { isTechDepartmentBuilding } from "@/lib/workspace/tech-department";
import { DEFAULT_TECH_DEPARTMENT_VISIBLE_COUNTERS } from "@/lib/workspace/tech-department-counters";
import { AGENT_NODE_DIAMETER_PX } from "@/lib/workspace/agent-layout";
import { ArchivePanel } from "./ArchivePanel";
import { TechDepartmentStatsPanel } from "@/components/workspace/nodes/TechDepartmentStatsPanel";
import { ContextPreviewSection } from "./ContextPreviewSection";
import { InspectorBasicView } from "./inspector/InspectorBasicView";
import { KnowledgeLibraryBrowse } from "./inspector/KnowledgeLibraryBrowse";
import { InspectorColorPicker } from "./inspector/InspectorColorPicker";
import { InspectorAgentIconPicker } from "./inspector/InspectorAgentIconPicker";
import { InspectorModeToggle } from "./inspector/InspectorModeToggle";
import { useWorkspaceSelection } from "./WorkspaceSelectionContext";
import {
  readInspectorViewMode,
  writeInspectorViewMode,
  type InspectorViewMode,
} from "@/lib/workspace/inspector-mode";

function inspectorTargetLabel(target: InspectorTarget): string {
  if (target.kind === "connection") {
    return `${target.sourceLabel} → ${target.targetLabel}`;
  }
  return target.label;
}

function kindLabel(kind: InspectorTarget["kind"]): string {
  switch (kind) {
    case "city":
      return "City";
    case "building":
      return "Building";
    case "chamber":
      return "Chamber";
    case "agent":
      return "Agent";
    case "connection":
      return "Connection";
  }
}

function Section({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="workspace-inspector-section">
      <button
        type="button"
        className="workspace-inspector-section__toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {title}
          {count != null ? ` (${count})` : ""}
        </span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="workspace-inspector-section__body">{children}</div>}
    </section>
  );
}

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function StatsCards({ stats }: { stats: InspectorEntityStats }) {
  return (
    <div
      data-testid="workspace-inspector-stats"
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
    >
      <div className="workspace-inspector-stat">
        <div className="workspace-inspector-stat__label">Запросы</div>
        <div className="workspace-inspector-stat__value">{stats.requestCount}</div>
      </div>
      <div className="workspace-inspector-stat">
        <div className="workspace-inspector-stat__label">Токены (≈)</div>
        <div className="workspace-inspector-stat__value workspace-inspector-stat__value--accent">
          {formatTokenCount(stats.estimatedTokens)}
        </div>
      </div>
      <div className="workspace-inspector-stat">
        <div className="workspace-inspector-stat__label">Успех</div>
        <div className="workspace-inspector-stat__value workspace-inspector-stat__value--success">
          {stats.successCount}
        </div>
      </div>
      <div className="workspace-inspector-stat">
        <div className="workspace-inspector-stat__label">Ошибки</div>
        <div className="workspace-inspector-stat__value workspace-inspector-stat__value--error">
          {stats.errorCount}
        </div>
      </div>
    </div>
  );
}

function RequestHistoryList({ logs, deep }: { logs: RequestLogEntry[]; deep: boolean }) {
  if (logs.length === 0) {
    return <p className="text-xs text-stone-500">История запросов пуста.</p>;
  }
  return (
    <ul className="max-h-64 space-y-2 overflow-y-auto" data-testid="workspace-inspector-history">
      {logs.map((log) => (
        <li key={log.id} className="rounded border border-stone-800 bg-stone-950/50 px-2 py-2 text-xs">
          <div className="flex items-center justify-between gap-2 text-[10px] text-stone-500">
            <span>{new Date(log.created_at).toLocaleString()}</span>
            <span className={log.status === "error" ? "text-red-400" : log.status === "success" ? "text-emerald-400" : "text-amber-400"}>
              {log.status}
              {log.latency_ms != null ? ` · ${log.latency_ms}ms` : ""}
            </span>
          </div>
          {log.agent_name && (
            <div className="mt-0.5 text-[10px] text-violet-300">{log.agent_name}</div>
          )}
          <div className="mt-1 font-medium text-stone-200">{log.question}</div>
          {(deep || (log.response?.length ?? 0) < 280) && log.response && (
            <div className="mt-1 whitespace-pre-wrap text-stone-400">{log.response}</div>
          )}
          {!deep && (log.response?.length ?? 0) >= 280 && log.response && (
            <div className="mt-1 truncate text-stone-500">{log.response}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

function KnowledgeSourcesBlock({ groups }: { groups: KnowledgeSourceGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-xs text-stone-500">Унаследованных источников нет.</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-stone-500">
        Только просмотр. Чтобы добавить или удалить локальные записи — раздел «Локальная база знаний» ниже.
      </p>
      {groups.map((g) => (
        <div key={g.source} className="rounded border border-stone-800 bg-stone-950/60 p-2">
          <div className="text-xs font-medium text-amber-400/90">{g.label}</div>
          {g.entries.length === 0 ? (
            <p className="mt-1 text-xs text-stone-500">— пусто —</p>
          ) : (
            <ul className="mt-1 space-y-0.5">
              {g.entries.map((e) => (
                <li key={e.id} className="text-xs text-stone-300">
                  <span className="truncate">{e.title}</span>
                  {e.file_url && (
                    <a
                      href={e.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 text-amber-400/80 hover:underline"
                    >
                      файл
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export function WorkspaceInspector() {
  const {
    selectedTarget,
    selectedTargets,
    selectedKey,
    closeInspector,
    collapseInspectorPanel,
    expandInspectorPanel,
    inspectorCollapsed,
    setSelectedTarget,
    snapshot,
    nameByRegistryId,
    getActions,
  } = useWorkspaceSelection();

  const isMultiSelect = selectedTargets.length > 1;
  const grouped = isMultiSelect ? groupTargetsByKind(selectedTargets) : null;
  const deletable = isMultiSelect ? countDeletableTargets(selectedTargets) : null;
  const isCityHallTarget =
    selectedTarget?.kind === "building" &&
    snapshot?.buildings.some(
      (b) => b.id === selectedTarget.buildingId && isCityHallBuilding(b),
    );

  const [data, setData] = useState<InspectorLoadedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routingDraft, setRoutingDraft] = useState("");
  const [savingRouting, setSavingRouting] = useState(false);
  const [newRule, setNewRule] = useState("");
  const [newKnowTitle, setNewKnowTitle] = useState("");
  const [newKnowContent, setNewKnowContent] = useState("");
  const [savingRule, setSavingRule] = useState(false);
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [attachingKnowledge, setAttachingKnowledge] = useState(false);
  const knowledgeFileRef = useRef<HTMLInputElement>(null);
  const loadSeqRef = useRef(0);
  const [connDraft, setConnDraft] = useState<ConnectionPermissionRow | null>(null);
  const [connPriority, setConnPriority] = useState(0);
  const [connActive, setConnActive] = useState(true);
  const [savingConn, setSavingConn] = useState(false);
  const [deletingConn, setDeletingConn] = useState(false);
  const [officeAgents, setOfficeAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [assignAgentId, setAssignAgentId] = useState("");
  const [assigningAgent, setAssigningAgent] = useState(false);
  const [savingManager, setSavingManager] = useState(false);
  const [savingRoutingRole, setSavingRoutingRole] = useState(false);
  const [routingRoleNotice, setRoutingRoleNotice] = useState<string | null>(null);
  const [deepDetail, setDeepDetail] = useState(false);
  const [inspectorMode, setInspectorMode] = useState<InspectorViewMode>(() =>
    typeof window !== "undefined" ? readInspectorViewMode() : "basic",
  );
  const [labelDraft, setLabelDraft] = useState("");
  const [savingLabel, setSavingLabel] = useState(false);
  const [selectedColorId, setSelectedColorId] = useState<BuildingAccentId>("cyan");
  const [savingColor, setSavingColor] = useState(false);
  const [selectedAgentIconId, setSelectedAgentIconId] = useState<AgentIconId>("bot");
  const [selectedAgentSizePx, setSelectedAgentSizePx] = useState<number>(AGENT_NODE_DIAMETER_PX);
  const [savingAgentAppearance, setSavingAgentAppearance] = useState(false);
  const [chamberFreeReserve, setChamberFreeReserve] = useState<boolean | null>(null);
  const [cityAgentCount, setCityAgentCount] = useState<number | null>(null);
  const [cityStatsLoading, setCityStatsLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!selectedTarget || !snapshot || selectedTargets.length > 1) {
      setData(null);
      return;
    }
    const seq = ++loadSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const chamberRow =
        selectedTarget.kind === "chamber"
          ? snapshot.chambers.find(
              (c) =>
                c.id === selectedTarget.chamberId ||
                c.entity_registry_id === selectedTarget.registryId,
            ) ?? null
          : null;

      const loaded = await loadInspectorData(selectedTarget, {
        connections: snapshot.connections,
        nameByRegistryId,
        chamberRegistry: chamberRow?.entity_registry ?? null,
        buildingRegistry: null,
        cityRegistry: null,
        logLimit:
          inspectorMode === "professional" ? (deepDetail ? 50 : 20) : 5,
        lightweight: inspectorMode === "basic",
      });
      if (seq !== loadSeqRef.current) return;
      setData(loaded);
      setRoutingDraft(loaded.routingDescription ?? "");
      if (loaded.connectionDetail) {
        setConnDraft(loaded.connectionDetail.permissions);
        setConnPriority(loaded.connectionDetail.priority);
        setConnActive(loaded.connectionDetail.is_active);
      }
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setError(err instanceof Error ? err.message : "Load failed");
      setData(null);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }, [selectedTarget, selectedTargets.length, snapshot, nameByRegistryId, deepDetail, inspectorMode]);

  function setViewMode(mode: InspectorViewMode) {
    if (mode === "professional") ++loadSeqRef.current;
    setInspectorMode(mode);
    writeInspectorViewMode(mode);
    if (mode === "basic") setDeepDetail(false);
  }

  useEffect(() => {
    setDeepDetail(false);
    setRoutingRoleNotice(null);
    if (!selectedTarget || selectedTargets.length > 1) {
      setLabelDraft("");
      return;
    }
    setLabelDraft(inspectorTargetLabel(selectedTarget));
    if (selectedTarget.kind === "building" && snapshot) {
      const row = snapshot.buildings.find((b) => b.id === selectedTarget.buildingId);
      const idx = row ? accentIndexFromPaletteId(row.color ?? "") : null;
      setSelectedColorId(
        idx != null ? paletteIdFromAccentIndex(idx) : "cyan",
      );
    } else if (selectedTarget.kind === "chamber" && snapshot) {
      const row = snapshot.chambers.find((c) => c.id === selectedTarget.chamberId);
      const idx = row ? accentIndexFromPaletteId(row.color ?? "") : null;
      setSelectedColorId(idx != null ? paletteIdFromAccentIndex(idx) : "teal");
    } else if (selectedTarget.kind === "agent") {
      setSelectedAgentIconId(defaultAgentIconId(selectedTarget.provider));
      setSelectedAgentSizePx(AGENT_NODE_DIAMETER_PX);
    } else if (selectedTarget.kind === "connection" && snapshot) {
      const row = snapshot.connections.find((c) => c.id === selectedTarget.connectionId);
      const idx = row ? accentIndexFromPaletteId(row.color ?? "") : null;
      setSelectedColorId(idx != null ? paletteIdFromAccentIndex(idx) : "sky");
    }
  }, [selectedKey, selectedTarget, selectedTargets.length, snapshot]);

  const selectedAgentTarget =
    selectedTarget?.kind === "agent" ? selectedTarget : null;

  useEffect(() => {
    if (!selectedAgentTarget) return;

    const savedIconId = data?.agentDetail?.color;
    setSelectedAgentIconId(
      isAgentIconId(savedIconId)
        ? savedIconId
        : defaultAgentIconId(selectedAgentTarget.provider),
    );

    const assignment = data?.assignments.find((a) => a.id === selectedAgentTarget.assignmentId);
    setSelectedAgentSizePx(assignment?.layout_size ?? AGENT_NODE_DIAMETER_PX);
  }, [
    data?.agentDetail?.color,
    data?.assignments,
    selectedAgentTarget?.assignmentId,
    selectedAgentTarget?.provider,
  ]);

  useEffect(() => {
    void reload();
  }, [reload, selectedKey]);

  useEffect(() => {
    if (selectedTarget?.kind !== "chamber") {
      setChamberFreeReserve(null);
      return;
    }
    fetch(`/api/chamber-roster?entityId=${encodeURIComponent(selectedTarget.registryId)}`)
      .then((r) => r.json())
      .then((body: { hasFreeReserve?: boolean }) => {
        setChamberFreeReserve(body.hasFreeReserve ?? false);
      })
      .catch(() => setChamberFreeReserve(null));
  }, [selectedTarget?.kind, selectedTarget?.kind === "chamber" ? selectedTarget.registryId : null, selectedKey]);

  useEffect(() => {
    if (selectedTarget?.kind !== "chamber") {
      setOfficeAgents([]);
      setAssignAgentId("");
      return;
    }
    const officeId = selectedTarget.officeId || AI_COUNCIL_OFFICE_ID;
    fetch(`/api/offices/${officeId}`)
      .then((r) => r.json())
      .then((body: { agents?: Array<{ id: string; name: string }> }) => {
        setOfficeAgents(body.agents ?? []);
      })
      .catch(() => setOfficeAgents([]));
  }, [
    selectedTarget?.kind,
    selectedTarget?.kind === "chamber" ? selectedTarget.officeId : null,
    selectedKey,
  ]);

  useEffect(() => {
    if (selectedTargets.length > 0 || !snapshot?.officeId) {
      setCityAgentCount(null);
      setCityStatsLoading(false);
      return;
    }

    let cancelled = false;
    setCityStatsLoading(true);
    fetch(`/api/offices/${snapshot.officeId}`)
      .then((r) => r.json())
      .then((body: { agents?: Array<{ id: string; name: string }>; error?: string }) => {
        if (cancelled) return;
        setCityAgentCount(body.agents?.length ?? 0);
      })
      .catch(() => {
        if (!cancelled) setCityAgentCount(null);
      })
      .finally(() => {
        if (!cancelled) setCityStatsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedTargets.length, snapshot?.officeId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") collapseInspectorPanel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapseInspectorPanel]);

  async function saveRoutingDescription(text?: string) {
    if (!selectedTarget || (selectedTarget.kind !== "building" && selectedTarget.kind !== "chamber")) return;
    const savedText = (text ?? routingDraft).trim() || null;

    let buildingId =
      selectedTarget.kind === "building" ? selectedTarget.buildingId : selectedTarget.buildingId;
    if (selectedTarget.kind === "chamber" && snapshot) {
      const chamberRow = snapshot.chambers.find(
        (c) =>
          c.id === selectedTarget.chamberId ||
          c.entity_registry_id === selectedTarget.registryId,
      );
      buildingId =
        chamberRow?.building_object_id ||
        chamberRow?.building_entity_id ||
        selectedTarget.buildingId;
    }

    setSavingRouting(true);
    setError(null);
    try {
      const endpoint =
        selectedTarget.kind === "building"
          ? `/api/offices/${selectedTarget.officeId}/objects/${selectedTarget.buildingId}`
          : `/api/offices/${selectedTarget.officeId}/buildings/${buildingId}/chambers/${selectedTarget.chamberId}`;

      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routing_description: savedText }),
      });
      const body = (await res.json()) as {
        error?: string;
        routingDescription?: string | null;
      };
      if (!res.ok) throw new Error(body.error ?? "Не удалось сохранить описание");

      const saved =
        selectedTarget.kind === "chamber" && body.routingDescription !== undefined
          ? body.routingDescription
          : savedText;

      const actions = getActions();
      if (selectedTarget.kind === "chamber") {
        actions?.updateChamberRoutingDescription(selectedTarget.registryId, saved);
      }

      setData((prev) => (prev ? { ...prev, routingDescription: saved } : prev));
      setRoutingDraft(saved ?? "");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить описание");
    } finally {
      setSavingRouting(false);
    }
  }

  async function saveObjectLabel() {
    if (!selectedTarget || !labelDraft.trim()) return;
    const trimmed = labelDraft.trim();
    if (trimmed === inspectorTargetLabel(selectedTarget)) return;
    setSavingLabel(true);
    setError(null);
    try {
      const actions = getActions();
      if (!actions) throw new Error("Canvas unavailable");
      if (selectedTarget.kind === "building") {
        await actions.renameBuilding(selectedTarget.buildingId, trimmed);
      } else if (selectedTarget.kind === "chamber") {
        await actions.renameChamber(
          selectedTarget.chamberId,
          selectedTarget.buildingId,
          trimmed,
        );
      } else {
        return;
      }
      setSelectedTarget({ ...selectedTarget, label: trimmed });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingLabel(false);
    }
  }

  async function saveBuildingColor() {
    if (!selectedTarget || selectedTarget.kind !== "building") return;
    setSavingColor(true);
    setError(null);
    try {
      const actions = getActions();
      if (!actions) throw new Error("Canvas unavailable");
      await actions.setBuildingColor(selectedTarget.buildingId, selectedColorId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingColor(false);
    }
  }

  async function saveChamberColor() {
    if (!selectedTarget || selectedTarget.kind !== "chamber") return;
    setSavingColor(true);
    setError(null);
    try {
      const actions = getActions();
      if (!actions) throw new Error("Canvas unavailable");
      await actions.setChamberColor(
        selectedTarget.buildingId,
        selectedTarget.chamberId,
        selectedTarget.registryId,
        selectedColorId,
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingColor(false);
    }
  }

  async function saveAgentAppearance() {
    if (!selectedTarget || selectedTarget.kind !== "agent") return;
    setSavingAgentAppearance(true);
    setError(null);
    try {
      const actions = getActions();
      if (!actions) throw new Error("Canvas unavailable");
      await actions.setAgentColor(selectedTarget.agentId, selectedAgentIconId);
      const res = await fetch(`/api/chambers/${selectedTarget.chamberId}/assignments/${selectedTarget.assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout_size: selectedAgentSizePx }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Не удалось сохранить размер");
      await actions.reloadCanvas();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingAgentAppearance(false);
    }
  }

  async function saveConnectionColor() {
    if (!selectedTarget || selectedTarget.kind !== "connection") return;
    setSavingColor(true);
    setError(null);
    try {
      const actions = getActions();
      if (!actions) throw new Error("Canvas unavailable");
      await actions.setConnectionColor(selectedTarget.connectionId, selectedColorId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingColor(false);
    }
  }

  function deleteCurrentObject() {
    if (!selectedTarget) return;
    const actions = getActions();
    if (!actions) return;
    if (selectedTarget.kind === "building") {
      const isCityHall = snapshot?.buildings.some(
        (b) => b.id === selectedTarget.buildingId && isCityHallBuilding(b),
      );
      if (isCityHall) return;
      actions.requestDeleteBuilding(selectedTarget.buildingId);
      closeInspector();
      return;
    }
    if (selectedTarget.kind === "chamber") {
      actions.deleteChamber(
        selectedTarget.chamberId,
        selectedTarget.buildingId,
        selectedTarget.registryId,
      );
      closeInspector();
      return;
    }
    if (selectedTarget.kind === "agent") {
      void removeAssignment(selectedTarget.assignmentId);
      closeInspector();
    }
  }

  function entityScopeFromTarget(target: InspectorTarget): {
    entityType: string;
    entityId: string;
  } | null {
    if (target.kind === "agent" || target.kind === "connection") return null;
    const entityType = target.kind;
    const entityId =
      entityType === "city"
        ? target.officeId
        : entityType === "building"
          ? target.buildingId
          : target.registryId;
    return { entityType, entityId };
  }

  async function addRule() {
    if (!selectedTarget || !newRule.trim()) return;
    const scope = entityScopeFromTarget(selectedTarget);
    if (!scope) return;

    setSavingRule(true);
    setError(null);
    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: scope.entityType,
          entity_id: scope.entityId,
          rule_text: newRule.trim(),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Не удалось добавить правило");
      setNewRule("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка добавления правила");
    } finally {
      setSavingRule(false);
    }
  }

  async function deleteRule(id: string) {
    setError(null);
    const res = await fetch(`/api/rules/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Не удалось удалить правило");
      return;
    }
    await reload();
  }

  async function postKnowledge(payload: {
    entity_type: string;
    entity_id: string;
    title: string;
    content: string;
    body?: string | null;
    file_url?: string | null;
  }) {
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(body.error ?? "Не удалось добавить запись");
  }

  async function addKnowledge() {
    if (!selectedTarget || !newKnowTitle.trim()) return;
    const scope = entityScopeFromTarget(selectedTarget);
    if (!scope) return;

    setSavingKnowledge(true);
    setError(null);
    try {
      await postKnowledge({
        entity_type: scope.entityType,
        entity_id: scope.entityId,
        title: newKnowTitle.trim(),
        content: newKnowContent.trim(),
      });
      setNewKnowTitle("");
      setNewKnowContent("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка добавления записи");
    } finally {
      setSavingKnowledge(false);
    }
  }

  async function addKnowledgeFromFile(file: File) {
    if (!selectedTarget) return;
    const scope = entityScopeFromTarget(selectedTarget);
    if (!scope) return;

    setSavingKnowledge(true);
    setError(null);
    try {
      const title =
        newKnowTitle.trim() || file.name.replace(/\.[^.]+$/, "") || file.name;

      await uploadKnowledgeFile({
        file,
        entityType: scope.entityType,
        entityId: scope.entityId,
        title,
        description: newKnowContent.trim() || undefined,
      });

      setNewKnowTitle("");
      setNewKnowContent("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки файла");
    } finally {
      setSavingKnowledge(false);
      if (knowledgeFileRef.current) knowledgeFileRef.current.value = "";
    }
  }

  async function attachKnowledgeToEntry(entryId: string, file: File) {
    setAttachingKnowledge(true);
    setError(null);
    try {
      await attachKnowledgeFile(entryId, file);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка прикрепления файла");
    } finally {
      setAttachingKnowledge(false);
    }
  }

  async function deleteKnowledge(id: string) {
    const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Knowledge delete failed");
      return;
    }
    await reload();
  }

  async function saveConnection() {
    if (!selectedTarget || selectedTarget.kind !== "connection" || !connDraft) return;
    setSavingConn(true);
    setError(null);
    try {
      const res = await fetch(`/api/connections/${selectedTarget.connectionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priority: connPriority,
          is_active: connActive,
          read_knowledge: connDraft.read_knowledge,
          read_rules: connDraft.read_rules,
          read_results: connDraft.read_results,
          send_tasks: connDraft.send_tasks,
        }),
      });
      const body = (await res.json()) as { connection?: unknown; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Connection save failed");
      getActions()?.reloadCanvas();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingConn(false);
    }
  }

  async function deleteConnection() {
    if (!selectedTarget || selectedTarget.kind !== "connection") return;
    if (!window.confirm(`Delete connection ${selectedTarget.sourceLabel} → ${selectedTarget.targetLabel}?`)) {
      return;
    }
    setDeletingConn(true);
    setError(null);
    try {
      const res = await fetch(`/api/connections/${selectedTarget.connectionId}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Delete failed");
      getActions()?.removeConnection(selectedTarget.connectionId);
      setSelectedTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingConn(false);
    }
  }

  async function removeAssignment(assignmentId: string) {
    if (!selectedTarget) return;
    const chamberId =
      selectedTarget.kind === "agent"
        ? selectedTarget.chamberId
        : selectedTarget.kind === "chamber"
          ? selectedTarget.chamberId
          : null;
    if (!chamberId) return;

    const res = await fetch(`/api/chambers/${chamberId}/assignments/${assignmentId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setError(body.error ?? "Remove assignment failed");
      return;
    }
    getActions()?.removeAssignmentNode(assignmentId);
    if (selectedTarget.kind === "agent") setSelectedTarget(null);
    await reload();
  }

  async function assignAgentToChamber() {
    if (!selectedTarget || selectedTarget.kind !== "chamber" || !assignAgentId) return;
    setAssigningAgent(true);
    setError(null);
    try {
      const res = await fetch(`/api/chambers/${selectedTarget.chamberId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: assignAgentId }),
      });
      const body = (await res.json()) as { assignment?: AgentAssignmentRow; error?: string };
      if (!res.ok || !body.assignment) throw new Error(body.error ?? "Assign failed");
      setAssignAgentId("");
      getActions()?.appendAssignmentNode(body.assignment);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setAssigningAgent(false);
    }
  }

  async function setChamberManager(agentId: string | null) {
    if (!selectedTarget || selectedTarget.kind !== "chamber") return;
    setSavingManager(true);
    setError(null);
    try {
      const res = await fetch(`/api/chambers/${selectedTarget.chamberId}/manager`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manager_agent_id: agentId }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Не удалось назначить руководителя");
      getActions()?.syncChamberManager(selectedTarget.chamberId, agentId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось назначить руководителя");
    } finally {
      setSavingManager(false);
    }
  }

  async function setChamberRoutingRole(routingRole: "main" | null) {
    if (!selectedTarget || selectedTarget.kind !== "chamber") return;
    setSavingRoutingRole(true);
    setError(null);
    setRoutingRoleNotice(null);
    try {
      const res = await fetch(
        `/api/offices/${selectedTarget.officeId}/buildings/${selectedTarget.buildingId}/chambers/${selectedTarget.chamberId}/routing-role`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ routing_role: routingRole }),
        },
      );
      const body = (await res.json()) as {
        chamber?: { id: string; routing_role?: string | null };
        previousMainChamber?: { id: string; name: string } | null;
        clearedMainChamberIds?: string[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Не удалось изменить главный отдел");

      const previousMain = body.previousMainChamber ?? null;
      if (routingRole === "main") {
        if (previousMain && previousMain.id !== selectedTarget.chamberId) {
          setRoutingRoleNotice(
            `Главный отдел здания сменён: ${previousMain.name} автоматически снят.`,
          );
        } else {
          setRoutingRoleNotice("Отдел назначен главным для здания.");
        }
      } else {
        setRoutingRoleNotice("Статус главного отдела снят.");
      }

      getActions()?.syncChamberRoutingRole(
        selectedTarget.chamberId,
        routingRole,
        body.clearedMainChamberIds ?? [],
      );
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось изменить главный отдел");
    } finally {
      setSavingRoutingRole(false);
    }
  }

  function selectConnection(connectionId: string) {
    const row = snapshot?.connections.find((c) => c.id === connectionId);
    if (!row) return;
    setSelectedTarget({
      kind: "connection",
      connectionId: row.id,
      sourceRegistryId: row.source_entity_id,
      targetRegistryId: row.target_entity_id,
      sourceLabel: nameByRegistryId(row.source_entity_id),
      targetLabel: nameByRegistryId(row.target_entity_id),
    });
  }

  const objectTitle =
    selectedTarget?.kind === "connection"
      ? `${selectedTarget.sourceLabel} → ${selectedTarget.targetLabel}`
      : selectedTarget?.label ?? "Объект";
  const panelTitle =
    !selectedTarget && selectedTargets.length === 0 ? "City overview" : objectTitle;
  const panelKindLabel =
    !selectedTarget && selectedTargets.length === 0
      ? "City"
      : selectedTarget
        ? kindLabel(selectedTarget.kind)
        : "Inspector";
  const panelDescription =
    (selectedTarget?.kind === "building" || selectedTarget?.kind === "chamber") &&
    (routingDraft.trim() || data?.routingDescription?.trim())
      ? routingDraft.trim() || data?.routingDescription?.trim() || ""
      : "";
  const panelSubtitle =
    !selectedTarget && selectedTargets.length === 0
      ? "Live counts and recent state from the canvas"
      : panelDescription ||
        (inspectorMode === "basic"
          ? "Быстрый просмотр · переключите на профессиональный для полного управления"
          : "Полное управление объектом · Esc или × — свернуть");
  const selectedChamber =
    selectedTarget?.kind === "chamber"
      ? snapshot?.chambers.find((c) => c.id === selectedTarget.chamberId) ?? null
      : null;
  const buildingMainChamber =
    selectedTarget?.kind === "chamber"
      ? snapshot?.chambers.find(
          (c) =>
            (c.building_object_id === selectedTarget.buildingId ||
              c.building_entity_id === selectedTarget.buildingId) &&
            c.routing_role === "main",
        ) ?? null
      : null;

  if (inspectorCollapsed) {
    return (
      <div className="workspace-inspector-shell workspace-inspector-shell--collapsed">
        <button
          type="button"
          className="workspace-panel-tab workspace-panel-tab--right"
          data-testid="workspace-inspector-tab"
          aria-label="Открыть Inspector"
          title="Открыть Inspector"
          onClick={expandInspectorPanel}
        >
          <span className="workspace-panel-tab__chevron" aria-hidden>
            ◀
          </span>
          <span className="workspace-panel-tab__label">Inspector</span>
        </button>
      </div>
    );
  }

  return (
    <aside
      data-testid="workspace-inspector"
      aria-label="Inspector"
      className="workspace-inspector flex h-full min-h-0 w-[380px] shrink-0 flex-col overflow-hidden border-l border-[var(--ws-panel-border)] bg-[var(--ws-panel-bg)]"
    >
      <div className="workspace-inspector__header">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="workspace-inspector__kind">
              {selectedTarget ? (
                <span data-testid={`workspace-inspector-kind-${selectedTarget.kind}`}>
                  {panelKindLabel}
                </span>
              ) : (
                panelKindLabel
              )}
            </div>
            {selectedTarget && !isMultiSelect && (
              <InspectorModeToggle mode={inspectorMode} onChange={setViewMode} />
            )}
          </div>
          <h2 id="workspace-inspector-title" className="workspace-inspector__title">
            {panelTitle}
          </h2>
          <p
            className={`workspace-inspector__subtitle${
              panelDescription ? " workspace-inspector__subtitle--description" : ""
            }`}
          >
            {panelSubtitle}
          </p>
        </div>
        <button
          type="button"
          title="Свернуть Inspector"
          aria-label="Закрыть панель"
          data-testid="workspace-inspector-close"
          onClick={() => collapseInspectorPanel()}
          className="workspace-inspector__close"
        >
          ×
        </button>
      </div>

      {!selectedTarget && selectedTargets.length === 0 && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <section className="workspace-inspector-card">
            <div className="workspace-inspector__kind">City overview</div>
            <div className="mt-1 text-lg font-semibold text-[var(--ws-text-main)]">
              {snapshot?.cityName ?? "Workspace"}
            </div>
            <p className="mt-1 text-sm text-stone-400">
              Live counts from the current city canvas.
            </p>
          </section>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-[10px] uppercase text-stone-500">Buildings</div>
              <div className="mt-1 text-xl font-semibold text-cyan-200">
                {snapshot?.buildings.length ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-[10px] uppercase text-stone-500">Chambers</div>
              <div className="mt-1 text-xl font-semibold text-violet-200">
                {snapshot?.chambers.length ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-[10px] uppercase text-stone-500">Connections</div>
              <div className="mt-1 text-xl font-semibold text-amber-200">
                {snapshot?.connections.length ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-3">
              <div className="text-[10px] uppercase text-stone-500">Agents</div>
              <div className="mt-1 text-xl font-semibold text-emerald-200">
                {cityStatsLoading ? "…" : cityAgentCount ?? 0}
              </div>
            </div>
          </div>

          <p className="text-xs text-stone-500">
            Select a building, chamber, agent, or connection to switch from overview to detail.
          </p>
        </div>
      )}

      {isMultiSelect && grouped && (
        <div
          data-testid="workspace-inspector-multi"
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="workspace-inspector__header border-b-0 py-2">
            <div>
              <div className="workspace-inspector__kind">Multi-select</div>
              <div className="workspace-inspector__title text-sm">
                {selectedTargets.length} selected
              </div>
              <p className="workspace-inspector__subtitle">
                Select one object to edit details
              </p>
            </div>
          </div>

          {error && (
            <p className="px-4 py-2 text-xs text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {(
              ["chamber", "agent", "connection"] as const
            ).map((kind) => {
              const items = grouped[kind];
              if (!items?.length) return null;
              return (
                <Section key={kind} title={kindLabel(kind)} count={items.length}>
                  <ul className="space-y-0.5">
                    {items.map((t) => (
                      <li
                        key={inspectorTargetKey(t)}
                        className="truncate text-xs text-stone-300"
                      >
                        {t.kind === "connection"
                          ? `${t.sourceLabel} → ${t.targetLabel}`
                          : t.label}
                      </li>
                    ))}
                  </ul>
                </Section>
              );
            })}
          </div>

          {deletable && deletable.total > 0 && (
            <div className="border-t border-stone-800 p-4">
              <button
                type="button"
                data-testid="workspace-inspector-batch-delete"
                className="w-full rounded border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-200 hover:bg-red-950"
                onClick={() => void getActions()?.deleteSelectedDeletable(selectedTargets)}
              >
                Delete{" "}
                {deletable.agents && deletable.connections
                  ? `${deletable.agents} agent(s) and ${deletable.connections} connection(s)`
                  : deletable.agents
                    ? `${deletable.agents} agent(s)`
                    : `${deletable.connections} connection(s)`}
              </button>
            </div>
          )}
        </div>
      )}

      {selectedTarget && !isMultiSelect && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {error && (
            <p className="px-4 py-2 text-xs text-red-400" role="alert">
              {error}
            </p>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && !data && (
              <p className="px-4 py-3 text-sm text-stone-500">Loading…</p>
            )}

            {data &&
              selectedKey === inspectorTargetKey(selectedTarget) &&
              inspectorMode === "basic" && (
                <InspectorBasicView
                  selectedTarget={selectedTarget}
                  data={data}
                  nameByRegistryId={nameByRegistryId}
                  isCityHallTarget={Boolean(isCityHallTarget)}
                  labelDraft={labelDraft}
                  setLabelDraft={setLabelDraft}
                  savingLabel={savingLabel}
                  onSaveLabel={() => void saveObjectLabel()}
                  selectedColorId={selectedColorId}
                  setSelectedColorId={setSelectedColorId}
                  savingColor={savingColor}
                  onSaveBuildingColor={() => void saveBuildingColor()}
                  onSaveChamberColor={() => void saveChamberColor()}
                  selectedAgentIconId={selectedAgentIconId}
                  setSelectedAgentIconId={setSelectedAgentIconId}
                  selectedAgentSizePx={selectedAgentSizePx}
                  setSelectedAgentSizePx={setSelectedAgentSizePx}
                  savingAgentAppearance={savingAgentAppearance}
                  onSaveAgentAppearance={() => void saveAgentAppearance()}
                  onSaveConnectionColor={() => void saveConnectionColor()}
                  onDelete={deleteCurrentObject}
                  onSwitchToProfessional={() => setViewMode("professional")}
                  connDraft={connDraft}
                  setConnDraft={setConnDraft}
                  connActive={connActive}
                  setConnActive={setConnActive}
                  savingConn={savingConn}
                  onSaveConnection={() => void saveConnection()}
                  routingDraft={routingDraft}
                  setRoutingDraft={setRoutingDraft}
                  savingRouting={savingRouting}
                  onSaveRouting={() => void saveRoutingDescription()}
                  onSaveRoutingDescription={(text) => saveRoutingDescription(text)}
                  onInspectorReload={reload}
                  routingDescriptionEditable={data.routingDescriptionEditable}
                  chamberManagerAgentId={selectedChamber?.manager_agent_id ?? null}
                  chamberBuildingId={
                    selectedTarget.kind === "chamber" ? selectedTarget.buildingId : undefined
                  }
                  chamberId={
                    selectedTarget.kind === "chamber" ? selectedTarget.chamberId : undefined
                  }
                  chamberRegistryId={
                    selectedTarget.kind === "chamber" ? selectedTarget.registryId : undefined
                  }
                />
              )}

            {data &&
              selectedKey === inspectorTargetKey(selectedTarget) &&
              inspectorMode === "professional" &&
              selectedTarget.kind === "connection" &&
              data.connectionDetail &&
              connDraft && (
              <>
                <Section title="Цвет кабеля" defaultOpen>
                  <InspectorColorPicker
                    selectedColorId={selectedColorId}
                    onSelect={setSelectedColorId}
                    onApply={() => void saveConnectionColor()}
                    saving={savingColor}
                    testIdPrefix="workspace-inspector-connection-color"
                  />
                </Section>
                <Section title="Permissions">
                  {(
                    [
                      ["read_knowledge", "Read knowledge"],
                      ["read_rules", "Read rules"],
                      ["read_results", "Read results"],
                      ["send_tasks", "Send tasks"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-xs text-stone-300">
                      <input
                        type="checkbox"
                        checked={connDraft[key]}
                        onChange={(e) =>
                          setConnDraft({ ...connDraft, [key]: e.target.checked })
                        }
                      />
                      {label}
                    </label>
                  ))}
                  <label className="mt-2 block text-xs text-stone-400">
                    Priority
                    <input
                      type="number"
                      value={connPriority}
                      onChange={(e) => setConnPriority(Number(e.target.value))}
                      className="mt-1 w-full rounded border border-stone-700 bg-stone-950 px-2 py-1 text-stone-100"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs text-stone-300">
                    <input
                      type="checkbox"
                      checked={connActive}
                      onChange={(e) => setConnActive(e.target.checked)}
                    />
                    Active
                  </label>
                  <button
                    type="button"
                    disabled={savingConn}
                    onClick={() => void saveConnection()}
                    className="mt-2 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-stone-950 disabled:opacity-50"
                  >
                    {savingConn ? "…" : "Save connection"}
                  </button>
                  <button
                    type="button"
                    disabled={deletingConn}
                    onClick={() => void deleteConnection()}
                    className="mt-2 ml-2 rounded border border-red-800 px-2 py-1 text-xs text-red-400 disabled:opacity-50"
                  >
                    {deletingConn ? "…" : "Delete connection"}
                  </button>
                </Section>
                <Section title="Metadata" defaultOpen={false}>
                  <dl className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-stone-500">id</dt>
                      <dd className="truncate font-mono text-stone-300">
                        {data.connectionDetail.id}
                      </dd>
                    </div>
                  </dl>
                </Section>
              </>
            )}

            {data &&
              selectedKey === inspectorTargetKey(selectedTarget) &&
              inspectorMode === "professional" &&
              selectedTarget.kind !== "connection" && (
              <Section title="Основные настройки" defaultOpen>
                {(selectedTarget.kind === "building" || selectedTarget.kind === "chamber") && (
                  <label className="block text-xs text-stone-400">
                    Название
                    <input
                      value={labelDraft}
                      onChange={(e) => setLabelDraft(e.target.value)}
                      className="mt-1 w-full rounded border border-stone-700 bg-stone-950 px-2 py-1.5 text-sm text-stone-100"
                    />
                  </label>
                )}
                {selectedTarget.kind === "agent" && (
                  <>
                    <p className="text-xs text-stone-400">
                      Имя агента задаётся в профиле агента (
                      <Link href="/agents" className="text-amber-400/90 hover:underline">
                        /agents
                      </Link>
                      ). Ниже — иконка, размер, назначение, статистика и связи.
                    </p>
                    <div className="mt-3">
                      <div className="mb-1.5 text-xs text-stone-400">Иконка и размер</div>
                      <InspectorAgentIconPicker
                        compact
                        testIdPrefix="workspace-inspector-agent-icon"
                        selectedIconId={selectedAgentIconId}
                        onSelect={setSelectedAgentIconId}
                        selectedSizePx={selectedAgentSizePx}
                        onSizeChange={setSelectedAgentSizePx}
                        onApply={() => void saveAgentAppearance()}
                        saving={savingAgentAppearance}
                      />
                    </div>
                  </>
                )}
                {selectedTarget.kind === "building" && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-xs text-stone-400">Цвет контура</div>
                    <InspectorColorPicker
                      selectedColorId={selectedColorId}
                      onSelect={setSelectedColorId}
                      onApply={() => void saveBuildingColor()}
                      saving={savingColor}
                      hint="Подсветка по периметру здания на canvas."
                    />
                  </div>
                )}
                {selectedTarget.kind === "chamber" && (
                  <div className="mt-3">
                    <div className="mb-1.5 text-xs text-stone-400">Цвет контура отдела</div>
                    <InspectorColorPicker
                      testIdPrefix="workspace-inspector-chamber-color"
                      selectedColorId={selectedColorId}
                      onSelect={setSelectedColorId}
                      onApply={() => void saveChamberColor()}
                      saving={savingColor}
                      hint="Подсветка по периметру отдела на canvas."
                    />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(selectedTarget.kind === "building" || selectedTarget.kind === "chamber") && (
                    <button
                      type="button"
                      disabled={savingLabel || !labelDraft.trim()}
                      onClick={() => void saveObjectLabel()}
                      className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-stone-950 disabled:opacity-50"
                    >
                      {savingLabel ? "…" : "Сохранить название"}
                    </button>
                  )}
                  {((selectedTarget.kind === "building" && !isCityHallTarget) ||
                    selectedTarget.kind === "chamber" ||
                    selectedTarget.kind === "agent") && (
                    <button
                      type="button"
                      data-testid="workspace-inspector-delete-object"
                      onClick={deleteCurrentObject}
                      className="rounded border border-red-800 bg-red-950/50 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950"
                    >
                      {selectedTarget.kind === "building"
                        ? "Удалить здание"
                        : selectedTarget.kind === "chamber"
                          ? "Удалить отдел"
                          : "Снять агента с отдела"}
                    </button>
                  )}
                </div>
                {isCityHallTarget && (
                    <p className="mt-2 text-[11px] text-stone-500">
                      City Hall: цвет и название применяются к главному зданию. Удаление недоступно.
                    </p>
                  )}
              </Section>
            )}

            {data &&
              selectedKey === inspectorTargetKey(selectedTarget) &&
              selectedTarget.kind !== "connection" &&
              selectedTarget.kind !== "agent" &&
              data.routingDescriptionEditable && (
              <Section title="Routing" defaultOpen={false}>
                <p className="mb-2 text-[11px] leading-5 text-stone-500">
                  Специализация / чем занимается отдел. Это значение используется при автоматической маршрутизации задач.
                </p>
                <textarea
                  value={routingDraft}
                  onChange={(e) => setRoutingDraft(e.target.value)}
                  rows={4}
                  className="w-full rounded border border-stone-700 bg-stone-950 px-2 py-1.5 text-xs text-stone-100"
                  placeholder="Например: юридические вопросы, договоры, трудовые споры, претензии"
                />
                <button
                  type="button"
                  disabled={savingRouting}
                  onClick={() => void saveRoutingDescription()}
                  className="mt-2 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-stone-950 disabled:opacity-50"
                >
                  {savingRouting ? "…" : "Save routing_description"}
                </button>
              </Section>
            )}

            {data &&
              selectedKey === inspectorTargetKey(selectedTarget) &&
              inspectorMode === "professional" &&
              selectedTarget.kind !== "connection" &&
              selectedTarget.kind !== "agent" && (
              <>
                {data.entityStats && (
                  <Section title="Статистика">
                    <StatsCards stats={data.entityStats} />
                    {selectedTarget.kind === "chamber" && chamberFreeReserve === false && (
                      <p
                        className="mt-2 rounded border border-amber-700/60 bg-amber-950/40 px-2 py-2 text-xs text-amber-200"
                        data-testid="workspace-inspector-no-free-reserve"
                      >
                        В этом отделе нет агента с cost_tier=free — резерв «за счёт государства» недоступен при
                        сбое основного агента.
                      </p>
                    )}
                    {selectedTarget.kind === "chamber" && chamberFreeReserve === true && (
                      <p className="mt-2 text-xs text-stone-500">
                        Резервный бесплатный агент в отделе есть — при сбое основного ответ придёт с пометкой «за
                        счёт государства».
                      </p>
                    )}
                    {selectedTarget.kind === "building" && data.chambersInScope && data.chambersInScope.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {data.chambersInScope.map((ch) => (
                          <li
                            key={ch.chamberId}
                            className="flex items-center justify-between rounded border border-stone-800 px-2 py-1 text-xs text-stone-300"
                          >
                            <span>{ch.name}</span>
                            <span className="text-stone-500">
                              {ch.agentCount} аг. · {ch.requestCount ?? 0} запр. · ≈{formatTokenCount(ch.estimatedTokens ?? 0)} tok
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {selectedTarget.kind === "chamber" && data.agentStats && data.agentStats.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {data.agentStats.map((a) => (
                          <li
                            key={a.agentId}
                            className="flex items-center justify-between rounded border border-stone-800 px-2 py-1 text-xs text-stone-300"
                          >
                            <span>{a.name}</span>
                            <span className="text-stone-500">
                              {a.requestCount} запр. · ≈{formatTokenCount(a.estimatedTokens)} tok
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                )}

                {data.archiveGroups && data.archiveGroups.length > 0 && (
                  <ArchivePanel groups={data.archiveGroups} />
                )}

                {selectedTarget.kind === "building" &&
                  isTechDepartmentBuilding(selectedTarget.label) && (
                  <Section title="Мониторинг техотдела" defaultOpen>
                    <TechDepartmentStatsPanel
                      visibleCounterIds={DEFAULT_TECH_DEPARTMENT_VISIBLE_COUNTERS}
                    />
                  </Section>
                )}

                {data.recentLogs && data.recentLogs.length > 0 && (
                  <Section title="История запросов" count={data.recentLogs.length}>
                    <RequestHistoryList logs={data.recentLogs} deep={deepDetail} />
                  </Section>
                )}

                <Section title="Источники знаний (наследование)">
                  <KnowledgeSourcesBlock groups={data.knowledgeSources} />
                </Section>

                <Section title="Правила" count={data.rules.length}>
                  {data.rules.length === 0 && (
                    <p className="text-xs text-stone-500">Правил пока нет.</p>
                  )}
                  <ul className="space-y-1">
                    {data.rules.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-start justify-between gap-2 rounded border border-stone-800 px-2 py-1 text-xs text-stone-300"
                      >
                        <span className="min-w-0 flex-1 whitespace-pre-wrap">{r.rule_text}</span>
                        <button
                          type="button"
                          onClick={() => void deleteRule(r.id)}
                          className="shrink-0 text-stone-500 hover:text-red-400"
                          aria-label="Удалить правило"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-2 flex gap-1">
                    <input
                      value={newRule}
                      onChange={(e) => setNewRule(e.target.value)}
                      placeholder="Новое правило…"
                      disabled={savingRule}
                      className="min-w-0 flex-1 rounded border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-100"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void addRule();
                        }
                      }}
                    />
                    <button
                      type="button"
                      disabled={savingRule || !newRule.trim()}
                      onClick={() => void addRule()}
                      className="shrink-0 rounded bg-stone-700 px-2 py-1 text-xs disabled:opacity-50"
                    >
                      {savingRule ? "…" : "Добавить"}
                    </button>
                  </div>
                </Section>

                <Section title="Локальная база знаний" count={data.localKnowledge.length}>
                  <KnowledgeLibraryBrowse
                    entries={data.localKnowledge}
                    onDelete={(id) => void deleteKnowledge(id)}
                    onAttachFile={(entryId, file) => attachKnowledgeToEntry(entryId, file)}
                    attaching={attachingKnowledge}
                    deleting={savingKnowledge}
                  />
                  <input
                    value={newKnowTitle}
                    onChange={(e) => setNewKnowTitle(e.target.value)}
                    placeholder="Заголовок"
                    disabled={savingKnowledge}
                    className="mt-2 w-full rounded border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-100"
                  />
                  <textarea
                    value={newKnowContent}
                    onChange={(e) => setNewKnowContent(e.target.value)}
                    placeholder="Описание для поиска (необязательно для текстовой заметки)"
                    rows={3}
                    disabled={savingKnowledge}
                    className="mt-1 w-full rounded border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-100"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={savingKnowledge || !newKnowTitle.trim()}
                      onClick={() => void addKnowledge()}
                      className="rounded bg-stone-700 px-2 py-1 text-xs disabled:opacity-50"
                    >
                      {savingKnowledge ? "…" : "Добавить текст"}
                    </button>
                    <button
                      type="button"
                      disabled={savingKnowledge}
                      onClick={() => knowledgeFileRef.current?.click()}
                      className="rounded border border-stone-600 px-2 py-1 text-xs text-stone-200 hover:bg-stone-800 disabled:opacity-50"
                    >
                      {savingKnowledge ? "…" : "Загрузить файл"}
                    </button>
                    <input
                      ref={knowledgeFileRef}
                      type="file"
                      accept={KNOWLEDGE_FILE_ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void addKnowledgeFromFile(file);
                      }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-stone-500">
                    Комментарий дополняет файл. TXT/MD до 512 KB, PDF/DOC до 256 KB как вложение.
                  </p>
                </Section>

                {selectedTarget.kind === "chamber" && (
                  <Section title="Назначения" count={data.assignments.length}>
                    <div
                      data-testid="workspace-inspector-routing-role"
                      className="rounded border border-sky-900/60 bg-sky-950/20 px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-sky-300">
                            <span aria-hidden>🚪</span>
                            <span>Главный отдел здания</span>
                          </div>
                          <p className="mt-1 text-[11px] text-stone-400">
                            Этот статус определяет, в какой отдел Mayor отправляет запросы снаружи.
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={savingRoutingRole}
                          data-testid="workspace-inspector-toggle-main-chamber"
                          onClick={() =>
                            void setChamberRoutingRole(
                              selectedChamber?.routing_role === "main" ? null : "main",
                            )
                          }
                          className={`shrink-0 rounded px-2 py-1 text-xs font-medium disabled:opacity-50 ${
                            selectedChamber?.routing_role === "main"
                              ? "bg-stone-700 text-stone-100 hover:bg-stone-600"
                              : "bg-sky-500 text-slate-950 hover:bg-sky-400"
                          }`}
                        >
                          {savingRoutingRole
                            ? "…"
                            : selectedChamber?.routing_role === "main"
                              ? "Снять статус"
                              : "Сделать главным"}
                        </button>
                      </div>
                      <div className="mt-2 text-[11px] text-stone-300">
                        {selectedChamber?.routing_role === "main" ? (
                          <span className="rounded bg-emerald-950/50 px-2 py-1 text-emerald-300">
                            Этот отдел сейчас главный для здания
                          </span>
                        ) : buildingMainChamber ? (
                          <span className="rounded bg-amber-950/40 px-2 py-1 text-amber-200">
                            Главный отдел здания: {buildingMainChamber.name}
                          </span>
                        ) : (
                          <span className="rounded bg-red-950/40 px-2 py-1 text-red-300">
                            У здания пока нет главного отдела
                          </span>
                        )}
                      </div>
                      {routingRoleNotice && (
                        <p className="mt-2 text-[11px] text-sky-200">{routingRoleNotice}</p>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-500">
                      Руководитель отдела (👑) получает приоритет при синтезе ответа в режимах Team и Council.
                    </p>
                    {data.assignments.map((a) => {
                      const isLead = data.managerAgentId === a.agent_id;
                      return (
                        <div
                          key={a.id}
                          className={`flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs ${
                            isLead
                              ? "border-amber-600/60 bg-amber-950/30"
                              : "border-stone-800"
                          }`}
                        >
                          <span className="text-stone-200">
                            {isLead ? "👑 " : ""}
                            {a.agents?.name ?? a.agent_id}
                            {isLead ? (
                              <span className="ml-1 text-amber-400/90">· руководитель</span>
                            ) : null}
                          </span>
                          <div className="flex shrink-0 items-center gap-2">
                            {!isLead && (
                              <button
                                type="button"
                                disabled={savingManager}
                                data-testid={`workspace-inspector-set-lead-${a.id}`}
                                onClick={() => void setChamberManager(a.agent_id)}
                                className="text-stone-400 hover:text-amber-300 disabled:opacity-50"
                              >
                                Сделать главным
                              </button>
                            )}
                            {isLead && (
                              <button
                                type="button"
                                disabled={savingManager}
                                onClick={() => void setChamberManager(null)}
                                className="text-stone-500 hover:text-stone-300 disabled:opacity-50"
                              >
                                Снять
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => void removeAssignment(a.id)}
                              className="text-stone-500 hover:text-red-400"
                            >
                              Убрать
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <div className="mt-2 flex gap-1" data-testid="workspace-inspector-assign-agent">
                      <select
                        value={assignAgentId}
                        onChange={(e) => setAssignAgentId(e.target.value)}
                        className="min-w-0 flex-1 rounded border border-stone-700 bg-stone-950 px-2 py-1 text-xs text-stone-100"
                      >
                        <option value="">Add agent…</option>
                        {officeAgents
                          .filter(
                            (a) => !data.assignments.some((asgn) => asgn.agent_id === a.id),
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={!assignAgentId || assigningAgent}
                        onClick={() => void assignAgentToChamber()}
                        className="shrink-0 rounded bg-amber-600 px-2 py-1 text-xs font-medium text-stone-950 disabled:opacity-50"
                      >
                        {assigningAgent ? "…" : "Назначить"}
                      </button>
                    </div>
                  </Section>
                )}

                {data.connections.length > 0 && (
                  <Section title="Связи" count={data.connections.length}>
                    {data.connections.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectConnection(c.id)}
                        className="block w-full rounded border border-stone-800 px-2 py-1 text-left text-xs text-stone-300 hover:bg-stone-800/60"
                      >
                        {c.direction === "outgoing" ? "→" : "←"} {c.peerName}
                        {c.sendTasks ? " · send_tasks" : ""}
                      </button>
                    ))}
                  </Section>
                )}

                <Section title="Metadata" defaultOpen={deepDetail}>
                  <dl className="space-y-1 text-xs">
                    {Object.entries(data.metadata).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="text-stone-500">{k}</dt>
                        <dd className="max-w-[55%] truncate text-right font-mono text-stone-300">
                          {v == null ? "—" : String(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </Section>

                <Section title="Действия" defaultOpen>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="workspace-inspector-deep-toggle"
                      onClick={() => setDeepDetail((v) => !v)}
                      className="rounded border border-stone-700 px-2 py-1 text-xs text-stone-200 hover:bg-stone-800"
                    >
                      {deepDetail ? "Свернуть" : "Подробнее"}
                    </button>
                  </div>
                </Section>
              </>
            )}

            {data &&
              selectedKey === inspectorTargetKey(selectedTarget) &&
              inspectorMode === "professional" &&
              selectedTarget.kind === "agent" && (
              <>
                <Section title="Настройки агента">
                  <dl className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <dt className="text-stone-500">provider</dt>
                      <dd className="text-stone-200">{data.agentDetail?.provider ?? selectedTarget.provider}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-stone-500">model</dt>
                      <dd className="truncate text-stone-200">{data.agentDetail?.model_id ?? selectedTarget.modelId}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-stone-500">cost_tier</dt>
                      <dd className="text-stone-200">{data.agentDetail?.cost_tier ?? selectedTarget.costTier}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-stone-500">status</dt>
                      <dd className="text-stone-200">{data.agentDetail?.status ?? "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-stone-500">chamber</dt>
                      <dd className="truncate text-stone-200">{nameByRegistryId(selectedTarget.chamberRegistryId)}</dd>
                    </div>
                  </dl>
                </Section>

                {data.entityStats && (
                  <Section title="Статистика">
                    <StatsCards stats={data.entityStats} />
                  </Section>
                )}

                {data.recentLogs && (
                  <Section title="История запросов" count={data.recentLogs.length}>
                    <RequestHistoryList logs={data.recentLogs} deep={deepDetail} />
                  </Section>
                )}

                {data.connections.length > 0 && (
                  <Section title="Связи" count={data.connections.length}>
                    {data.connections.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectConnection(c.id)}
                        className="block w-full rounded border border-stone-800 px-2 py-1 text-left text-xs text-stone-300 hover:bg-stone-800/60"
                      >
                        {c.direction === "outgoing" ? "→" : "←"} {c.peerName}
                        {c.sendTasks ? " · send_tasks" : ""}
                      </button>
                    ))}
                  </Section>
                )}

                <Section title="Назначение">
                  <p className="text-xs text-stone-400">
                    Отдел: {nameByRegistryId(selectedTarget.chamberRegistryId)}
                  </p>
                  <button
                    type="button"
                    onClick={() => void removeAssignment(selectedTarget.assignmentId)}
                    className="mt-2 rounded border border-red-800 px-2 py-1 text-xs text-red-400"
                  >
                    Убрать из отдела
                  </button>
                </Section>

                <ContextPreviewSection
                  officeId={selectedTarget.officeId}
                  agentId={selectedTarget.agentId}
                  chamberRegistryId={selectedTarget.chamberRegistryId}
                />

                <Section title="Metadata" defaultOpen={deepDetail}>
                  <dl className="space-y-1 text-xs">
                    {Object.entries(data.metadata).map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2">
                        <dt className="text-stone-500">{k}</dt>
                        <dd className="truncate font-mono text-stone-300">{String(v ?? "—")}</dd>
                      </div>
                    ))}
                  </dl>
                </Section>

                <Section title="Действия" defaultOpen>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      data-testid="workspace-inspector-deep-toggle"
                      onClick={() => setDeepDetail((v) => !v)}
                      className="rounded border border-stone-700 px-2 py-1 text-xs text-stone-200 hover:bg-stone-800"
                    >
                      {deepDetail ? "Свернуть" : "Подробнее"}
                    </button>
                    <Link
                      href={`/agents?highlight=${selectedTarget.agentId}`}
                      className="rounded border border-amber-700/60 px-2 py-1 text-xs text-amber-300 hover:bg-amber-950/40"
                    >
                      Admin → Agents
                    </Link>
                  </div>
                </Section>
              </>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
