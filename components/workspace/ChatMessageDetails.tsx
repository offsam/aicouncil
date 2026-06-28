"use client";

import { CouncilReportPanel } from "@/components/workspace/CouncilReportPanel";
import { DebateRoundSummaryPanel } from "@/components/workspace/DebateRoundSummaryPanel";
import { ExecutionResultBanner } from "@/components/workspace/ExecutionResultBanner";
import { TeamAnswersPanel } from "@/components/workspace/TeamAnswersPanel";
import type { StoredChatMessage } from "@/lib/workspace/workspace-chat-history";

export function ChatMessageDetails({ message }: { message: StoredChatMessage }) {
  if (message.role !== "assistant") return null;

  const showExecutionStatus =
    message.executionStatus &&
    (message.executionStatus.kind !== "full_success" ||
      message.fast ||
      message.team ||
      message.council);

  const hasDetails =
    message.meta ||
    showExecutionStatus ||
    message.fast ||
    message.team ||
    message.council ||
    message.debate ||
    message.governmentFallback ||
    message.techEscalation;

  if (!hasDetails) return null;

  return (
    <details className="workspace-chat-message__details">
      <summary className="workspace-chat-message__details-summary">
        Подробнее
      </summary>
      <div className="workspace-chat-message__details-body">
        {message.meta && (
          <div className="workspace-chat-message__route">
            <div className="workspace-chat-message__route-label">Маршрут</div>
            <div className="workspace-chat-message__route-path">{message.meta}</div>
          </div>
        )}
        {showExecutionStatus && message.executionStatus && (
          <ExecutionResultBanner status={message.executionStatus} compact />
        )}
        {message.governmentFallback && (
          <div
            className="workspace-chat-message__badge workspace-chat-message__badge--sky"
            data-testid="workspace-government-fallback-badge"
          >
            Ответ подготовлен за счёт государства
          </div>
        )}
        {message.techEscalation && (
          <div
            className="workspace-chat-message__badge workspace-chat-message__badge--violet"
            data-testid="workspace-tech-escalation-badge"
          >
            Сообщение от технического отдела
          </div>
        )}
        {message.debate && (
          <DebateRoundSummaryPanel
            authorName={message.debate.authorName}
            reviewerName={message.debate.reviewerName}
            closedReason={message.debate.closedReason}
            rounds={message.debate.rounds}
          />
        )}
        {message.fast && <TeamAnswersPanel team={message.fast} />}
        {message.team && <TeamAnswersPanel team={message.team} />}
        {message.council && <CouncilReportPanel council={message.council} />}
      </div>
    </details>
  );
}
