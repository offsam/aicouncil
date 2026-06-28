"use client";

import { motion } from "framer-motion";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

export type AnalyzerPhase = "idle" | "collecting" | "analyzing" | "complete" | "error";

interface AnalyzerHubProps {
  phase: AnalyzerPhase;
  progress: number;
  statusText: string;
}

export function AnalyzerHub({ phase, progress, statusText }: AnalyzerHubProps) {
  const isActive = phase === "collecting" || phase === "analyzing";
  const isComplete = phase === "complete";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn(
        "relative mx-auto w-full max-w-xl rounded-3xl border px-8 py-10 text-center theme-panel-solid",
        "shadow-[0_24px_80px_-24px_rgba(20,184,166,0.25)] dark:shadow-[0_24px_80px_-24px_rgba(20,184,166,0.35)]",
        isActive &&
          "border-teal-500/35 shadow-[0_24px_80px_-20px_rgba(20,184,166,0.4)] dark:shadow-[0_24px_80px_-20px_rgba(20,184,166,0.55)]",
        isComplete && "border-teal-400/30",
      )}
    >
      {isActive && (
        <motion.div
          className="pointer-events-none absolute inset-0 rounded-3xl bg-teal-500/[0.06]"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
      )}

      <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-teal-500/25 bg-teal-500/12">
        <motion.div
          animate={
            isActive
              ? { scale: [1, 1.06, 1], rotate: [0, 2, -2, 0] }
              : { scale: 1, rotate: 0 }
          }
          transition={{ duration: 2, repeat: isActive ? Infinity : 0 }}
        >
          <Brain className="h-10 w-10 text-teal-600 dark:text-teal-300" strokeWidth={1.5} />
        </motion.div>
      </div>

      <p className="relative text-[11px] font-semibold uppercase tracking-[0.28em] text-accent-label">
        Analyzer AI
      </p>
      <p className="relative mt-2 text-sm text-theme-muted">{statusText}</p>

      <div className="relative mx-auto mt-6 max-w-xs">
        <div className="mb-2 flex items-center justify-between text-[11px] text-theme-muted">
          <span>Analysis progress</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/[0.06]">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-teal-600 to-sky-400"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          />
        </div>
      </div>
    </motion.div>
  );
}
