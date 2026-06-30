"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bot, Clock3, ListChecks, Moon, Radar, Sun, MessageSquare } from "lucide-react";
import { CityViewModeToggle } from "@/components/city/CityViewModeToggle";
import { useWorkspaceAppearance } from "./WorkspaceAppearanceContext";
import { useWorkspaceExecutionMode } from "./WorkspaceExecutionModeContext";
import { ExecutionModeSelector } from "./ExecutionModeSelector";
import { useWorkspaceLocale } from "./WorkspaceLocaleContext";
import { useWorkspaceRoute } from "./WorkspaceRouteContext";
import { useWorkspaceSelection } from "./WorkspaceSelectionContext";
import { useWorkspaceChat } from "./WorkspaceChatContext";
import type { WorkspaceLocale } from "@/lib/workspace/i18n/messages";
import { WORKSPACE_MESSAGES } from "@/lib/workspace/i18n/messages";

const ADMIN_LINKS = [
  { href: "/control", label: "Чат (/control)" },
  { href: "/structure", label: "Структура" },
  { href: "/connections", label: "Связи" },
  { href: "/agents", label: "Агенты" },
];

function LocaleToggle() {
  const { locale, setLocale } = useWorkspaceLocale();

  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as WorkspaceLocale)}
      data-testid="workspace-locale-select"
      className="rounded-lg border border-[var(--ws-panel-border)] bg-[var(--ws-panel-bg)] px-2 py-1 text-xs text-[var(--ws-text-secondary)]"
      aria-label="Язык интерфейса"
    >
      {(Object.keys(WORKSPACE_MESSAGES) as WorkspaceLocale[]).map((code) => (
        <option key={code} value={code}>
          {WORKSPACE_MESSAGES[code].localeName}
        </option>
      ))}
    </select>
  );
}

type BarStatus = {
  label: string;
  tone: string;
};

function statusFromState({
  executionPhase,
  activeAgentCount,
  activeTasks,
}: {
  executionPhase: string | null;
  activeAgentCount: number;
  activeTasks: number;
}): BarStatus {
  if (executionPhase === "executing" || activeAgentCount > 0) {
    return { label: "Running", tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" };
  }
  if (executionPhase === "routing" || activeTasks > 0) {
    return { label: "Busy", tone: "border-amber-500/30 bg-amber-500/10 text-amber-100" };
  }
  if (executionPhase === "error") {
    return { label: "Error", tone: "border-red-500/30 bg-red-500/10 text-red-100" };
  }
  return { label: "Idle", tone: "border-white/10 bg-white/5 text-stone-200" };
}

export function WorkspaceTopMissionBar() {
  const { snapshot } = useWorkspaceSelection();
  const { openDock } = useWorkspaceChat();
  const { executionMode, setExecutionMode } = useWorkspaceExecutionMode();
  const { mode, effectiveTheme, setMode } = useWorkspaceAppearance();
  const { executionProgress } = useWorkspaceRoute();
  const [activeAgentIds, setActiveAgentIds] = useState<string[]>([]);
  const [activeTasks, setActiveTasks] = useState(0);
  const [adminOpen, setAdminOpen] = useState(false);
  const adminRef = useRef<HTMLDivElement>(null);
  const [mayorEligibilityState, setMayorEligibilityState] = useState<{
    teamEligible: boolean;
    councilEligible: boolean;
  } | null>(null);

  const mayorEligibility = mayorEligibilityState ?? {
    teamEligible: true,
    councilEligible: true,
  };

  const officeId = snapshot?.officeId ?? null;
  const projectName = snapshot?.cityName ?? "AI Council";
  const status = useMemo(
    () =>
      statusFromState({
        executionPhase: executionProgress?.phase ?? null,
        activeAgentCount: activeAgentIds.length,
        activeTasks,
      }),
    [activeAgentIds.length, activeTasks, executionProgress?.phase],
  );

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (adminRef.current && !adminRef.current.contains(e.target as Node)) {
        setAdminOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/city-hall-orchestrator")
      .then((r) => r.json())
      .then(
        (data: {
          teamEligible?: boolean;
          councilEligible?: boolean;
        }) => {
        if (!cancelled) {
          if (
            typeof data.teamEligible === "boolean" &&
            typeof data.councilEligible === "boolean"
          ) {
            setMayorEligibilityState({
              teamEligible: data.teamEligible,
              councilEligible: data.councilEligible,
            });
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadStats() {
      try {
        const [flowsRes, workflowsRes] = await Promise.all([
          officeId ? fetch(`/api/offices/${officeId}/active-flows`) : Promise.resolve(null),
          fetch("/api/workflows"),
        ]);

        if (cancelled) return;

        if (flowsRes) {
          const flows = (await flowsRes.json()) as { activeAgentIds?: string[] };
          setActiveAgentIds(flows.activeAgentIds ?? []);
        } else {
          setActiveAgentIds([]);
        }

        const workflows = (await workflowsRes.json()) as {
          workflows?: Array<{ status?: string | null }>;
        };
        setActiveTasks(
          (workflows.workflows ?? []).filter((workflow) => workflow.status === "in_progress").length,
        );
      } catch {
        if (!cancelled) {
          setActiveAgentIds([]);
          setActiveTasks(0);
        }
      }
    }

    void loadStats();
    const timer = window.setInterval(loadStats, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [officeId]);

  return (
    <header className="workspace-topbar flex h-14 shrink-0 items-center gap-2.5 border-b border-[var(--ws-panel-border)] bg-[var(--ws-topbar-bg)] px-3.5 text-stone-100 backdrop-blur-md">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em] text-stone-500">
          <span className="inline-flex items-center gap-1 text-amber-200">
            <Bot className="h-3.5 w-3.5" />
            AI Council
          </span>
          <span>Project</span>
        </div>
        <div className="mt-0.5 flex min-w-0 items-center gap-2">
          <h1 className="truncate text-xs font-semibold text-stone-100">{projectName}</h1>
          <span className="truncate text-[11px] text-stone-500">
            {snapshot?.officeId ? `Office ${snapshot.officeId.slice(0, 8)}` : "Workspace"}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <div className="workspace-topbar-pill flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-xs text-stone-300">
            <ListChecks className="h-3.5 w-3.5 text-cyan-300" />
            <span>Active Tasks</span>
          </div>
          <span className="text-sm font-semibold text-stone-100">{activeTasks}</span>
        </div>

        <div className="workspace-topbar-pill flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-xs text-stone-300">
            <Activity className="h-3.5 w-3.5 text-emerald-300" />
            <span>Running Agents</span>
          </div>
          <span className="text-sm font-semibold text-stone-100">{activeAgentIds.length}</span>
        </div>

        <div className="workspace-topbar-pill flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5">
          <div className="flex items-center gap-1.5 text-xs text-stone-300">
            <Radar className="h-3.5 w-3.5 text-violet-300" />
            <span>Mode</span>
          </div>
          <ExecutionModeSelector
            value={executionMode}
            onChange={setExecutionMode}
            teamDisabled={!mayorEligibility.teamEligible}
            councilDisabled={!mayorEligibility.councilEligible}
            teamDisabledReason="Нет cheap-агентов в City Hall"
            councilDisabledReason="Нет mid-агентов в City Hall"
            layout="toolbar"
            compact
          />
        </div>

        <div
          className={`workspace-topbar-status inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${status.tone}`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          {status.label}
        </div>

        <button
          type="button"
          onClick={() => openDock()}
          className="workspace-topbar-action inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-stone-300 hover:bg-white/5 hover:text-stone-100"
          title="Открыть чат"
        >
          <MessageSquare className="h-3.5 w-3.5 text-cyan-300" />
          Чат
        </button>

        <div className="workspace-topbar-mode flex items-center gap-1 rounded-lg border border-white/10 bg-black/20 p-1">
          <button
            type="button"
            onClick={() => setMode("auto")}
            className={`workspace-topbar-mode-btn inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${
              mode === "auto"
                ? "bg-white/10 text-stone-100"
                : "text-stone-400 hover:text-stone-100"
            }`}
            title="Автоматически по времени суток"
          >
            <Clock3 className="h-3.5 w-3.5" />
            Авто
          </button>
          <button
            type="button"
            onClick={() => setMode("day")}
            className={`workspace-topbar-mode-btn inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${
              mode === "day"
                ? "bg-white/10 text-stone-100"
                : "text-stone-400 hover:text-stone-100"
            }`}
            title="Светлый режим"
          >
            <Sun className="h-3.5 w-3.5 text-amber-300" />
            День
          </button>
          <button
            type="button"
            onClick={() => setMode("night")}
            className={`workspace-topbar-mode-btn inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] ${
              mode === "night"
                ? "bg-white/10 text-stone-100"
                : "text-stone-400 hover:text-stone-100"
            }`}
            title="Тёмный режим"
          >
            <Moon className="h-3.5 w-3.5 text-violet-300" />
            Ночь
          </button>
          <span className="sr-only">{effectiveTheme}</span>
        </div>

        <LocaleToggle />
        <CityViewModeToggle current="2d" />

        <div className="relative" ref={adminRef}>
          <button
            type="button"
            onClick={() => setAdminOpen((v) => !v)}
            className="workspace-topbar-action rounded-lg border border-white/10 bg-black/20 px-2.5 py-1.5 text-xs text-stone-300 hover:bg-white/5 hover:text-stone-100"
          >
            Admin ▾
          </button>
          {adminOpen && (
            <div className="workspace-topbar-admin absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded border border-white/10 bg-[#111625] py-1 shadow-lg">
              {ADMIN_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-3 py-2 text-sm text-stone-300 hover:bg-white/5"
                  onClick={() => setAdminOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
