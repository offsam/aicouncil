"use client";

type NodeHeaderMetricsProps = {
  variant: "building" | "chamber";
  side: "left" | "right";
  chamberCount?: number;
  agentCount?: number;
  active?: boolean;
};

export function NodeHeaderMetrics({
  variant,
  side,
  chamberCount = 0,
  agentCount = 0,
  active = false,
}: NodeHeaderMetricsProps) {
  const showBuildingCounts = variant === "building" && side === "left";
  const showChamberAgents = variant === "chamber" && side === "left" && agentCount > 0;
  const showLive = side === "right" && active;

  if (!showBuildingCounts && !showChamberAgents && !showLive) {
    return null;
  }

  return (
    <div
      className={`workspace-neon-title-metrics workspace-neon-title-metrics--${side} nodrag nopan`}
      data-testid={`workspace-header-metrics-${variant}-${side}`}
      aria-label={
        side === "left"
          ? variant === "building"
            ? `${chamberCount} отделов, ${agentCount} агентов`
            : `${agentCount} агентов`
          : "live"
      }
    >
      {showLive && (
        <span className="workspace-neon-title-metric workspace-neon-title-metric--live">
          <span className="workspace-neon-title-metric-dot" aria-hidden />
          live
        </span>
      )}
      {showBuildingCounts && (
        <>
          <span className="workspace-neon-title-metric">
            <span className="workspace-neon-title-metric-value">{chamberCount}</span>
            <span className="workspace-neon-title-metric-label">отд</span>
          </span>
          <span className="workspace-neon-title-metric">
            <span className="workspace-neon-title-metric-value">{agentCount}</span>
            <span className="workspace-neon-title-metric-label">аг</span>
          </span>
        </>
      )}
      {showChamberAgents && (
        <span className="workspace-neon-title-metric">
          <span className="workspace-neon-title-metric-value">{agentCount}</span>
          <span className="workspace-neon-title-metric-label">аг</span>
        </span>
      )}
    </div>
  );
}
