"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ControlShell } from "@/components/control/ControlShell";

type ConnectionRow = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  is_active: boolean;
  source?: { name: string } | null;
  target?: { name: string } | null;
  connection_permissions?: {
    read_knowledge: boolean;
    read_rules: boolean;
    read_results: boolean;
    send_tasks: boolean;
  } | null;
};

type ChamberOption = {
  id: string;
  name: string;
  entity_registry_id: string;
  buildingLabel: string;
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [chambers, setChambers] = useState<ChamberOption[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sourceId, setSourceId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [perms, setPerms] = useState({
    read_knowledge: false,
    read_rules: false,
    read_results: false,
    send_tasks: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [connRes, chambRes] = await Promise.all([
        fetch("/api/connections"),
        fetch("/api/chambers"),
      ]);
      const connData = (await connRes.json()) as {
        connections?: ConnectionRow[];
        error?: string;
      };
      const chambData = (await chambRes.json()) as {
        chambers?: Array<{
          id: string;
          name: string;
          entity_registry_id: string;
          building_object_id: string;
          entity_registry?: { parent_entity_id?: string };
        }>;
        error?: string;
      };
      if (!connRes.ok) throw new Error(connData.error ?? "connections");
      if (!chambRes.ok) throw new Error(chambData.error ?? "chambers");

      setConnections(connData.connections ?? []);

      const buildingIds = new Set(
        (chambData.chambers ?? []).map((c) => c.building_object_id),
      );
      const buildingLabels = new Map<string, string>();
      if (buildingIds.size > 0) {
        const objRes = await fetch(
          `/api/offices/f47ac10b-58cc-4372-a567-0e02b2c3d479/objects`,
        );
        const objData = (await objRes.json()) as {
          objects?: Array<{ id: string; label: string | null }>;
        };
        for (const o of objData.objects ?? []) {
          buildingLabels.set(o.id, o.label || o.id.slice(0, 8));
        }
      }

      setChambers(
        (chambData.chambers ?? []).map((c) => ({
          id: c.id,
          name: c.name,
          entity_registry_id: c.entity_registry_id,
          buildingLabel: buildingLabels.get(c.building_object_id) ?? "?",
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const chamberLabel = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of chambers) {
      m.set(
        c.entity_registry_id,
        `${c.buildingLabel} / ${c.name}`,
      );
    }
    return m;
  }, [chambers]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter((c) => {
      const s = chamberLabel.get(c.source_entity_id) ?? c.source?.name ?? "";
      const t = chamberLabel.get(c.target_entity_id) ?? c.target?.name ?? "";
      return s.toLowerCase().includes(q) || t.toLowerCase().includes(q);
    });
  }, [connections, filter, chamberLabel]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!sourceId || !targetId) return;
    setError(null);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_entity_id: sourceId,
          target_entity_id: targetId,
          ...perms,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось создать связь");
      setSourceId("");
      setTargetId("");
      setPerms({
        read_knowledge: false,
        read_rules: false,
        read_results: false,
        send_tasks: false,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    }
  }

  function formatPerms(c: ConnectionRow) {
    const p = c.connection_permissions;
    if (!p) return "—";
    const flags = [];
    if (p.read_knowledge) flags.push("read_knowledge");
    if (p.read_rules) flags.push("read_rules");
    if (p.read_results) flags.push("read_results");
    if (p.send_tasks) flags.push("send_tasks");
    return flags.join(", ") || "нет прав";
  }

  return (
    <ControlShell title="Связи между отделами">
      {loading && <p className="text-neutral-400">Загрузка...</p>}
      {error && <p className="mb-3 text-red-400">{error}</p>}

      <form onSubmit={handleCreate} className="mb-6 space-y-3 rounded border border-neutral-700 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-neutral-400">От отдела</span>
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1"
            >
              <option value="">—</option>
              {chambers.map((c) => (
                <option key={c.entity_registry_id} value={c.entity_registry_id}>
                  {c.buildingLabel} / {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-neutral-400">К отделу</span>
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full rounded border border-neutral-600 bg-neutral-900 px-2 py-1"
            >
              <option value="">—</option>
              {chambers.map((c) => (
                <option key={`t-${c.entity_registry_id}`} value={c.entity_registry_id}>
                  {c.buildingLabel} / {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["read_knowledge", "read_knowledge"],
              ["read_rules", "read_rules"],
              ["read_results", "read_results"],
              ["send_tasks", "send_tasks"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={perms[key]}
                onChange={(e) =>
                  setPerms((p) => ({ ...p, [key]: e.target.checked }))
                }
              />
              {label}
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="rounded bg-neutral-200 px-3 py-2 text-neutral-900"
        >
          Создать связь
        </button>
      </form>

      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Поиск по названию отдела..."
        className="mb-3 w-full rounded border border-neutral-600 bg-neutral-900 px-3 py-2"
      />

      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="border-b border-neutral-700 text-neutral-400">
            <th className="py-2 pr-2">Источник</th>
            <th className="py-2 pr-2">Цель</th>
            <th className="py-2">Права</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id} className="border-b border-neutral-800">
              <td className="py-2 pr-2">
                {chamberLabel.get(c.source_entity_id) ??
                  c.source?.name ??
                  c.source_entity_id.slice(0, 8)}
              </td>
              <td className="py-2 pr-2">
                {chamberLabel.get(c.target_entity_id) ??
                  c.target?.name ??
                  c.target_entity_id.slice(0, 8)}
              </td>
              <td className="py-2">{formatPerms(c)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && !loading && (
        <p className="mt-2 text-neutral-500">Связей нет</p>
      )}
    </ControlShell>
  );
}
