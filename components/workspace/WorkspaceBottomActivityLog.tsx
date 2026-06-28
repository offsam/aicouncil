"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Sparkles } from "lucide-react";

type ActivityRow = {
  id: string;
  task_text: string;
  chosen_target_name: string | null;
  delegated_building_name: string | null;
  delegated_chamber_name: string | null;
  delegated_agent_name: string | null;
  method: string | null;
  agent_count: number | null;
  outcome: string | null;
  routing_action: string | null;
  routing_matched_by: string | null;
  routing_confidence: number | null;
  summary_applied: boolean | null;
  created_at: string;
};

const ACTIVITY_COLLAPSED_STORAGE_KEY = "workspace-activity-collapsed";

function readActivityCollapsedPreference(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ACTIVITY_COLLAPSED_STORAGE_KEY) === "1";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return "now";
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  return `${hr}h`;
}

export function WorkspaceBottomActivityLog() {
  const [logs, setLogs] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    setCollapsedState(readActivityCollapsedPreference());
  }, []);

  const setCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVITY_COLLAPSED_STORAGE_KEY, value ? "1" : "0");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/workspace/activity-feed");
        const data = (await res.json()) as { logs?: ActivityRow[]; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed to load activity feed");
        if (!cancelled) setLogs(data.logs ?? []);
      } catch {
        if (!cancelled) setLogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(load, 10000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const visibleLogs = useMemo(() => logs.slice(0, 4), [logs]);

  if (collapsed) {
    return (
      <div className="workspace-bottom-activity-shell workspace-bottom-activity-shell--collapsed shrink-0">
        <button
          type="button"
          className="workspace-panel-tab workspace-panel-tab--bottom"
          data-testid="workspace-activity-log-tab"
          aria-label="Открыть Live Activity"
          title="Открыть Live Activity"
          onClick={() => setCollapsed(false)}
        >
          <span className="workspace-panel-tab__chevron" aria-hidden>
            ▲
          </span>
          <span className="workspace-panel-tab__label">Live Activity</span>
          {!loading && visibleLogs.length > 0 ? (
            <span className="workspace-panel-tab__badge">{visibleLogs.length}</span>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <section
      className="workspace-bottom-activity-log shrink-0 border-t border-[var(--ws-panel-border)] bg-[var(--ws-activity-bg)] px-3 py-2.5 text-stone-100"
      data-testid="workspace-activity-log"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-stone-500">
          <Activity className="h-3.5 w-3.5 text-cyan-300" />
          Live Activity
        </div>
        <div className="flex items-center gap-2">
          <div className="text-[10px] text-stone-500">
            {loading ? "Updating…" : `${visibleLogs.length} recent entries`}
          </div>
          <button
            type="button"
            className="workspace-panel-collapse-btn"
            data-testid="workspace-activity-log-close"
            aria-label="Закрыть панель"
            title="Свернуть Live Activity"
            onClick={() => setCollapsed(true)}
          >
            ×
          </button>
        </div>
      </div>

      {visibleLogs.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-stone-500">
          Waiting for routing activity.
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {visibleLogs.map((log) => (
            <article
              key={log.id}
              className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-2 text-[10px] text-stone-500">
                <span>{timeAgo(log.created_at)} ago</span>
                <span className="rounded border border-white/10 px-1.5 py-0.5 uppercase text-stone-300">
                  {log.outcome ?? "unrated"}
                </span>
              </div>
              <div className="mt-1 line-clamp-2 text-sm font-medium text-stone-100">
                {log.task_text}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-stone-400">
                {log.chosen_target_name && (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-stone-200">
                    {log.chosen_target_name}
                  </span>
                )}
                {log.method && <span>{log.method}</span>}
                {log.agent_count != null && <span>{log.agent_count} agents</span>}
                {log.routing_confidence != null && (
                  <span>{Math.round(log.routing_confidence * 100)}%</span>
                )}
                {log.summary_applied && (
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <Sparkles className="h-3 w-3" />
                    summary
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-stone-500">
                <span className="truncate">
                  {log.routing_action ?? log.routing_matched_by ?? "route"}
                </span>
                <ArrowRight className="h-3 w-3 shrink-0" />
                <span className="truncate text-stone-300">
                  {log.delegated_building_name || log.delegated_chamber_name || log.delegated_agent_name || "—"}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
