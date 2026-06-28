"use client";

import { motion } from "framer-motion";
import type { AgentDefinition } from "@/lib/agents";
import { formatTokens, type TokenUsage } from "@/lib/tokens";
import { cn } from "@/lib/utils";
import { AgentLogo } from "./AgentLogo";
import { Badge } from "@/components/ui/badge";

export type ModelCardStatus =
  | "standby"
  | "online"
  | "processing"
  | "complete"
  | "error";

interface ModelCardProps {
  agent: AgentDefinition;
  status: ModelCardStatus;
  latencyMs?: number;
  tokens?: TokenUsage;
  onClick?: () => void;
}

function statusBadge(status: ModelCardStatus, enabled: boolean) {
  if (!enabled) return { label: "Standby", variant: "muted" as const };
  switch (status) {
    case "processing":
      return { label: "Processing", variant: "warning" as const };
    case "complete":
      return { label: "Online", variant: "success" as const };
    case "error":
      return { label: "Error", variant: "warning" as const };
    default:
      return { label: "Online", variant: "success" as const };
  }
}

export function ModelCard({
  agent,
  status,
  latencyMs,
  tokens,
  onClick,
}: ModelCardProps) {
  const badge = statusBadge(status, agent.enabled);
  const isActive = status === "processing";
  const isComplete = status === "complete";

  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={agent.enabled ? { y: -2 } : undefined}
      onClick={onClick}
      disabled={!agent.enabled && status === "standby"}
      className={cn(
        "group relative w-full rounded-2xl border p-4 text-left transition-colors theme-panel theme-border-hover theme-surface-hover",
        !agent.enabled && "cursor-default opacity-45",
        isActive &&
          "border-teal-500/40 bg-teal-500/[0.1] shadow-[0_0_40px_-12px_rgba(20,184,166,0.4)] dark:bg-teal-500/[0.08] dark:shadow-[0_0_40px_-12px_rgba(20,184,166,0.55)]",
        isComplete && "border-emerald-500/30 dark:border-emerald-500/20",
      )}
      style={
        isActive
          ? ({ boxShadow: `0 0 48px -16px ${agent.color}88` } as React.CSSProperties)
          : undefined
      }
    >
      {isActive && (
        <motion.span
          className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-teal-400/35"
          animate={{ opacity: [0.35, 0.85, 0.35] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <div className="relative flex items-start justify-between gap-3">
        <AgentLogo agent={agent} />
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      <div className="relative mt-4 space-y-1">
        <p className="text-sm font-semibold text-theme-primary">{agent.name}</p>
        <p className="text-xs text-theme-muted">
          {latencyMs != null ? `${latencyMs} ms` : agent.enabled ? "— ms" : "Not connected"}
        </p>
        {tokens && (
          <p className="text-[10px] text-theme-faint">
            {formatTokens(tokens.total)} tokens
          </p>
        )}
      </div>

      {isActive && (
        <div className="relative mt-3 flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              className="h-1 w-1 rounded-full bg-teal-400"
              animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.2, 0.8] }}
              transition={{
                duration: 1,
                repeat: Infinity,
                delay: i * 0.15,
              }}
            />
          ))}
          <span className="text-[10px] text-teal-600 dark:text-teal-300/90">Analyzing</span>
        </div>
      )}
    </motion.button>
  );
}
