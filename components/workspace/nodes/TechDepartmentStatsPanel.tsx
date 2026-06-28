"use client";

import { useCallback, useEffect, useState } from "react";
import type { TechDepartmentStats } from "@/lib/tech-department-stats";
import type { ProviderHealthRow } from "@/lib/provider-failover-status";
import { TechDepartmentStatTiles } from "@/components/workspace/nodes/TechDepartmentStatTiles";

type TechDepartmentStatsPanelProps = {
  visibleCounterIds: string[];
  /** Fetch once when panel mounts (Inspector open). */
  autoLoad?: boolean;
};

export function TechDepartmentStatsPanel({
  visibleCounterIds,
  autoLoad = true,
}: TechDepartmentStatsPanelProps) {
  const [stats, setStats] = useState<TechDepartmentStats | null>(null);
  const [providers, setProviders] = useState<ProviderHealthRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, healthRes] = await Promise.all([
        fetch("/api/tech-department/stats", { cache: "no-store" }),
        fetch("/api/tech-department/provider-health", { cache: "no-store" }),
      ]);
      if (!statsRes.ok) throw new Error(`stats ${statsRes.status}`);
      const statsBody = (await statsRes.json()) as TechDepartmentStats;
      setStats(statsBody);
      if (healthRes.ok) {
        const healthBody = (await healthRes.json()) as { providers?: ProviderHealthRow[] };
        setProviders(healthBody.providers ?? []);
      } else {
        setProviders([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoLoad) return;
    void refresh();
  }, [autoLoad, refresh]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">
          Плитка на здании обновляется при действиях на canvas. Здесь — полный срез с сервера по кнопке.
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          className="shrink-0 rounded border border-stone-600 px-2 py-1 text-xs text-stone-200 hover:bg-stone-800 disabled:opacity-50"
          data-testid="tech-dept-stats-refresh"
        >
          {loading ? "…" : "Обновить"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400" data-testid="tech-dept-stats-error">
          {error}
        </p>
      )}

      {stats && (
        <TechDepartmentStatTiles
          stats={stats}
          visibleCounterIds={visibleCounterIds}
          className="workspace-tech-dept-stats--inspector"
          testId="workspace-tech-dept-stats"
          title={`Обновлено ${new Date(stats.updatedAt).toLocaleTimeString()}`}
        />
      )}

      <div>
        <p className="mb-1 text-xs font-medium text-stone-400">Провайдеры</p>
        <ul className="space-y-1">
          {providers.map((p) => (
            <li
              key={p.providerTag}
              className="flex items-center justify-between rounded border border-stone-800 px-2 py-1 text-xs"
            >
              <span className="text-stone-300">{p.providerTag}</span>
              <span
                className={
                  p.status === "available"
                    ? "text-emerald-400"
                    : p.status === "on_fallback"
                      ? "text-amber-400"
                      : "text-red-400"
                }
              >
                {p.status === "available"
                  ? "доступен"
                  : p.status === "on_fallback"
                    ? `резерв: ${p.modelUsed ?? "?"}`
                    : "недоступен"}
              </span>
            </li>
          ))}
          {providers.length === 0 && !loading && (
            <li className="text-xs text-stone-500">
              Нет in-memory данных — выполните LLM-запрос или нажмите «Обновить».
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
