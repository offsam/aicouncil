"use client";

import { useEffect, useState } from "react";
import type { AgentRow, AgentStats, RequestLogRow, BuiltContext } from "@/lib/office-types";

interface AgentDetailPanelProps {
  officeId: string;
  agentId: string;
  color: string;
  open: boolean;
  onClose: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AgentDetailPanel({
  officeId,
  agentId,
  color,
  open,
  onClose,
}: AgentDetailPanelProps) {
  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<RequestLogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Context Preview state
  const [showContextPreview, setShowContextPreview] = useState(false);
  const [contextData, setContextData] = useState<BuiltContext | null>(null);
  const [contextLoading, setContextLoading] = useState(false);
  const [contextError, setContextError] = useState<string | null>(null);
  const [showFullPrompt, setShowFullPrompt] = useState(false);

  useEffect(() => {
    // Reset context state when agent changes or panel closes
    setShowContextPreview(false);
    setContextData(null);
    setShowFullPrompt(false);
    setContextError(null);
  }, [agentId, open]);

  const toggleContextPreview = () => {
    const nextState = !showContextPreview;
    setShowContextPreview(nextState);
    if (nextState && !contextData && !contextLoading) {
      setContextLoading(true);
      setContextError(null);
      fetch(`/api/offices/${officeId}/agents/${agentId}/context`)
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить контекст");
          setContextData(data);
        })
        .catch((err: Error) => {
          setContextError(err.message);
        })
        .finally(() => {
          setContextLoading(false);
        });
    }
  };

  useEffect(() => {
    if (!open || !agentId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/offices/${officeId}/agents/${agentId}`)
      .then(async (res) => {
        const data = (await res.json()) as {
          agent?: AgentRow;
          stats?: AgentStats;
          recentLogs?: RequestLogRow[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить агента");
        if (cancelled) return;
        setAgent(data.agent ?? null);
        setStats(data.stats ?? null);
        setRecentLogs(data.recentLogs ?? []);
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
  }, [officeId, agentId, open]);

  if (!open) return null;

  return (
    <div className="theme-panel-solid absolute bottom-6 left-1/2 z-20 w-[min(92vw,420px)] -translate-x-1/2 rounded-2xl p-4 shadow-2xl">
      {loading && <p className="text-sm text-theme-muted">Загрузка…</p>}

      {error && (
        <p className="mb-2 text-sm text-red-400">{error}</p>
      )}

      {agent && (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-base font-semibold" style={{ color }}>
                {agent.name}
              </p>
              <p className="mt-1 text-xs text-theme-faint">
                {agent.provider} · {agent.model_id}
              </p>
              <p className="mt-2 text-sm text-theme-muted">
                Статус:{" "}
                <span
                  className={
                    agent.status === "online"
                      ? "text-emerald-400"
                      : agent.status === "error"
                        ? "text-red-400"
                        : "text-theme-faint"
                  }
                >
                  {agent.status}
                </span>
              </p>
            </div>
            <span
              className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
                agent.status === "online"
                  ? "bg-emerald-400 shadow-[0_0_12px_#22c55e]"
                  : "bg-zinc-600"
              }`}
            />
          </div>

          {stats && (
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-zinc-200 bg-white/60 px-2 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-lg font-semibold text-theme-primary">{stats.total}</p>
                <p className="text-[10px] uppercase tracking-wide text-theme-faint">Всего</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white/60 px-2 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{stats.success}</p>
                <p className="text-[10px] uppercase tracking-wide text-theme-faint">Успех</p>
              </div>
              <div className="rounded-lg border border-zinc-200 bg-white/60 px-2 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                <p className="text-lg font-semibold text-red-500 dark:text-red-400">{stats.error}</p>
                <p className="text-[10px] uppercase tracking-wide text-theme-faint">Ошибки</p>
              </div>
            </div>
          )}

          {/* Context Preview Section */}
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-white/10">
            <button
              type="button"
              onClick={toggleContextPreview}
              className="flex w-full items-center justify-between rounded-lg bg-zinc-100 hover:bg-zinc-200/80 dark:bg-white/[0.05] dark:hover:bg-white/[0.08] px-3 py-2 text-xs font-semibold text-theme-primary transition-all duration-200"
            >
              <span>{showContextPreview ? "Свернуть контекст" : "Показать контекст"}</span>
              <svg
                className={`h-4 w-4 transition-transform duration-200 ${showContextPreview ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showContextPreview && (
              <div className="mt-3 rounded-lg border border-zinc-200/80 bg-zinc-50/50 p-3 dark:border-white/5 dark:bg-white/[0.01]">
                {contextLoading && <p className="text-xs text-theme-muted">Загрузка контекста…</p>}
                {contextError && <p className="text-xs text-red-400">{contextError}</p>}
                {contextData && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-theme-faint">
                      Context Preview
                    </p>
                    <div className="space-y-2 border-l-2 border-zinc-300 pl-3 dark:border-white/20">
                      {contextData.layers.length === 0 && (
                        <p className="text-xs text-theme-faint">Нет слоев контекста</p>
                      )}
                      {contextData.layers.map((layer) => {
                        const typeLabel = layer.entityType.charAt(0).toUpperCase() + layer.entityType.slice(1);
                        return (
                          <div key={layer.entityRegistryId} className="text-xs">
                            <span className="font-semibold text-theme-muted">
                              {typeLabel} ({layer.entityName})
                            </span>
                            <div className="mt-0.5 pl-2 text-theme-faint">
                              <p>Rules: {layer.rules.filter(r => !r.includes("[+ еще")).length}</p>
                              <p>Knowledge: {layer.knowledge.length}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between border-t border-dashed border-zinc-200 pt-2 dark:border-white/10">
                      <span className="text-xs text-theme-faint">Estimated tokens:</span>
                      <span className="text-xs font-mono font-semibold text-emerald-500">{contextData.tokenEstimate}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowFullPrompt(!showFullPrompt)}
                      className="mt-2 w-full rounded-md border border-zinc-300 dark:border-white/10 hover:bg-zinc-100 dark:hover:bg-white/[0.05] py-1 text-[10px] font-semibold text-theme-muted transition-all duration-200"
                    >
                      {showFullPrompt ? "Hide full prompt" : "Show full prompt"}
                    </button>

                    {showFullPrompt && (
                      <div className="mt-2 max-h-48 overflow-y-auto rounded border border-zinc-200 dark:border-white/10 bg-zinc-900 p-2 text-[10px] font-mono text-zinc-100">
                        <pre className="whitespace-pre-wrap">{contextData.flattenedPrompt || "[Пустой контекст]"}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-theme-faint">
              Последние ответы
            </p>
            <ul className="max-h-48 space-y-2 overflow-y-auto">
              {recentLogs.length === 0 && (
                <li className="text-xs text-theme-faint">Пока нет ответов</li>
              )}
              {recentLogs.map((log) => (
                <li
                  key={log.id}
                  className="rounded-lg border border-zinc-200 bg-white/60 p-2 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="flex justify-between text-[10px] text-theme-faint">
                    <span>{formatTime(log.created_at)}</span>
                    <span
                      className={
                        log.status === "success" ? "text-emerald-400" : "text-red-400"
                      }
                    >
                      {log.status}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-theme-muted">{log.question}</p>
                  {log.response && (
                    <p className="mt-1 line-clamp-2 text-xs text-theme-faint">{log.response}</p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={onClose}
        className="mt-4 w-full rounded-lg border border-zinc-200 py-2 text-xs text-theme-muted hover:text-theme-secondary dark:border-white/10"
      >
        Закрыть
      </button>
    </div>
  );
}
