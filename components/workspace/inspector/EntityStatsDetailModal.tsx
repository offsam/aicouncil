"use client";

import type { InspectorConnectionSummary, InspectorLoadedData, RequestLogEntry } from "@/lib/workspace/load-inspector-data";
import {
  ENTITY_STAT_METRIC_LABELS,
  entityStatMetricTitle,
  formatStatTokenCount,
  type EntityStatMetricId,
} from "@/lib/workspace/entity-stat-metric";
import { ChamberResourceCenterModal } from "./ChamberResourceCenterModal";

type EntityStatsDetailModalProps = {
  open: boolean;
  metric: EntityStatMetricId | null;
  entityTitle: string;
  stats: InspectorLoadedData["entityStats"];
  recentLogs: RequestLogEntry[];
  connections: InspectorConnectionSummary[];
  chambersInScope?: InspectorLoadedData["chambersInScope"];
  agentStats?: InspectorLoadedData["agentStats"];
  chamberAgents?: Array<{ id: string; name: string; isLead: boolean }>;
  onClose: () => void;
};

function percent(part: number, total: number): string {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function LogList({ logs, emptyLabel }: { logs: RequestLogEntry[]; emptyLabel: string }) {
  if (logs.length === 0) {
    return <p className="workspace-inspector-hint">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2" data-testid="workspace-entity-stat-detail-logs">
      {logs.map((log) => (
        <li key={log.id} className="workspace-inspector-card text-xs">
          <div className="flex items-center justify-between gap-2 text-[10px] text-[var(--ws-text-faint)]">
            <span>{new Date(log.created_at).toLocaleString()}</span>
            <span
              className={
                log.status === "error"
                  ? "workspace-inspector-stat__value--error"
                  : log.status === "success"
                    ? "workspace-inspector-stat__value--success"
                    : "workspace-inspector-stat__value--accent"
              }
            >
              {log.status}
              {log.latency_ms != null ? ` · ${log.latency_ms} ms` : ""}
            </span>
          </div>
          {log.agent_name && (
            <div className="mt-0.5 text-[10px] text-violet-300">{log.agent_name}</div>
          )}
          <div className="mt-1 font-medium text-[var(--ws-text-main)]">{log.question}</div>
          {log.response && (
            <div className="mt-1 whitespace-pre-wrap text-[var(--ws-text-muted)]">{log.response}</div>
          )}
        </li>
      ))}
    </ul>
  );
}

function ConnectionList({ connections }: { connections: InspectorConnectionSummary[] }) {
  if (connections.length === 0) {
    return <p className="workspace-inspector-hint">К этому объекту не подведено активных кабелей.</p>;
  }

  const incoming = connections.filter((c) => c.direction === "incoming");
  const outgoing = connections.filter((c) => c.direction === "outgoing");

  function renderGroup(title: string, items: InspectorConnectionSummary[]) {
    if (items.length === 0) return null;
    return (
      <div>
        <div className="workspace-inspector-label mb-1.5">{title}</div>
        <ul className="space-y-1.5">
          {items.map((conn) => (
            <li key={conn.id} className="workspace-inspector-card text-xs">
              <div className="font-medium text-[var(--ws-text-main)]">{conn.peerName}</div>
              <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-[var(--ws-text-muted)]">
                {conn.sendTasks && (
                  <span className="workspace-bubble-chip workspace-bubble-chip--accent">send_tasks</span>
                )}
                {conn.readKnowledge && (
                  <span className="workspace-bubble-chip">read_knowledge</span>
                )}
                {!conn.sendTasks && !conn.readKnowledge && (
                  <span className="text-[var(--ws-text-faint)]">без прав передачи</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="workspace-entity-stat-detail-connections">
      {renderGroup("Входящие кабели", incoming)}
      {renderGroup("Исходящие кабели", outgoing)}
    </div>
  );
}

export function EntityStatsDetailModal({
  open,
  metric,
  entityTitle,
  stats,
  recentLogs,
  connections,
  chambersInScope,
  agentStats,
  chamberAgents,
  onClose,
}: EntityStatsDetailModalProps) {
  if (!open || !metric || !stats) return null;

  const successLogs = recentLogs.filter((log) => log.status === "success");
  const errorLogs = recentLogs.filter((log) => log.status === "error");

  let subtitle = "";
  let body: React.ReactNode = null;

  switch (metric) {
    case "requests":
      subtitle = `Всего ${stats.requestCount} запросов · успех ${stats.successCount} · ошибки ${stats.errorCount}`;
      body = (
        <LogList logs={recentLogs} emptyLabel="Запросов по этому объекту пока нет." />
      );
      break;
    case "success":
      subtitle = `${stats.successCount} успешных из ${stats.requestCount} (${percent(stats.successCount, stats.requestCount)})`;
      body = (
        <LogList logs={successLogs} emptyLabel="Успешных запросов пока нет." />
      );
      break;
    case "errors":
      subtitle = `${stats.errorCount} ошибок из ${stats.requestCount} (${percent(stats.errorCount, stats.requestCount)})`;
      body = <LogList logs={errorLogs} emptyLabel="Ошибок пока нет." />;
      break;
    case "chambers":
      subtitle = `${chambersInScope?.length ?? 0} отделов в здании`;
      body =
        chambersInScope && chambersInScope.length > 0 ? (
          <ul className="space-y-1.5" data-testid="workspace-entity-stat-detail-chambers">
            {chambersInScope.map((chamber) => (
              <li key={chamber.chamberId} className="workspace-inspector-card text-xs">
                <div className="font-medium text-[var(--ws-text-main)]">{chamber.name}</div>
                <div className="mt-1 text-[10px] text-[var(--ws-text-muted)]">
                  {chamber.agentCount} аг. · {chamber.requestCount ?? 0} запр. · ≈
                  {formatStatTokenCount(chamber.estimatedTokens ?? 0)} tok
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="workspace-inspector-hint">В здании пока нет отделов.</p>
        );
      break;
    case "agents":
      subtitle = `${agentStats?.length ?? chamberAgents?.length ?? 0} агентов в области`;
      if (agentStats && agentStats.length > 0) {
        body = (
          <ul className="space-y-1.5" data-testid="workspace-entity-stat-detail-agents">
            {agentStats.map((agent) => (
              <li key={agent.agentId} className="workspace-inspector-card text-xs">
                <div className="font-medium text-[var(--ws-text-main)]">{agent.name}</div>
                <div className="mt-1 text-[10px] text-[var(--ws-text-muted)]">
                  {agent.requestCount} запр. · {agent.successCount} успех · {agent.errorCount} ошибок · ≈
                  {formatStatTokenCount(agent.estimatedTokens)} tok
                </div>
              </li>
            ))}
          </ul>
        );
      } else if (chamberAgents && chamberAgents.length > 0) {
        body = (
          <ul className="space-y-1.5" data-testid="workspace-entity-stat-detail-agents">
            {chamberAgents.map((agent) => (
              <li key={agent.id} className="workspace-inspector-card text-xs">
                <div className="font-medium text-[var(--ws-text-main)]">
                  {agent.isLead ? "👑 " : ""}
                  {agent.name}
                </div>
                {agent.isLead && (
                  <div className="mt-0.5 text-[10px] text-[var(--ws-text-muted)]">Руководитель отдела</div>
                )}
              </li>
            ))}
          </ul>
        );
      } else {
        body = <p className="workspace-inspector-hint">Агенты не назначены.</p>;
      }
      break;
    case "tokens":
      subtitle = `≈ ${formatStatTokenCount(stats.estimatedTokens)} токенов по журналу запросов`;
      body =
        agentStats && agentStats.length > 0 ? (
          <ul className="space-y-1.5" data-testid="workspace-entity-stat-detail-tokens">
            {agentStats.map((agent) => (
              <li key={agent.agentId} className="workspace-inspector-card text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--ws-text-main)]">{agent.name}</span>
                  <span className="workspace-inspector-stat__value--accent">
                    ≈{formatStatTokenCount(agent.estimatedTokens)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : chambersInScope && chambersInScope.length > 0 ? (
          <ul className="space-y-1.5" data-testid="workspace-entity-stat-detail-tokens">
            {chambersInScope.map((chamber) => (
              <li key={chamber.chamberId} className="workspace-inspector-card text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-[var(--ws-text-main)]">{chamber.name}</span>
                  <span className="workspace-inspector-stat__value--accent">
                    ≈{formatStatTokenCount(chamber.estimatedTokens ?? 0)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="workspace-inspector-hint">Детализация по токенам пока недоступна.</p>
        );
      break;
    case "connections":
      subtitle = `${connections.length} активных кабелей`;
      body = <ConnectionList connections={connections} />;
      break;
    default:
      subtitle = ENTITY_STAT_METRIC_LABELS[metric];
      body = null;
  }

  return (
    <ChamberResourceCenterModal
      open={open}
      testId="workspace-entity-stat-detail-modal"
      title={entityStatMetricTitle(metric, entityTitle)}
      subtitle={subtitle}
      wide
      onClose={onClose}
    >
      {body}
    </ChamberResourceCenterModal>
  );
}
