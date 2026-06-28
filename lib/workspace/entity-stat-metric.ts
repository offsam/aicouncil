export type EntityStatMetricId =
  | "requests"
  | "success"
  | "errors"
  | "chambers"
  | "agents"
  | "tokens"
  | "connections";

export const ENTITY_STAT_METRIC_LABELS: Record<EntityStatMetricId, string> = {
  requests: "Запросы",
  success: "Успех",
  errors: "Ошибки",
  chambers: "Отделы",
  agents: "Агенты",
  tokens: "Токены",
  connections: "Соединения",
};

export function entityStatMetricTitle(metric: EntityStatMetricId, entityTitle: string): string {
  return `${ENTITY_STAT_METRIC_LABELS[metric]} · ${entityTitle}`;
}

export function formatStatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
