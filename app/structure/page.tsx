"use client";

import { useCallback, useEffect, useState } from "react";
import { ControlShell } from "@/components/control/ControlShell";
import { AI_COUNCIL_OFFICE_ID } from "@/lib/ai-council-ids";
import { DEFAULT_BUILDING, DEFAULT_CHAMBER } from "@/lib/control-defaults";
import type { OfficeObjectRow, ChamberRow, RuleRow } from "@/lib/office-types";

type KnowledgeEntry = {
  id: string;
  title: string;
  content: string;
};

type Assignment = {
  id: string;
  agent_id: string;
  agents?: { id: string; name: string } | null;
};

type AgentOption = { id: string; name: string };

export default function StructurePage() {
  const officeId = AI_COUNCIL_OFFICE_ID;
  const [buildings, setBuildings] = useState<OfficeObjectRow[]>([]);
  const [expandedBuilding, setExpandedBuilding] = useState<string | null>(null);
  const [chambersByBuilding, setChambersByBuilding] = useState<
    Record<string, ChamberRow[]>
  >({});
  const [selectedChamber, setSelectedChamber] = useState<ChamberRow | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newBuildingName, setNewBuildingName] = useState("");
  const [newBuildingRouting, setNewBuildingRouting] = useState("");
  const [newChamberName, setNewChamberName] = useState("");
  const [newChamberRouting, setNewChamberRouting] = useState("");
  const [assignAgentId, setAssignAgentId] = useState("");
  const [newRuleText, setNewRuleText] = useState("");
  const [newKnowledgeTitle, setNewKnowledgeTitle] = useState("");
  const [newKnowledgeContent, setNewKnowledgeContent] = useState("");

  const loadBuildings = useCallback(async () => {
    const res = await fetch(`/api/offices/${officeId}/objects`);
    const data = (await res.json()) as { objects?: OfficeObjectRow[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить здания");
    setBuildings((data.objects ?? []).filter((o) => o.object_type === "room"));
  }, [officeId]);

  const loadAgents = useCallback(async () => {
    const res = await fetch(`/api/offices/${officeId}`);
    const data = (await res.json()) as { agents?: AgentOption[]; error?: string };
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить агентов");
    setAgents(data.agents ?? []);
  }, [officeId]);

  const loadChambers = useCallback(
    async (buildingId: string) => {
      const res = await fetch(
        `/api/offices/${officeId}/buildings/${buildingId}/chambers`,
      );
      const data = (await res.json()) as { chambers?: ChamberRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить отделы");
      setChambersByBuilding((prev) => ({
        ...prev,
        [buildingId]: data.chambers ?? [],
      }));
    },
    [officeId],
  );

  const loadChamberDetails = useCallback(async (chamber: ChamberRow) => {
    const entityId = chamber.entity_registry_id || chamber.id;
    const [rulesRes, knowRes, assignRes] = await Promise.all([
      fetch(`/api/rules?entity_type=chamber&entity_id=${entityId}`),
      fetch(`/api/knowledge?entity_type=chamber&entity_id=${entityId}`),
      fetch(`/api/chambers/${chamber.id}/assignments`),
    ]);
    const rulesData = (await rulesRes.json()) as { rules?: RuleRow[] };
    const knowData = (await knowRes.json()) as { entries?: KnowledgeEntry[] };
    const assignData = (await assignRes.json()) as { assignments?: Assignment[] };
    setRules(rulesData.rules ?? []);
    setKnowledge(knowData.entries ?? []);
    setAssignments(assignData.assignments ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadBuildings(), loadAgents()]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadBuildings, loadAgents]);

  async function handleCreateBuilding(e: React.FormEvent) {
    e.preventDefault();
    const name = newBuildingName.trim();
    const routingDescription = newBuildingRouting.trim();
    if (!name || !routingDescription) return;
    setError(null);
    try {
      const res = await fetch(`/api/offices/${officeId}/objects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object_type: "room",
          label: name,
          routing_description: routingDescription,
          position_x: DEFAULT_BUILDING.position_x,
          position_z: DEFAULT_BUILDING.position_z,
          size_w: DEFAULT_BUILDING.size_w,
          size_d: DEFAULT_BUILDING.size_d,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось создать здание");
      setNewBuildingName("");
      setNewBuildingRouting("");
      await loadBuildings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function toggleBuilding(buildingId: string) {
    if (expandedBuilding === buildingId) {
      setExpandedBuilding(null);
      setSelectedChamber(null);
      return;
    }
    setExpandedBuilding(buildingId);
    setSelectedChamber(null);
    try {
      await loadChambers(buildingId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function handleCreateChamber(e: React.FormEvent) {
    e.preventDefault();
    if (!expandedBuilding) return;
    const name = newChamberName.trim();
    if (!name) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/offices/${officeId}/buildings/${expandedBuilding}/chambers`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            ...DEFAULT_CHAMBER,
            routing_description: newChamberRouting.trim() || undefined,
          }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось создать отдел");
      setNewChamberName("");
      setNewChamberRouting("");
      await loadChambers(expandedBuilding);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function selectChamber(chamber: ChamberRow) {
    setSelectedChamber(chamber);
    try {
      await loadChamberDetails(chamber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function handleAssignAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedChamber || !assignAgentId) return;
    setError(null);
    try {
      const res = await fetch(
        `/api/chambers/${selectedChamber.id}/assignments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agent_id: assignAgentId }),
        },
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось назначить агента");
      setAssignAgentId("");
      await loadChamberDetails(selectedChamber);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function removeAssignment(assignmentId: string) {
    if (!selectedChamber) return;
    const res = await fetch(
      `/api/chambers/${selectedChamber.id}/assignments/${assignmentId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Не удалось удалить назначение");
      return;
    }
    await loadChamberDetails(selectedChamber);
  }

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedChamber || !newRuleText.trim()) return;
    const entityId = selectedChamber.entity_registry_id || selectedChamber.id;
    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_type: "chamber",
        entity_id: entityId,
        rule_text: newRuleText.trim(),
      }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Ошибка правила");
      return;
    }
    setNewRuleText("");
    await loadChamberDetails(selectedChamber);
  }

  async function handleAddKnowledge(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedChamber || !newKnowledgeTitle.trim()) return;
    const entityId = selectedChamber.entity_registry_id || selectedChamber.id;
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entity_type: "chamber",
        entity_id: entityId,
        title: newKnowledgeTitle.trim(),
        content: newKnowledgeContent.trim(),
      }),
    });
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Ошибка knowledge");
      return;
    }
    setNewKnowledgeTitle("");
    setNewKnowledgeContent("");
    await loadChamberDetails(selectedChamber);
  }

  return (
    <ControlShell title="Структура города">
      {loading && <p className="text-neutral-400">Загрузка...</p>}
      {error && <p className="mb-3 text-red-400">{error}</p>}

      <form onSubmit={handleCreateBuilding} className="mb-6 flex gap-2">
        <div className="flex w-full flex-col gap-2">
          <input
            value={newBuildingName}
            onChange={(e) => setNewBuildingName(e.target.value)}
            placeholder="Название нового здания"
            className="rounded border border-neutral-600 bg-neutral-900 px-3 py-2"
          />
          <textarea
            value={newBuildingRouting}
            onChange={(e) => setNewBuildingRouting(e.target.value)}
            placeholder="Для чего это здание? Чем оно занимается?"
            rows={3}
            className="rounded border border-neutral-600 bg-neutral-900 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!newBuildingName.trim() || !newBuildingRouting.trim()}
            className="rounded bg-neutral-200 px-3 py-2 text-neutral-900 disabled:opacity-50"
          >
            Создать здание
          </button>
        </div>
      </form>

      <ul className="space-y-2">
        {buildings.map((b) => {
          const label = b.label || `Building ${b.id.slice(0, 8)}`;
          const open = expandedBuilding === b.id;
          const chambers = chambersByBuilding[b.id] ?? [];
          return (
            <li key={b.id} className="rounded border border-neutral-700">
              <button
                type="button"
                onClick={() => toggleBuilding(b.id)}
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-neutral-800"
              >
                <span className="font-medium">{label}</span>
                <span className="text-neutral-400">{open ? "▼" : "▶"}</span>
              </button>
              {open && (
                <div className="border-t border-neutral-700 px-3 py-2">
                  <form onSubmit={handleCreateChamber} className="mb-3 space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={newChamberName}
                        onChange={(e) => setNewChamberName(e.target.value)}
                        placeholder="Название отдела"
                        className="flex-1 rounded border border-neutral-600 bg-neutral-900 px-2 py-1"
                      />
                      <button
                        type="submit"
                        className="rounded border border-neutral-500 px-2 py-1"
                      >
                        + Отдел
                      </button>
                    </div>
                    <input
                      value={newChamberRouting}
                      onChange={(e) => setNewChamberRouting(e.target.value)}
                      placeholder="routing_description (опционально)"
                      className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-xs"
                    />
                  </form>
                  <ul className="space-y-1">
                    {chambers.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => selectChamber(c)}
                          className={`w-full rounded px-2 py-1 text-left hover:bg-neutral-800 ${
                            selectedChamber?.id === c.id ? "bg-neutral-800" : ""
                          }`}
                        >
                          {c.name}
                        </button>
                      </li>
                    ))}
                    {chambers.length === 0 && (
                      <li className="text-neutral-500">Нет отделов</li>
                    )}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {selectedChamber && (
        <section className="mt-6 rounded border border-neutral-600 p-4">
          <h2 className="mb-3 text-lg font-medium">Отдел: {selectedChamber.name}</h2>

          <h3 className="mb-1 font-medium">Агенты</h3>
          <ul className="mb-2 list-disc pl-5">
            {assignments.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <span>{a.agents?.name ?? a.agent_id}</span>
                <button
                  type="button"
                  onClick={() => removeAssignment(a.id)}
                  className="text-xs text-red-400"
                >
                  убрать
                </button>
              </li>
            ))}
            {assignments.length === 0 && (
              <li className="list-none text-neutral-500">Нет назначений</li>
            )}
          </ul>
          <form onSubmit={handleAssignAgent} className="mb-4 flex gap-2">
            <select
              value={assignAgentId}
              onChange={(e) => setAssignAgentId(e.target.value)}
              className="flex-1 rounded border border-neutral-600 bg-neutral-900 px-2 py-1"
            >
              <option value="">Выберите агента</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded border border-neutral-500 px-2">
              Назначить
            </button>
          </form>

          <h3 className="mb-1 font-medium">Rules</h3>
          <ul className="mb-2 list-disc pl-5">
            {rules.map((r) => (
              <li key={r.id}>{r.rule_text}</li>
            ))}
          </ul>
          <form onSubmit={handleAddRule} className="mb-4 flex gap-2">
            <input
              value={newRuleText}
              onChange={(e) => setNewRuleText(e.target.value)}
              placeholder="Новое правило"
              className="flex-1 rounded border border-neutral-600 bg-neutral-900 px-2 py-1"
            />
            <button type="submit" className="rounded border border-neutral-500 px-2">
              +
            </button>
          </form>

          <h3 className="mb-1 font-medium">Knowledge</h3>
          <ul className="mb-2 space-y-1">
            {knowledge.map((k) => (
              <li key={k.id}>
                <strong>{k.title}</strong>
                {k.content ? `: ${k.content.slice(0, 80)}` : ""}
              </li>
            ))}
          </ul>
          <form onSubmit={handleAddKnowledge} className="space-y-2">
            <input
              value={newKnowledgeTitle}
              onChange={(e) => setNewKnowledgeTitle(e.target.value)}
              placeholder="Заголовок"
              className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1"
            />
            <textarea
              value={newKnowledgeContent}
              onChange={(e) => setNewKnowledgeContent(e.target.value)}
              placeholder="Содержание"
              rows={2}
              className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1"
            />
            <button type="submit" className="rounded border border-neutral-500 px-2 py-1">
              Добавить knowledge
            </button>
          </form>
        </section>
      )}
    </ControlShell>
  );
}
