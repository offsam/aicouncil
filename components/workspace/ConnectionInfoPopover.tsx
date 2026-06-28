"use client";

import {
  formatPermissionLines,
  type ConnectionEdgeData,
} from "@/lib/workspace/workspace-connections";
import type { ConnectionPopoverData } from "@/lib/workspace/load-inspector-data";
import { useWorkspaceLocale } from "@/components/workspace/WorkspaceLocaleContext";

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(ms: number, locale: string): string {
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) {
    return locale === "ru" ? `${days} д ${hours} ч` : `${days}d ${hours}h`;
  }
  const minutes = Math.floor(ms / (1000 * 60));
  if (hours > 0) {
    return locale === "ru" ? `${hours} ч ${minutes % 60} мин` : `${hours}h ${minutes % 60}m`;
  }
  return locale === "ru" ? `${minutes} мин` : `${minutes}m`;
}

export function ConnectionInfoPopover({
  data,
  edgeData,
  loading,
  error,
  pinned,
  onClose,
  onDelete,
  deleting,
}: {
  data: ConnectionPopoverData | null;
  edgeData: ConnectionEdgeData;
  loading: boolean;
  error: string | null;
  pinned: boolean;
  onClose: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const { t, locale } = useWorkspaceLocale();
  const detail = data?.connectionDetail;
  const stats = data?.entityStats;
  const perms = detail?.permissions ?? edgeData.permissions;

  return (
    <div
      className={`workspace-connection-popover nodrag nopan ${
        pinned ? "workspace-connection-popover--pinned" : ""
      }`}
      data-testid="workspace-connection-info-popover"
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="workspace-agent-popover-header">
        <div className="min-w-0 flex-1">
          <div className="workspace-agent-popover-kind">{t.connectionPopoverKind}</div>
          <div className="truncate text-sm font-semibold text-sky-100">
            {detail?.sourceLabel ?? edgeData.sourceName} →{" "}
            {detail?.targetLabel ?? edgeData.targetName}
          </div>
        </div>
        {pinned && (
          <button
            type="button"
            className="workspace-agent-popover-close"
            aria-label={t.dismiss}
            data-testid="workspace-connection-popover-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            ×
          </button>
        )}
      </div>

      <dl className="workspace-agent-popover-fields">
        <div>
          <dt>{t.connectionSource}</dt>
          <dd className="truncate">{detail?.sourceLabel ?? edgeData.sourceName}</dd>
        </div>
        <div>
          <dt>{t.connectionTarget}</dt>
          <dd className="truncate">{detail?.targetLabel ?? edgeData.targetName}</dd>
        </div>
        {detail && (
          <>
            <div>
              <dt>{t.connectionStatus}</dt>
              <dd className={detail.is_active ? "text-emerald-400" : "text-stone-500"}>
                {detail.is_active ? t.connectionActive : t.connectionInactive}
              </dd>
            </div>
            <div>
              <dt>{t.connectionPriority}</dt>
              <dd>{detail.priority}</dd>
            </div>
          </>
        )}
      </dl>

      {detail?.created_at && (
        <div className="workspace-connection-popover-meta">
          <div>
            <span className="workspace-agent-popover-stat-label">{t.connectionCreated}</span>
            <span className="text-[10px] text-stone-300">
              {new Date(detail.created_at).toLocaleString()}
            </span>
          </div>
          {data?.activeDurationMs != null && (
            <div>
              <span className="workspace-agent-popover-stat-label">{t.connectionActiveFor}</span>
              <span className="text-[10px] text-cyan-300">
                {formatDuration(data.activeDurationMs, locale)}
              </span>
            </div>
          )}
        </div>
      )}

      {perms && (
        <div className="workspace-connection-popover-perms">
          <div className="workspace-agent-popover-recent-label">{t.connectionPermissions}</div>
          {formatPermissionLines(perms).map((line) => (
            <div key={line} className="text-[10px] text-stone-300">
              {line}
            </div>
          ))}
        </div>
      )}

      {loading && <p className="workspace-agent-popover-muted">{t.loading}</p>}
      {error && (
        <p className="text-[10px] text-red-400" role="alert">
          {error}
        </p>
      )}

      {stats && !loading && (
        <div className="workspace-agent-popover-stats">
          <div>
            <span className="workspace-agent-popover-stat-label">{t.connectionStatRequests}</span>
            <span className="workspace-agent-popover-stat-value">{stats.requestCount}</span>
          </div>
          <div>
            <span className="workspace-agent-popover-stat-label">{t.connectionStatTokens}</span>
            <span className="workspace-agent-popover-stat-value text-amber-300">
              {formatTokenCount(stats.estimatedTokens)}
            </span>
          </div>
          <div>
            <span className="workspace-agent-popover-stat-label">{t.connectionStatSuccess}</span>
            <span className="workspace-agent-popover-stat-value text-emerald-400">
              {stats.successCount}
            </span>
          </div>
          <div>
            <span className="workspace-agent-popover-stat-label">{t.connectionStatErrors}</span>
            <span className="workspace-agent-popover-stat-value text-red-400">
              {stats.errorCount}
            </span>
          </div>
        </div>
      )}

      {data?.statsNote && !loading && (
        <p className="mt-1 text-[9px] text-stone-500">{data.statsNote}</p>
      )}

      {pinned && (
        <button
          type="button"
          className="workspace-connection-popover-delete"
          data-testid="workspace-connection-popover-delete"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          {deleting ? t.loading : t.connectionDelete}
        </button>
      )}
    </div>
  );
}
