"use client";

import { useState } from "react";
import type { TeamExecutionPayload } from "@/lib/execute-chat-task";
import { deriveAgentPayloadExecutionResult } from "@/lib/workspace/execution-result-status";
import { ExecutionResultBanner } from "./ExecutionResultBanner";

export function TeamAnswersPanel({ team }: { team: TeamExecutionPayload }) {
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const status = deriveAgentPayloadExecutionResult(team, "Team");

  return (
    <div
      data-testid="workspace-team-answers-panel"
      className="mt-2 space-y-2 rounded border border-stone-700 bg-stone-950/60 p-2"
    >
      {status.kind !== "full_success" && (
        <ExecutionResultBanner
          status={status}
          compact
          className="mb-1"
          dataTestId={team.partial ? "workspace-team-partial-badge" : undefined}
        />
      )}

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-amber-400">Team</span>
          {!team.partial && (
            <span className="text-[10px] text-stone-500">
              {team.successCount} экспертов
            </span>
          )}
        </div>
        <p
          data-testid="workspace-team-summary"
          className="text-xs leading-relaxed text-stone-200"
        >
          {team.summary}
        </p>
      </div>

      <div className="space-y-1">
        {team.agents.map((agent) => {
          const open = openSlug === agent.slug;
          return (
            <div
              key={agent.slug}
              data-testid={`workspace-team-agent-${agent.slug}`}
              className="rounded border border-stone-800 bg-stone-900/50"
            >
              <button
                type="button"
                className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs"
                onClick={() => setOpenSlug(open ? null : agent.slug)}
                aria-expanded={open}
              >
                <span className="font-medium text-stone-200">{agent.agentName}</span>
                <span
                  className={
                    agent.status === "success" ? "text-emerald-400" : "text-red-400"
                  }
                >
                  {agent.status === "success" ? "✓" : "✗"}
                </span>
              </button>
              {open && (
                <div className="border-t border-stone-800 px-2 py-1.5 text-xs text-stone-300 whitespace-pre-wrap">
                  {agent.status === "success"
                    ? agent.answer
                    : agent.error ?? "Ошибка вызова"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
