"use client";

import { motion } from "framer-motion";
import { AGENTS, type AgentId } from "@/lib/agents";
import { usePrefersDark } from "@/lib/use-prefers-dark";
import type { ModelCardStatus } from "./ModelCard";

interface DataFlowCanvasProps {
  modelStatus: Partial<Record<AgentId, ModelCardStatus>>;
  flowingIds: AgentId[];
}

function pathForIndex(index: number, total: number): string {
  const w = 1000;
  const h = 180;
  const margin = 60;
  const span = w - margin * 2;
  const x1 = margin + (span * index) / Math.max(total - 1, 1);
  const y1 = 12;
  const x2 = w / 2;
  const y2 = h - 8;
  const cx = (x1 + x2) / 2;
  const cy = h * 0.55;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

export function DataFlowCanvas({ modelStatus, flowingIds }: DataFlowCanvasProps) {
  const isDark = usePrefersDark();
  const paths = AGENTS.map((_, i) => pathForIndex(i, AGENTS.length));
  const idleStroke = isDark ? "rgba(255,255,255,0.06)" : "rgba(24,24,27,0.1)";

  return (
    <div className="relative -mt-2 h-[140px] w-full md:h-[180px]">
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 1000 180"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          {AGENTS.map((agent) => (
            <linearGradient
              key={agent.id}
              id={`flow-${agent.id}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor={agent.color} stopOpacity="0.85" />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.7" />
            </linearGradient>
          ))}
        </defs>

        {AGENTS.map((agent, i) => {
          const status = modelStatus[agent.id];
          const isLit =
            status === "processing" ||
            status === "complete" ||
            flowingIds.includes(agent.id);
          const isFlowing = flowingIds.includes(agent.id);

          return (
            <g key={agent.id}>
              <path
                d={paths[i]}
                fill="none"
                stroke={idleStroke}
                strokeWidth="3"
                strokeLinecap="round"
              />
              <motion.path
                d={paths[i]}
                fill="none"
                stroke={`url(#flow-${agent.id})`}
                strokeWidth="2.5"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{
                  pathLength: isLit ? 1 : 0.15,
                  opacity: isLit ? 0.85 : 0.08,
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
              {isFlowing && (
                <circle r="4" fill={agent.color}>
                  <animateMotion
                    dur="0.9s"
                    repeatCount="1"
                    path={paths[i]}
                    fill="freeze"
                  />
                </circle>
              )}
              {isLit && (
                <motion.circle
                  r="3"
                  fill={isDark ? "#7ec8d4" : "#0f766e"}
                  opacity="0.9"
                  animate={{ offsetDistance: ["0%", "100%"] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    ease: "linear",
                  }}
                  style={{
                    offsetPath: `path('${paths[i]}')`,
                  }}
                />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
