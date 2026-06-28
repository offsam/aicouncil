"use client";

import type { InspectorEntityStats } from "@/lib/workspace/load-inspector-data";
import { formatStatTokenCount, type EntityStatMetricId } from "@/lib/workspace/entity-stat-metric";

type EntityBasicStatsGridProps = {
  stats: InspectorEntityStats;
  showScopeCounts?: boolean;
  chamberCount?: number;
  agentCount?: number;
  connectionCount?: number;
  onStatClick?: (metric: EntityStatMetricId) => void;
};

function StatTile({
  label,
  value,
  valueClass = "",
  metric,
  onStatClick,
  testId,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
  metric: EntityStatMetricId;
  onStatClick?: (metric: EntityStatMetricId) => void;
  testId?: string;
}) {
  const content = (
    <>
      <div className="workspace-inspector-stat__label">{label}</div>
      <div className={`workspace-inspector-stat__value ${valueClass}`.trim()}>{value}</div>
    </>
  );

  if (onStatClick) {
    return (
      <button
        type="button"
        data-testid={testId ?? `workspace-inspector-stat-${metric}`}
        title={`Подробнее: ${label}`}
        onClick={() => onStatClick(metric)}
        className="workspace-inspector-stat workspace-inspector-stat--interactive workspace-inspector-stat__btn"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="workspace-inspector-stat" data-testid={testId}>
      {content}
    </div>
  );
}

export function EntityBasicStatsGrid({
  stats,
  showScopeCounts = false,
  chamberCount,
  agentCount,
  connectionCount,
  onStatClick,
}: EntityBasicStatsGridProps) {
  return (
    <div
      data-testid="workspace-inspector-basic-stats"
      className="grid grid-cols-3 gap-2"
    >
      <StatTile
        label="Запросы"
        value={stats.requestCount}
        metric="requests"
        onStatClick={onStatClick}
      />
      <StatTile
        label="Успех"
        value={stats.successCount}
        valueClass="workspace-inspector-stat__value--success"
        metric="success"
        onStatClick={onStatClick}
      />
      <StatTile
        label="Ошибки"
        value={stats.errorCount}
        valueClass="workspace-inspector-stat__value--error"
        metric="errors"
        onStatClick={onStatClick}
      />
      {showScopeCounts && (
        <>
          <StatTile
            label="Отделы"
            value={chamberCount ?? 0}
            metric="chambers"
            onStatClick={onStatClick}
          />
          <StatTile
            label="Агенты"
            value={agentCount ?? 0}
            metric="agents"
            onStatClick={onStatClick}
            testId="workspace-inspector-agents-stat"
          />
          <StatTile
            label="Соединения"
            value={connectionCount ?? 0}
            metric="connections"
            onStatClick={onStatClick}
            testId="workspace-inspector-connections-stat"
          />
          <StatTile
            label="Токены"
            value={formatStatTokenCount(stats.estimatedTokens)}
            valueClass="workspace-inspector-stat__value--accent"
            metric="tokens"
            onStatClick={onStatClick}
          />
        </>
      )}
    </div>
  );
}
