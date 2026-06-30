"use client";

import { useState } from "react";
import type { AnalysisReport } from "@/lib/api-types";
import type { CouncilExecutionPayload } from "@/lib/execute-chat-task";
import { deriveAgentPayloadExecutionResult } from "@/lib/workspace/execution-result-status";
import { ExecutionResultBanner } from "./ExecutionResultBanner";

const BLOCKS: Array<{ key: keyof AnalysisReport; title: string }> = [
  { key: "consensus", title: "Consensus" },
  { key: "differences", title: "Differences" },
  { key: "bestAnswer", title: "Best Answer" },
  { key: "finalVerdict", title: "Final Verdict" },
];

export function CouncilReportPanel({ council }: { council: CouncilExecutionPayload }) {
  const [openKey, setOpenKey] = useState<keyof AnalysisReport>("finalVerdict");
  const seconds = Math.round(council.wallTimeMs / 1000);
  const status = deriveAgentPayloadExecutionResult(council, "Council");

  return (
    <div
      data-testid="workspace-council-report-panel"
      className="mt-2 space-y-2 rounded border border-amber-800/50 bg-stone-950/70 p-2"
    >
      {status.kind !== "full_success" && (
        <ExecutionResultBanner
          status={status}
          compact
          className="mb-1"
          dataTestId={council.partial ? "workspace-council-partial-badge" : undefined}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-amber-300">Council Report</span>
        <span className="rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-200">
          $$$
        </span>
        {!council.partial && (
          <span className="text-[10px] text-stone-500">{council.successCount} экспертов</span>
        )}
        <span className="text-[10px] text-stone-500">~{seconds} сек</span>
      </div>

      <div className="max-h-[420px] space-y-1 overflow-y-auto">
        {!council.report ? (
          <p
            data-testid="workspace-council-single-fallback"
            className="text-xs leading-relaxed text-stone-400"
          >
            Полный council-отчёт не сформирован — ответ одного эксперта показан в чате.
          </p>
        ) : (
          BLOCKS.map((block) => {
            const open = openKey === block.key;
            const content = council.report![block.key];
            if (!content || block.key === "bestModel") return null;
            return (
              <div
                key={block.key}
                data-testid={`workspace-council-block-${block.key}`}
                className="rounded border border-stone-800 bg-stone-900/50"
              >
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs font-medium text-amber-200"
                  onClick={() => setOpenKey(open ? "finalVerdict" : block.key)}
                  aria-expanded={open}
                >
                  {block.title}
                  <span className="text-stone-500">{open ? "▾" : "▸"}</span>
                </button>
                {open && (
                  <div className="border-t border-stone-800 px-2 py-1.5 text-xs leading-relaxed text-stone-300 whitespace-pre-wrap">
                    {content}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
