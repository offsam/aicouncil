"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ControlShell } from "@/components/control/ControlShell";
import { normalizeCostTier } from "@/lib/cost-tier";

type AgentRow = {
  id: string;
  name: string;
  provider: string | null;
  model_id: string | null;
  cost_tier: string | null;
};

type ChamberInfo = {
  chamberId: string;
  chamberName: string;
  buildingLabel: string;
  entityRegistryId: string;
};

type AssignmentRow = {
  id: string;
  agent_id: string;
  chamber_id: string;
};

export default function AgentsPage() {
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [assignmentsByChamber, setAssignmentsByChamber] = useState<
    Record<string, AssignmentRow[]>
  >({});
  const [chamberMap, setChamberMap] = useState<Map<string, ChamberInfo>>(new Map());
  const [allChambers, setAllChambers] = useState<ChamberInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addAgentId, setAddAgentId] = useState<string | null>(null);
  const [addChamberId, setAddChamberId] = useState("");

  useEffect(() => {
    fetch("/api/workspace/office-id")
      .then((r) => r.json())
      .then((data: { officeId?: string; error?: string }) => {
        if (data.officeId) setOfficeId(data.officeId);
        else setError(data.error ?? "Office not resolved");
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Office not resolved"));
  }, []);

  const load = useCallback(async () => {
    if (!officeId) return;
    setLoading(true);
    setError(null);
    try {
      const [officeRes, assignRes, chambRes, objRes] = await Promise.all([
        fetch(`/api/offices/${officeId}`),
        fetch("/api/chambers/assignments"),
        fetch("/api/chambers"),
        fetch(`/api/offices/${officeId}/objects`),
      ]);
      const officeData = (await officeRes.json()) as {
        agents?: AgentRow[];
        error?: string;
      };
      const assignData = (await assignRes.json()) as {
        assignmentsByChamber?: Record<string, AssignmentRow[]>;
        error?: string;
      };
      const chambData = (await chambRes.json()) as {
        chambers?: Array<{
          id: string;
          name: string;
          entity_registry_id: string;
          building_object_id: string;
        }>;
      };
      const objData = (await objRes.json()) as {
        objects?: Array<{ id: string; label: string | null }>;
      };
      if (!officeRes.ok) throw new Error(officeData.error ?? "agents");

      const buildingLabels = new Map<string, string>();
      for (const o of objData.objects ?? []) {
        buildingLabels.set(o.id, o.label || o.id.slice(0, 8));
      }

      const cmap = new Map<string, ChamberInfo>();
      const chamberList: ChamberInfo[] = [];
      for (const c of chambData.chambers ?? []) {
        const info: ChamberInfo = {
          chamberId: c.id,
          chamberName: c.name,
          buildingLabel: buildingLabels.get(c.building_object_id) ?? "?",
          entityRegistryId: c.entity_registry_id,
        };
        cmap.set(c.id, info);
        chamberList.push(info);
      }

      setAgents(officeData.agents ?? []);
      setAssignmentsByChamber(assignData.assignmentsByChamber ?? {});
      setChamberMap(cmap);
      setAllChambers(chamberList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [officeId]);

  useEffect(() => {
    if (!officeId) return;
    load();
  }, [load, officeId]);

  const agentChambers = useMemo(() => {
    const byAgent = new Map<string, { assignmentId: string; info: ChamberInfo }[]>();
    for (const [chamberId, rows] of Object.entries(assignmentsByChamber)) {
      const info = chamberMap.get(chamberId);
      if (!info) continue;
      for (const row of rows) {
        const list = byAgent.get(row.agent_id) ?? [];
        list.push({ assignmentId: row.id, info });
        byAgent.set(row.agent_id, list);
      }
    }
    return byAgent;
  }, [assignmentsByChamber, chamberMap]);

  async function handleAddAssignment(e: React.FormEvent) {
    e.preventDefault();
    if (!addAgentId || !addChamberId) return;
    setError(null);
    try {
      const res = await fetch(`/api/chambers/${addChamberId}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: addAgentId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось назначить");
      setAddChamberId("");
      setAddAgentId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function removeAssignment(chamberId: string, assignmentId: string) {
    const res = await fetch(
      `/api/chambers/${chamberId}/assignments/${assignmentId}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      const data = (await res.json()) as { error?: string };
      setError(data.error ?? "Ошибка удаления");
      return;
    }
    await load();
  }

  return (
    <ControlShell title="Агенты и назначения">
      {loading && <p className="text-neutral-400">Загрузка...</p>}
      {error && <p className="mb-3 text-red-400">{error}</p>}

      <ul className="space-y-4">
        {agents.map((agent) => {
          const chambers = agentChambers.get(agent.id) ?? [];
          return (
            <li
              key={agent.id}
              className="rounded border border-neutral-700 p-4"
            >
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-medium">{agent.name}</h2>
                <span className="text-xs text-neutral-400">
                  {agent.provider ?? "?"} / {agent.model_id ?? "?"} · tier:{" "}
                  {normalizeCostTier(agent.cost_tier)}
                </span>
              </div>
              <p className="mb-2 text-xs text-neutral-400">
                Назначений: {chambers.length}
              </p>
              <ul className="mb-2 space-y-1">
                {chambers.map(({ assignmentId, info }) => (
                  <li
                    key={assignmentId}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span>
                      {info.buildingLabel} / {info.chamberName}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        removeAssignment(info.chamberId, assignmentId)
                      }
                      className="text-xs text-red-400"
                    >
                      убрать
                    </button>
                  </li>
                ))}
                {chambers.length === 0 && (
                  <li className="text-neutral-500">Нет назначений</li>
                )}
              </ul>
              {addAgentId === agent.id ? (
                <form onSubmit={handleAddAssignment} className="flex gap-2">
                  <select
                    value={addChamberId}
                    onChange={(e) => setAddChamberId(e.target.value)}
                    className="flex-1 rounded border border-neutral-600 bg-neutral-900 px-2 py-1 text-sm"
                  >
                    <option value="">Отдел</option>
                    {allChambers.map((c) => (
                      <option key={c.chamberId} value={c.chamberId}>
                        {c.buildingLabel} / {c.chamberName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="rounded border border-neutral-500 px-2 text-sm"
                  >
                    OK
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddAgentId(null);
                      setAddChamberId("");
                    }}
                    className="text-sm text-neutral-400"
                  >
                    отмена
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddAgentId(agent.id)}
                  className="text-sm text-neutral-300 underline"
                >
                  + назначить в отдел
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </ControlShell>
  );
}
