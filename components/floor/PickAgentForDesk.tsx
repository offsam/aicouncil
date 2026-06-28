"use client";

import { useEffect, useState } from "react";
import type { AgentRow } from "@/lib/office-types";

interface PickAgentForDeskProps {
  open: boolean;
  onClose: () => void;
  onPick: (agent: AgentRow) => void;
  officeId: string;
  supabaseConfigured: boolean;
  placedAgentIds?: string[];
}

export function PickAgentForDesk({
  open,
  onClose,
  onPick,
  officeId,
  supabaseConfigured,
  placedAgentIds = [],
}: PickAgentForDeskProps) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/agents/connected?office_id=${encodeURIComponent(officeId)}`)
      .then(async (res) => {
        const data = (await res.json()) as { agents?: AgentRow[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить агентов");
        if (!cancelled) {
          const placed = new Set(placedAgentIds);
          setAgents((data.agents ?? []).filter((a) => !placed.has(a.id)));
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, officeId, placedAgentIds]);

  async function pickAgent(agent: AgentRow) {
    setAssigning(agent.id);
    setError(null);
    try {
      if (supabaseConfigured) {
        const res = await fetch(`/api/agents/${agent.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ office_id: officeId }),
        });
        const data = (await res.json()) as { agent?: AgentRow; error?: string };
        if (!res.ok || !data.agent) throw new Error(data.error ?? "Не удалось назначить");
        onPick(data.agent);
      } else {
        onPick({ ...agent, office_id: officeId });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка назначения");
    } finally {
      setAssigning(null);
    }
  }

  if (!open) return null;

  return (
    <div className="theme-overlay absolute inset-0 z-40 flex items-end justify-start p-5 pb-28 backdrop-blur-sm md:items-center md:justify-center md:p-4 md:pb-4">
      <div className="theme-panel-solid w-full max-w-md rounded-2xl p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-theme-primary">Рабочий стол</h3>
            <p className="mt-1 text-xs text-theme-muted">
              Агенты с подключённым API — выберите, затем поставьте на карту
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-theme-muted hover:text-theme-secondary"
          >
            ✕
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
        {loading && <p className="text-sm text-theme-muted">Загрузка…</p>}

        {!loading && agents.length === 0 && (
          <p className="text-sm text-theme-muted">
            Нет свободных агентов с API-ключом. Проверьте .env.local
          </p>
        )}

        {!loading && agents.length > 0 && (
          <ul className="max-h-72 space-y-2 overflow-y-auto">
            {agents.map((agent) => (
              <li key={agent.id}>
                <button
                  type="button"
                  disabled={assigning === agent.id}
                  onClick={() => void pickAgent(agent)}
                  className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white/60 px-4 py-3 text-left transition hover:border-stone-400/40 disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
                    <div>
                      <p className="text-sm font-medium text-theme-secondary">{agent.name}</p>
                      <p className="text-xs text-theme-muted">
                        {agent.provider} · API подключён
                      </p>
                    </div>
                  </div>
                  <span className="text-xs text-stone-600 dark:text-stone-300">
                    {assigning === agent.id ? "…" : "Выбрать"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
