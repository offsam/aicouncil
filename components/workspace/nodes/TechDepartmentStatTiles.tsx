"use client";

import type { TechDepartmentStats } from "@/lib/tech-department-stats";
import {
  resolveVisibleTechCounters,
  type TechCounterTone,
} from "@/lib/workspace/tech-department-counters";

type StatTileProps = {
  value: number;
  label: string;
  tone: TechCounterTone;
  testId: string;
  unknown?: boolean;
};

export function TechDepartmentStatTile({ value, label, tone, testId, unknown }: StatTileProps) {
  return (
    <div className={`workspace-tech-dept-stat workspace-tech-dept-stat--${tone}`}>
      <div className="workspace-tech-dept-stat-glow" aria-hidden />
      <span className="workspace-tech-dept-stat-value" data-testid={testId}>
        {unknown ? "—" : value}
      </span>
      <span className="workspace-tech-dept-stat-label">{label}</span>
    </div>
  );
}

const LIVE_ONLY_COUNTER_IDS = new Set([
  "available",
  "fallback",
  "offline",
  "switches_today",
  "switches_session",
  "providers_ok",
  "providers_fb",
  "providers_down",
  "providers_idle",
  "routing_today",
  "free_agents",
  "api_online",
]);

type TechDepartmentStatTilesProps = {
  stats: TechDepartmentStats;
  visibleCounterIds: string[];
  dense?: boolean;
  className?: string;
  testId?: string;
  /** Tile on canvas: hide live-only metrics that need server/LLM data. */
  structuralOnly?: boolean;
  title?: string;
};

export function TechDepartmentStatTiles({
  stats,
  visibleCounterIds,
  dense,
  className = "",
  testId = "workspace-tech-dept-stats",
  structuralOnly = false,
  title,
}: TechDepartmentStatTilesProps) {
  const rows = resolveVisibleTechCounters(visibleCounterIds, stats).filter(
    ({ def }) => !structuralOnly || !LIVE_ONLY_COUNTER_IDS.has(def.id),
  );
  const useDense = dense ?? rows.length > 6;

  if (rows.length === 0) {
    return (
      <p className="workspace-tech-dept-quiet-hint px-1 text-center">
        Выберите счётчики в меню ☰
      </p>
    );
  }

  return (
    <div
      className={`workspace-tech-dept-stats nodrag nopan${useDense ? " workspace-tech-dept-stats--dense" : ""}${className ? ` ${className}` : ""}`}
      data-testid={testId}
      title={title}
    >
      {rows.map(({ def, value }) => (
        <TechDepartmentStatTile
          key={def.id}
          value={value}
          label={def.shortLabel ?? def.label}
          tone={def.tone}
          testId={`tech-dept-stat-${def.id}`}
        />
      ))}
    </div>
  );
}
