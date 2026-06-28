"use client";

import { memo, type CSSProperties } from "react";
import {
  getAgentIconOption,
  resolveAgentIconId,
  type AgentIconId,
  type AgentIconOption,
} from "@/components/workspace/agent-icon-catalog";
import { CostTierBadge } from "@/components/workspace/CostTierBadge";
import type { SimpleIcon } from "simple-icons";

type AgentRobotAvatarProps = {
  label: string;
  provider: string;
  modelId?: string | null;
  agentId: string;
  tone: string;
  iconId?: AgentIconId | null;
  sizePx?: number | null;
  costTier?: string | null;
  showCostTier?: boolean;
};

function renderIcon(option: AgentIconOption, className: string) {
  if (option.kind === "simple") {
    const icon = option.icon as SimpleIcon;
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        focusable="false"
        aria-hidden="true"
      >
        <path d={icon.path} fill="currentColor" />
      </svg>
    );
  }
  const Icon = option.icon;
  return <Icon className={className} strokeWidth={2.1} />;
}

function AgentRobotAvatarInner({
  label,
  provider,
  modelId = null,
  agentId,
  tone,
  iconId = null,
  sizePx = null,
  costTier = null,
  showCostTier = false,
}: AgentRobotAvatarProps) {
  const option = getAgentIconOption(resolveAgentIconId(iconId, provider, modelId));
  const color = option.kind === "simple" ? option.color ?? "currentColor" : "var(--ws-text-secondary)";

  return (
    <div
      className={`workspace-agent-robot workspace-agent-robot--${tone}`}
      aria-hidden="true"
      title={label}
      style={
        typeof sizePx === "number" && Number.isFinite(sizePx)
          ? ({
              color,
              "--agent-icon-size": `${sizePx}px`,
            } as CSSProperties)
          : { color }
      }
    >
      {renderIcon(option, "workspace-agent-robot__glyph workspace-agent-robot__glyph--brand")}
      {showCostTier && costTier != null && costTier !== "" && (
        <CostTierBadge
          tier={costTier}
          variant="compact"
          className="workspace-agent-robot__tier-badge nodrag nopan"
        />
      )}
    </div>
  );
}

export const AgentRobotAvatar = memo(AgentRobotAvatarInner);
