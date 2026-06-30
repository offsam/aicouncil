import type { TechDepartmentStats } from "@/lib/tech-department-stats";
import {
  AGENT_COUNT_LABEL_CITY_DEPLOYED,
  AGENT_COUNT_LABEL_CITY_DEPLOYED_EXCLUDING_TECH,
} from "@/lib/agent-count-labels";

export type TechCounterTone =
  | "violet"
  | "ok"
  | "fallback"
  | "switches"
  | "danger"
  | "cyan"
  | "muted";

export type TechDepartmentCounterDef = {
  id: string;
  label: string;
  shortLabel?: string;
  tone: TechCounterTone;
  /** Pick value from live stats payload. */
  pick: (stats: TechDepartmentStats) => number;
};

export const TECH_DEPARTMENT_COUNTER_CATALOG: TechDepartmentCounterDef[] = [
  {
    id: "deployed",
    label: AGENT_COUNT_LABEL_CITY_DEPLOYED,
    shortLabel: "на постах (город)",
    pick: (s) => s.deployedAgents,
    tone: "violet",
  },
  {
    id: "deployed_excluding_tech",
    label: AGENT_COUNT_LABEL_CITY_DEPLOYED_EXCLUDING_TECH,
    shortLabel: "без техотдела",
    pick: (s) => s.deployedAgentsExcludingTechDept,
    tone: "muted",
  },
  {
    id: "available",
    label: "норма",
    pick: (s) => s.availableAgents,
    tone: "ok",
  },
  {
    id: "fallback",
    label: "резерв",
    pick: (s) => s.onFallbackAgents,
    tone: "fallback",
  },
  {
    id: "offline",
    label: "offline",
    pick: (s) => s.unavailableAgents,
    tone: "danger",
  },
  {
    id: "bench",
    label: "в пуле",
    shortLabel: "без поста",
    pick: (s) => s.benchAgents,
    tone: "muted",
  },
  {
    id: "pool",
    label: "агентов",
    shortLabel: "всего",
    pick: (s) => s.totalAgentsInPool,
    tone: "violet",
  },
  {
    id: "switches_today",
    label: "↻ сегодня",
    pick: (s) => s.fallbackSwitchesToday,
    tone: "switches",
  },
  {
    id: "switches_session",
    label: "↻ сессия",
    pick: (s) => s.fallbackSwitchesSession,
    tone: "switches",
  },
  {
    id: "providers_ok",
    label: "LLM ok",
    pick: (s) => s.providersAvailable,
    tone: "ok",
  },
  {
    id: "providers_fb",
    label: "LLM fb",
    pick: (s) => s.providersOnFallback,
    tone: "fallback",
  },
  {
    id: "providers_down",
    label: "LLM down",
    pick: (s) => s.providersUnavailable,
    tone: "danger",
  },
  {
    id: "providers_idle",
    label: "LLM ?",
    shortLabel: "нет данных",
    pick: (s) => s.providersIdle,
    tone: "muted",
  },
  {
    id: "connections",
    label: "кабели",
    pick: (s) => s.activeConnections,
    tone: "cyan",
  },
  {
    id: "buildings",
    label: "здания",
    pick: (s) => s.buildingsCount,
    tone: "cyan",
  },
  {
    id: "chambers",
    label: "отделы",
    pick: (s) => s.chambersCount,
    tone: "cyan",
  },
  {
    id: "routing_today",
    label: "маршруты",
    shortLabel: "сегодня",
    pick: (s) => s.routingDecisionsToday,
    tone: "cyan",
  },
  {
    id: "free_agents",
    label: "free",
    shortLabel: "tier",
    pick: (s) => s.freeTierDeployed,
    tone: "ok",
  },
  {
    id: "api_online",
    label: "ключи",
    shortLabel: "online",
    pick: (s) => s.agentsWithApiKey,
    tone: "ok",
  },
];

export const TECH_COUNTER_IDS = TECH_DEPARTMENT_COUNTER_CATALOG.map((c) => c.id);

/** Default tile: structural inventory (buildings, chambers, cables, agents). */
export const DEFAULT_TECH_DEPARTMENT_VISIBLE_COUNTERS: string[] = [
  "buildings",
  "chambers",
  "connections",
  "pool",
  "deployed",
  "bench",
];

const catalogById = new Map(TECH_DEPARTMENT_COUNTER_CATALOG.map((c) => [c.id, c]));

export function techCounterDef(id: string): TechDepartmentCounterDef | undefined {
  return catalogById.get(id);
}

export function normalizeVisibleTechCounters(raw: unknown): string[] {
  if (!Array.isArray(raw)) return DEFAULT_TECH_DEPARTMENT_VISIBLE_COUNTERS;
  const allowed = new Set(TECH_COUNTER_IDS);
  const picked = raw.filter((id): id is string => typeof id === "string" && allowed.has(id));
  return picked.length > 0 ? picked : DEFAULT_TECH_DEPARTMENT_VISIBLE_COUNTERS;
}

export function resolveVisibleTechCounters(
  ids: string[] | undefined,
  stats: TechDepartmentStats | null,
): Array<{ def: TechDepartmentCounterDef; value: number }> {
  const visible = normalizeVisibleTechCounters(ids);
  if (!stats) return [];
  return visible
    .map((id) => {
      const def = catalogById.get(id);
      if (!def) return null;
      return { def, value: def.pick(stats) };
    })
    .filter((row): row is { def: TechDepartmentCounterDef; value: number } => row != null);
}
