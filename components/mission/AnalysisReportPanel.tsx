"use client";

import { motion } from "framer-motion";
import type { AnalysisReport } from "@/lib/api-types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckCircle2,
  GitCompare,
  Sparkles,
  Trophy,
} from "lucide-react";

const BLOCKS = [
  {
    key: "consensus" as const,
    title: "Consensus",
    subtitle: "What models agree on",
    icon: CheckCircle2,
    accent: "from-emerald-500/10 to-transparent",
  },
  {
    key: "differences" as const,
    title: "Differences",
    subtitle: "Where opinions diverge",
    icon: GitCompare,
    accent: "from-amber-500/10 to-transparent",
  },
  {
    key: "bestAnswer" as const,
    title: "Best Answer",
    subtitle: "Strongest model response",
    icon: Trophy,
    accent: "from-teal-500/12 to-transparent",
  },
  {
    key: "finalVerdict" as const,
    title: "Final Verdict",
    subtitle: "Analyzer conclusion",
    icon: Sparkles,
    accent: "from-sky-500/12 to-transparent",
  },
];

interface AnalysisReportPanelProps {
  report: AnalysisReport;
  tokenLine?: string;
}

export function AnalysisReportPanel({
  report,
  tokenLine,
}: AnalysisReportPanelProps) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-6xl space-y-4"
    >
      <div className="flex items-end justify-between gap-4 px-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-accent-label-muted">
            Mission Report
          </p>
          <h2 className="mt-1 text-xl font-semibold text-theme-primary md:text-2xl">
            Verified multi-model analysis
          </h2>
        </div>
        {report.bestModel && (
          <p className="hidden text-xs text-theme-muted md:block">
            Top model: <span className="text-theme-secondary">{report.bestModel}</span>
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {BLOCKS.map((block, index) => {
          const Icon = block.icon;
          const content = report[block.key];

          return (
            <motion.div
              key={block.key}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 * index, duration: 0.45 }}
            >
              <Card className="h-full overflow-hidden border-zinc-200/80 bg-gradient-to-br from-white/80 to-transparent transition-colors hover:border-zinc-300 dark:border-white/[0.08] dark:from-white/[0.04] dark:hover:border-white/[0.12]">
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle>{block.title}</CardTitle>
                    <p className="text-xs text-theme-muted">{block.subtitle}</p>
                  </div>
                  <div
                    className={`rounded-xl bg-gradient-to-br ${block.accent} p-2 ring-1 ring-zinc-200 dark:ring-white/10`}
                  >
                    <Icon className="h-4 w-4 text-theme-secondary" strokeWidth={1.75} />
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-theme-secondary">
                    {content}
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {tokenLine && (
        <p className="px-1 text-center text-xs text-theme-faint">{tokenLine}</p>
      )}
    </motion.section>
  );
}
