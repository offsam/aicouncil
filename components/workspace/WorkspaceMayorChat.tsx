"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExecuteChatTaskResult } from "@/lib/execute-chat-task";
import { EXECUTION_MODE_OPTIONS, type ExecutionMode } from "@/lib/execution-mode";
import { deriveExecutionResultFromChatTask } from "@/lib/workspace/execution-result-status";
import { formatRoutePath, formatWorkflowSidebar } from "@/lib/workspace/resolve-route-highlight";
import { ChatMessageDetails } from "./ChatMessageDetails";
import { TechStructureConfirmationGate } from "./TechStructureConfirmationGate";
import type { TechStructurePlan } from "@/lib/tech-department/structure-types";
import type { ChatAttachment } from "@/lib/chat/chat-attachment-types";
import { uploadChatAttachmentsToLibrary } from "@/lib/chat/upload-chat-attachments";
import { KNOWLEDGE_FILE_ACCEPT } from "@/lib/knowledge/prepare-knowledge-file";
import { classifyKnowledgeFile } from "@/lib/knowledge/knowledge-media-types";
import { ChatMessageAttachments } from "./ChatMessageAttachments";
import { DebateTierPicker } from "./DebateTierPicker";
import { useWorkspaceExecutionMode } from "./WorkspaceExecutionModeContext";
import { useWorkspaceRoute } from "./WorkspaceRouteContext";
import { useWorkspaceSelection } from "./WorkspaceSelectionContext";
import { useWorkspaceChat } from "./WorkspaceChatContext";
import {
  chatTargetHint,
  DEFAULT_MAYOR_CHAT_TARGET,
  type WorkspaceChatTarget,
  workspaceChatTargetKey,
} from "@/lib/workspace/workspace-chat-target";
import {
  loadWorkspaceChatHistory,
  saveWorkspaceChatHistory,
  toStoredChatMessage,
  type StoredChatMessage,
} from "@/lib/workspace/workspace-chat-history";
import { getOrCreateWorkspaceMayorConversationId } from "@/lib/workspace/workspace-mayor-conversation-id";
import type { CostTier } from "@/lib/cost-tier";
import type { AgentDebateResult, DebateTierMode } from "@/lib/debate/types";
import type { CityHallDebateChambersByTier } from "@/lib/workspace/resolve-city-hall-council-chamber";

type CityHallOrchestrator = {
  chamberRegistryId: string;
  chamberName: string;
  agentId: string;
  agentName: string;
};

type ChatMessage = StoredChatMessage;

const CHAT_INPUT_MIN_PX = 40;
const CHAT_INPUT_MAX_PX = 160;

function resolveChatRosterEntityId(target: WorkspaceChatTarget): string | null {
  if (target.kind === "chamber") return target.registryId;
  if (target.kind === "agent") return target.chamberRegistryId;
  return null;
}

function buildChatRequestPayload(
  text: string,
  mode: ExecutionMode,
  target: WorkspaceChatTarget,
  orchestrator: CityHallOrchestrator | null,
  smartEnabled?: boolean,
  attachmentIds?: string[],
  mayorConversationId?: string,
) {
  const mayorMemory =
    target.kind === "mayor" && mayorConversationId
      ? { conversationId: mayorConversationId }
      : {};

  if (target.kind === "agent") {
    return {
      taskText: text,
      executionMode: "fast" as ExecutionMode,
      targetAgentId: target.agentId,
      directTargetEntityId: target.chamberRegistryId,
      sourceEntityId: target.chamberRegistryId,
      turbo: smartEnabled,
      attachmentIds,
    };
  }
  if (target.kind === "chamber") {
    const isManagerEntry = target.isMainChamber === true && mode === "fast";
    return {
      taskText: text,
      executionMode: mode,
      sourceEntityId: target.registryId,
      ...(isManagerEntry ? {} : { directTargetEntityId: target.registryId }),
      turbo: smartEnabled,
      attachmentIds,
    };
  }
  const mayorChamberId = orchestrator?.chamberRegistryId;
  if (orchestrator && mode === "fast") {
    return {
      taskText: text,
      executionMode: "fast" as ExecutionMode,
      targetAgentId: orchestrator.agentId,
      directTargetEntityId: orchestrator.chamberRegistryId,
      ...(mayorChamberId ? { sourceEntityId: mayorChamberId } : {}),
      turbo: smartEnabled,
      attachmentIds,
      ...mayorMemory,
    };
  }
  return {
    taskText: text,
    executionMode: mode,
    ...(mayorChamberId ? { sourceEntityId: mayorChamberId } : {}),
    turbo: smartEnabled,
    attachmentIds,
    ...mayorMemory,
  };
}

function formatRoutingMeta(result: ExecuteChatTaskResult): string | undefined {
  if (result.mode === "workflow") {
    const names = result.steps
      .map((s) => s.target_chamber?.name || `шаг ${s.step_order}`)
      .join(" → ");
    return `Workflow (${result.status}): ${names}`;
  }
  if (result.mode === "single" && result.targetName) {
    const parts = [result.targetName];
    if (result.agentName) parts.push(result.agentName);
    if (result.executionMode === "team") parts.push("Team");
    if (result.executionMode === "council") parts.push("Council");
    if (result.executionMode === "turbo") parts.push("Turbo");
    return parts.join(" → ");
  }
  const t = result.routing.targets[0];
  const parts = [
    result.executionMode ? `mode: ${result.executionMode}` : null,
    result.targetName || t?.entityRegistryId,
    result.agentName ? `агент: ${result.agentName}` : null,
    result.routing.method,
    result.routing.agentCount ? `agents: ${result.routing.agentCount}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function buildAssistantMeta(
  data: ExecuteChatTaskResult,
  routePath?: string,
): string | undefined {
  const routingMeta = formatRoutingMeta(data);
  let meta = routePath ?? routingMeta;
  if (
    data.mode === "single" &&
    (data.executionMode === "team" || data.executionMode === "council") &&
    routePath &&
    routingMeta
  ) {
    const modeParts = routingMeta
      .split(" · ")
      .filter((p) => p.startsWith("mode:") || p.startsWith("agents:"));
    if (modeParts.length) meta = `${modeParts.join(" · ")} · ${routePath}`;
  }
  return meta ?? routingMeta;
}

function formatMessageTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function userMessage(text: string, attachments?: ChatAttachment[]): ChatMessage {
  return toStoredChatMessage({ id: `u-${Date.now()}`, role: "user", text, attachments });
}

function pendingFilesToAttachments(files: File[]): ChatAttachment[] {
  return files.map((file, index) => {
    const { kind } = classifyKnowledgeFile(file);
    return {
      id: `pending-${Date.now()}-${index}`,
      title: file.name,
      mimeType: file.type || null,
      kind,
      fileUrl: null,
      contentPreview: null,
    };
  });
}

function assistantMessage(
  partial: Omit<ChatMessage, "role" | "createdAt"> & { role?: "assistant" },
): ChatMessage {
  return toStoredChatMessage({ role: "assistant", ...partial });
}

export function WorkspaceMayorChat() {
  const { dockOpen, expanded, target, openDock, closeDock, toggleExpanded, setExpanded } =
    useWorkspaceChat();
  const { executionMode, setExecutionMode, smartEnabled, setSmartEnabled } =
    useWorkspaceExecutionMode();
  const [hasUnreadAnswer, setHasUnreadAnswer] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadWorkspaceChatHistory(DEFAULT_MAYOR_CHAT_TARGET),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chamberTierCounts, setChamberTierCounts] = useState<{
    free: number;
    cheap: number;
    mid: number;
    premium: number;
  } | null>(null);
  const [teamRosterEligible, setTeamRosterEligible] = useState(true);
  const [councilRosterEligible, setCouncilRosterEligible] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);
  const prevDockOpenRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatFileRef = useRef<HTMLInputElement>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const seenEscalationIdsRef = useRef<Set<string>>(new Set());
  const [cityHallOrchestrator, setCityHallOrchestrator] = useState<CityHallOrchestrator | null>(
    null,
  );
  const [debateChambersByTier, setDebateChambersByTier] = useState<CityHallDebateChambersByTier>(
    {},
  );
  const [debateTierCounts, setDebateTierCounts] = useState<Record<CostTier, number> | null>(
    null,
  );
  const [mayorModeEligibility, setMayorModeEligibility] = useState<{
    teamEligible: boolean;
    councilEligible: boolean;
    turboEligible: boolean;
  } | null>(null);
  const [debateConfigured, setDebateConfigured] = useState(false);
  const [debatePickerOpen, setDebatePickerOpen] = useState(false);
  const [pendingDebateText, setPendingDebateText] = useState("");
  const [debateLoading, setDebateLoading] = useState(false);
  const [structureGateOpen, setStructureGateOpen] = useState(false);
  const [pendingStructurePlan, setPendingStructurePlan] = useState<TechStructurePlan | null>(null);
  const [structureExecuting, setStructureExecuting] = useState(false);
  const mayorConversationIdRef = useRef<string | null>(null);
  const { applyChatRoute, startWorkflowReplay, routeSourceEntityId } = useWorkspaceRoute();
  const { recordLastParticipationExecution } = useWorkspaceSelection();

  const rosterEntityId = resolveChatRosterEntityId(target);
  const mayorChamberId =
    target.kind === "mayor" ? cityHallOrchestrator?.chamberRegistryId ?? null : null;
  const chatSourceEntityId =
    target.kind === "mayor"
      ? mayorChamberId ?? routeSourceEntityId
      : rosterEntityId ?? routeSourceEntityId ?? mayorChamberId;
  const agentDirectMode = target.kind === "agent";

  const resolveMayorConversationId = useCallback((): string | undefined => {
    if (target.kind !== "mayor") return undefined;
    if (mayorConversationIdRef.current == null) {
      mayorConversationIdRef.current = getOrCreateWorkspaceMayorConversationId();
    }
    return mayorConversationIdRef.current;
  }, [target.kind]);

  const syncInputHeight = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(Math.max(el.scrollHeight, CHAT_INPUT_MIN_PX), CHAT_INPUT_MAX_PX);
    el.style.height = `${next}px`;
  }, []);

  useEffect(() => {
    syncInputHeight();
  }, [input, syncInputHeight]);

  const prevHistoryKeyRef = useRef<string | null>(null);
  const skipNextSaveRef = useRef(true);

  useEffect(() => {
    const key = workspaceChatTargetKey(target);
    if (prevHistoryKeyRef.current === key) return;
    prevHistoryKeyRef.current = key;
    skipNextSaveRef.current = true;
    setMessages(loadWorkspaceChatHistory(target));
    setError(null);
  }, [target]);

  useEffect(() => {
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    saveWorkspaceChatHistory(target, messages);
  }, [target, messages]);

  useEffect(() => {
    const wasOpen = prevDockOpenRef.current;
    prevDockOpenRef.current = dockOpen;
    if (dockOpen && !wasOpen && messages.length > 0) {
      setExpanded(true);
    }
  }, [dockOpen, messages.length, setExpanded]);

  const mayorEligibility =
    target.kind === "mayor"
      ? (mayorModeEligibility ?? {
          teamEligible: true,
          councilEligible: true,
          turboEligible: true,
        })
      : null;
  const teamDisabled = mayorEligibility
    ? !mayorEligibility.teamEligible
    : !teamRosterEligible;
  const councilDisabled = mayorEligibility
    ? !mayorEligibility.councilEligible
    : !councilRosterEligible;
  const turboDisabled = mayorEligibility ? !mayorEligibility.turboEligible : false;

  useEffect(() => {
    if (teamDisabled && executionMode === "team") setExecutionMode("fast");
    if (councilDisabled && executionMode === "council") setExecutionMode("fast");
    if (turboDisabled && executionMode === "turbo") setExecutionMode("fast");
  }, [teamDisabled, councilDisabled, turboDisabled, executionMode, setExecutionMode]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/workspace/city-hall-orchestrator")
      .then((r) => r.json())
      .then(
        (data: {
          configured?: boolean;
          debateConfigured?: boolean;
          debateTierCounts?: Record<CostTier, number>;
          teamEligible?: boolean;
          councilEligible?: boolean;
          turboEligible?: boolean;
          debateChambersByTier?: CityHallDebateChambersByTier;
        } & Partial<CityHallOrchestrator>) => {
          if (cancelled) return;
          if (data.configured && data.agentId && data.chamberRegistryId) {
            setCityHallOrchestrator({
              chamberRegistryId: data.chamberRegistryId,
              chamberName: data.chamberName ?? "City Hall",
              agentId: data.agentId,
              agentName: data.agentName ?? "Mayor",
            });
          }
          if (data.debateChambersByTier) {
            setDebateChambersByTier(data.debateChambersByTier);
          }
          if (data.debateTierCounts) {
            setDebateTierCounts(data.debateTierCounts);
          }
          if (
            typeof data.teamEligible === "boolean" &&
            typeof data.councilEligible === "boolean" &&
            typeof data.turboEligible === "boolean"
          ) {
            setMayorModeEligibility({
              teamEligible: data.teamEligible,
              councilEligible: data.councilEligible,
              turboEligible: data.turboEligible,
            });
          }
          setDebateConfigured(Boolean(data.debateConfigured));
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const debateReady =
    debateConfigured ||
    Object.values(debateChambersByTier).some((chamber) => (chamber?.agentCount ?? 0) >= 2);

  useEffect(() => {
    if (!dockOpen) return;

    let cancelled = false;

    async function pollEscalations() {
      try {
        const res = await fetch("/api/tech-department/escalations", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          escalations?: Array<{
            id: string;
            userMessage: string;
            mayorAgentName: string | null;
            provider: string;
            timestamp: string;
          }>;
        };
        const pending = data.escalations ?? [];
        const fresh = pending.filter((e) => !seenEscalationIdsRef.current.has(e.id));
        if (fresh.length === 0 || cancelled) return;

        for (const e of fresh) {
          seenEscalationIdsRef.current.add(e.id);
          await fetch("/api/tech-department/escalations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: e.id }),
          }).catch(() => {});
        }

        const mayorLabel =
          fresh[0]?.mayorAgentName ?? cityHallOrchestrator?.agentName ?? "Мэр";
        setMessages((prev) => [
          ...prev,
          ...fresh.map((e) =>
            assistantMessage({
              id: `esc-${e.id}`,
              text: e.userMessage,
              meta: `${mayorLabel} · эскалация · ${e.provider}`,
              techEscalation: true,
            }),
          ),
        ]);
        if (!expanded) setHasUnreadAnswer(true);
      } catch {
        /* best-effort */
      }
    }

    void pollEscalations();
    const timer = window.setInterval(() => void pollEscalations(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [dockOpen, expanded, cityHallOrchestrator?.agentName]);

  useEffect(() => {
    if (!chatSourceEntityId) {
      setTeamRosterEligible(true);
      setCouncilRosterEligible(true);
      return;
    }

    let cancelled = false;
    fetch(`/api/chamber-roster?entityId=${encodeURIComponent(chatSourceEntityId)}&turbo=${smartEnabled}`)
      .then((r) => r.json())
      .then(
        (data: {
          teamEligible?: boolean;
          councilEligible?: boolean;
          turboEligible?: boolean;
          tierCounts?: { free?: number; cheap?: number; mid?: number; premium?: number };
          chamberName?: string | null;
        }) => {
          if (cancelled) return;
          setTeamRosterEligible(data.teamEligible ?? ((data.tierCounts?.cheap ?? 0) > 0));
          setCouncilRosterEligible(data.councilEligible ?? ((data.tierCounts?.mid ?? 0) > 0));
          setChamberTierCounts({
            free: data.tierCounts?.free ?? 0,
            cheap: data.tierCounts?.cheap ?? 0,
            mid: data.tierCounts?.mid ?? 0,
            premium: data.tierCounts?.premium ?? 0,
          });
        },
      )
      .catch(() => {
        if (!cancelled) {
          setTeamRosterEligible(true);
          setCouncilRosterEligible(true);
          setChamberTierCounts(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [chatSourceEntityId, smartEnabled]);

  const estimate =
    EXECUTION_MODE_OPTIONS.find((o) => o.id === executionMode)?.estimate ??
    EXECUTION_MODE_OPTIONS[0].estimate;

  useEffect(() => {
    if (!dockOpen) return;
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, dockOpen]);

  function handleToggleExpanded() {
    if (!expanded) setHasUnreadAnswer(false);
    toggleExpanded();
  }

  function notifyAnswerIfCollapsed() {
    if (!expanded) setHasUnreadAnswer(true);
  }

  async function sendTask(text: string, mode: ExecutionMode, filesToUpload: File[] = []) {
    setLoading(true);
    setError(null);

    const effectiveMode = agentDirectMode ? "fast" : mode;

    try {
      let targetId: string | null = null;
      if (target.kind === "agent" || agentDirectMode) {
        targetId = target.kind === "agent" ? target.chamberRegistryId : null;
      } else if (target.kind === "mayor") {
        targetId = cityHallOrchestrator?.chamberRegistryId ?? mayorChamberId ?? null;
      } else if (target.kind === "chamber") {
        targetId = target.registryId;
      } else {
        targetId = chatSourceEntityId;
      }

      let attachmentIds: string[] = [];
      let uploadedAttachments: ChatAttachment[] = [];
      const uploadRegistryId =
        targetId ??
        (target.kind === "chamber"
          ? target.registryId
          : target.kind === "agent"
            ? target.chamberRegistryId
            : null);

      if (filesToUpload.length > 0) {
        if (!uploadRegistryId) {
          throw new Error("Не удалось определить отдел для загрузки файлов");
        }
        uploadedAttachments = await uploadChatAttachmentsToLibrary({
          files: filesToUpload,
          registryId: uploadRegistryId,
        });
        attachmentIds = uploadedAttachments.map((attachment) => attachment.id);
      }

      const chatPayload = buildChatRequestPayload(
        text,
        effectiveMode,
        target,
        cityHallOrchestrator,
        smartEnabled,
        attachmentIds.length > 0 ? attachmentIds : undefined,
        resolveMayorConversationId(),
      );

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(chatPayload),
      });
      const data = (await res.json()) as ExecuteChatTaskResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Ошибка чата");

      const answer =
        data.mode === "workflow"
          ? data.answer || "(workflow завершён без текста ответа)"
          : data.answer;

      const routeSteps = data.mode === "single" ? applyChatRoute(data) : null;
      const routePath = routeSteps?.length ? formatRoutePath(routeSteps) : undefined;
      const meta = buildAssistantMeta(data, routePath);

      const executionStatus = deriveExecutionResultFromChatTask(data);
      const storeExecutionStatus =
        data.mode !== "single" ||
        Boolean(data.fast || data.team || data.council) ||
        executionStatus.kind !== "full_success";

      if (
        data.mode === "single" &&
        (effectiveMode === "fast" || effectiveMode === "team" || effectiveMode === "council") &&
        (data.fast?.agents.length || data.team?.agents.length || data.council?.agents.length)
      ) {
        const payload =
          effectiveMode === "fast"
            ? data.fast
            : effectiveMode === "team"
              ? data.team
              : data.council;
        const chamberRegistryId =
          data.routing.targets[0]?.entityRegistryId ?? chatSourceEntityId;
        if (payload && chamberRegistryId) {
          recordLastParticipationExecution({
            mode: effectiveMode,
            chamberRegistryId,
            agentRegistryIds: payload.agents.map((a) => a.agentId),
            taskText: text,
            at: new Date().toISOString(),
          });
        }
      }

      setMessages((prev) => [
        ...prev,
        assistantMessage({
          id: `a-${Date.now()}`,
          text: answer,
          meta,
          attachments: data.mode === "single" ? data.attachments : undefined,
          governmentFallback:
            data.mode === "single" ? Boolean(data.governmentFallback) : false,
          fast: data.mode === "single" ? data.fast : undefined,
          team: data.mode === "single" ? data.team : undefined,
          council: data.mode === "single" ? data.council : undefined,
          executionStatus: storeExecutionStatus ? executionStatus : undefined,
        }),
      ]);
      notifyAnswerIfCollapsed();

      if (data.mode === "single" && data.structurePlan) {
        setPendingStructurePlan(data.structurePlan);
        setStructureGateOpen(true);
      }

      if (data.mode === "workflow") {
        startWorkflowReplay(data.steps);
        setMessages((prev) => [
          ...prev,
          assistantMessage({
            id: `w-${Date.now()}`,
            text: formatWorkflowSidebar(data.steps),
            meta: "Workflow",
          }),
        ]);
        notifyAnswerIfCollapsed();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        assistantMessage({
          id: `e-${Date.now()}`,
          text: `Ошибка: ${msg}`,
          isError: true,
          executionStatus: {
            kind: "full_failure",
            title: "Сбой",
            detail: msg,
            hasAnswer: false,
          },
        }),
      ]);
      notifyAnswerIfCollapsed();
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    const files = pendingFiles;
    if ((!text && files.length === 0) || loading || debateLoading) return;
    if (!dockOpen) openDock(target);

    setMessages((prev) => [
      ...prev,
      userMessage(text || "📎 Файлы", files.length > 0 ? pendingFilesToAttachments(files) : undefined),
    ]);
    setInput("");
    setPendingFiles([]);
    if (chatFileRef.current) chatFileRef.current.value = "";
    requestAnimationFrame(syncInputHeight);
    void sendTask(text, executionMode, files);
  }

  async function sendDebate(text: string, tierMode: DebateTierMode) {
    setDebateLoading(true);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/debate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskText: text,
          tierMode,
          callerKind: "mayor",
          ...(cityHallOrchestrator?.chamberRegistryId
            ? { sourceEntityId: cityHallOrchestrator.chamberRegistryId }
            : {}),
        }),
      });
      const data = (await res.json()) as AgentDebateResult & { error?: string };
      if (!res.ok || data.error) {
        throw new Error(data.error ?? "Ошибка спора");
      }

      const meta = `Спор · ${data.author.name} ↔ ${data.reviewer.name} · ${data.councilChamberName}`;
      setMessages((prev) => [
        ...prev,
        assistantMessage({
          id: `d-${Date.now()}`,
          text: data.answer,
          meta,
          debate: {
            debateId: data.debateId,
            closedReason: data.closedReason,
            authorName: data.author.name,
            reviewerName: data.reviewer.name,
            rounds: data.rounds,
          },
        }),
      ]);
      notifyAnswerIfCollapsed();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      setError(msg);
      setMessages((prev) => [
        ...prev,
        assistantMessage({
          id: `de-${Date.now()}`,
          text: `Ошибка спора: ${msg}`,
          isError: true,
        }),
      ]);
      notifyAnswerIfCollapsed();
    } finally {
      setDebateLoading(false);
      setLoading(false);
    }
  }

  function handleDebateClick() {
    const text = input.trim();
    if (!text || loading || debateLoading) return;
    if (!dockOpen) openDock(target);
    if (!debateReady) {
      setError("Отделы спора City Hall не настроены (нужно ≥2 агента в выбранном tier)");
      return;
    }
    setPendingDebateText(text);
    setDebatePickerOpen(true);
  }

  function handleDebateConfirm(tierMode: DebateTierMode) {
    const text = pendingDebateText.trim();
    if (!text || loading || debateLoading) return;
    setDebatePickerOpen(false);
    setMessages((prev) => [...prev, userMessage(text)]);
    setInput("");
    requestAnimationFrame(syncInputHeight);
    setPendingDebateText("");
    void sendDebate(text, tierMode);
  }

  function handleDebateCancel() {
    setDebatePickerOpen(false);
    setPendingDebateText("");
  }

  function handleStructureCancel() {
    const planId = pendingStructurePlan?.planId;
    setStructureGateOpen(false);
    setPendingStructurePlan(null);
    if (planId) {
      void fetch("/api/tech-department/structure/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
    }
  }

  async function handleStructureConfirm() {
    const plan = pendingStructurePlan;
    if (!plan || structureExecuting) return;
    setStructureExecuting(true);
    try {
      const res = await fetch("/api/tech-department/structure/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.planId, confirmed: true }),
      });
      const body = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Ошибка выполнения плана");

      setStructureGateOpen(false);
      setPendingStructurePlan(null);
      setMessages((prev) => [
        ...prev,
        assistantMessage({
          id: `ts-${Date.now()}`,
          text: body.message ?? "Структурные изменения выполнены.",
          meta: "Технический отдел · structure execute",
        }),
      ]);
      notifyAnswerIfCollapsed();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Неизвестная ошибка";
      setStructureGateOpen(false);
      setPendingStructurePlan(null);
      setError(msg);
      setMessages((prev) => [
        ...prev,
        assistantMessage({
          id: `tse-${Date.now()}`,
          text: `Ошибка выполнения плана: ${msg}`,
          isError: true,
        }),
      ]);
    } finally {
      setStructureExecuting(false);
    }
  }

  const loadingLabel =
    debateLoading
      ? "Спор: цепочка confirm/revise…"
      : executionMode === "council"
      ? "Council: сбор мнений и синтез отчёта…"
      : executionMode === "team"
        ? "Team: сбор мнений экспертов…"
        : agentDirectMode
          ? "Ответ агента…"
          : cityHallOrchestrator && target.kind === "mayor"
            ? `${cityHallOrchestrator.agentName}…`
            : "Маршрутизация…";

  const dockTitle =
    target.kind === "agent"
      ? target.label
      : target.kind === "chamber"
        ? target.label
        : cityHallOrchestrator?.agentName ?? DEFAULT_MAYOR_CHAT_TARGET.label;

  const placeholder =
    target.kind === "agent"
      ? `Вопрос для ${target.label}…`
      : target.kind === "chamber"
        ? `Вопрос в отдел «${target.label}»…`
        : cityHallOrchestrator
          ? `Задача для ${cityHallOrchestrator.agentName}…`
          : "Задача для Mayor…";

  return (
    <>
      <TechStructureConfirmationGate
        open={structureGateOpen}
        planSummary={pendingStructurePlan?.summary ?? ""}
        actionLines={
          pendingStructurePlan?.actions.map((a, i) => `${i + 1}. [${a.type}] ${a.description}`) ??
          []
        }
        impactLines={pendingStructurePlan?.impactAnalysis?.summaryLines}
        snapshotId={pendingStructurePlan?.snapshotId}
        isDestructive={pendingStructurePlan?.planKind === "destructive"}
        confirmDisabled={structureExecuting}
        onCancel={handleStructureCancel}
        onConfirm={() => void handleStructureConfirm()}
      />

      <DebateTierPicker
        open={debatePickerOpen}
        taskPreview={pendingDebateText}
        debateChambersByTier={debateChambersByTier}
        tierCounts={
          debateTierCounts ?? { free: 0, cheap: 0, mid: 0, premium: 0 }
        }
        onCancel={handleDebateCancel}
        onConfirm={handleDebateConfirm}
      />

      {!dockOpen && (
        <button
          type="button"
          data-testid="workspace-chat-launcher"
          onClick={() => openDock()}
          className="workspace-chat-launcher pointer-events-auto"
          title="Открыть чат Mayor"
        >
          <span className="text-xs font-medium text-stone-200">Mayor</span>
          <span aria-hidden className="text-stone-400">
            ▲
          </span>
          {hasUnreadAnswer && (
            <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400" />
          )}
        </button>
      )}

      {dockOpen && (
        <div
          className={`workspace-chat-dock pointer-events-auto ${
            expanded ? "workspace-chat-dock--expanded" : ""
          }`}
          data-testid="workspace-mayor-chat"
        >
          <header className="workspace-chat-dock__header">
            <div className="workspace-chat-dock__title-block">
              <div className="workspace-chat-dock__eyebrow">
                {target.kind === "mayor" ? "Mayor" : target.kind === "chamber" ? "Отдел" : "Агент"}
              </div>
              <div className="workspace-chat-dock__title">{dockTitle}</div>
              <p className="workspace-chat-dock__subtitle">{chatTargetHint(target)}</p>
            </div>
            <div className="workspace-chat-dock__header-actions">
              <button
                type="button"
                data-testid="workspace-mayor-chat-expand"
                aria-expanded={expanded}
                aria-label={expanded ? "Свернуть чат" : "Развернуть чат на весь экран"}
                title={expanded ? "Свернуть" : "На весь экран"}
                onClick={handleToggleExpanded}
                className={`workspace-chat-dock__icon-btn ${
                  hasUnreadAnswer && !expanded ? "workspace-chat-dock__icon-btn--alert" : ""
                }`}
              >
                {expanded ? "Свернуть" : "На весь экран"}
              </button>
              <button
                type="button"
                data-testid="workspace-chat-hide"
                onClick={closeDock}
                className="workspace-chat-dock__icon-btn"
                title="Скрыть чат"
                aria-label="Скрыть чат"
              >
                ✕
              </button>
            </div>
          </header>

          {!agentDirectMode && (
            <div className="workspace-chat-dock__toolbar">
              <div
                className="workspace-chat-mode-switch"
                role="radiogroup"
                aria-label="Режим выполнения"
              >
                {EXECUTION_MODE_OPTIONS.map((option) => {
                  const disabled =
                    (option.id === "team" && teamDisabled) ||
                    (option.id === "council" && councilDisabled) ||
                    (option.id === "turbo" && turboDisabled);
                  const disabledReason =
                    option.id === "team" && teamDisabled
                      ? "Нет cheap-агентов в городе (вне City Hall)"
                      : option.id === "council" && councilDisabled
                        ? "Нет mid-агентов в городе (вне City Hall)"
                        : option.id === "turbo" && turboDisabled
                          ? "Нет premium-агентов в городе (вне City Hall)"
                          : undefined;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={executionMode === option.id}
                      disabled={disabled}
                      data-testid={`workspace-chat-mode-${option.id}`}
                      onClick={() => setExecutionMode(option.id)}
                      className={`workspace-chat-mode-switch__btn${
                        executionMode === option.id ? " workspace-chat-mode-switch__btn--active" : ""
                      }${disabled ? " workspace-chat-mode-switch__btn--disabled" : ""}`}
                      title={disabled ? disabledReason ?? option.hint : option.hint}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <label className="workspace-chat-smart-toggle">
                <input
                  type="checkbox"
                  checked={smartEnabled}
                  onChange={(e) => setSmartEnabled(e.target.checked)}
                  data-testid="workspace-smart-toggle"
                />
                <span>Smart</span>
              </label>
              {target.kind === "mayor" && (
                <button
                  type="button"
                  className="workspace-chat-debate-btn"
                  data-testid="workspace-debate-launch"
                  disabled={loading || debateLoading || !input.trim() || !debateReady}
                  onClick={handleDebateClick}
                  title={
                    !input.trim()
                      ? "Введите вопрос — затем выберите уровень спора"
                      : !debateReady
                        ? "Нет отделов спора в City Hall (нужно ≥2 агента в tier-отделе)"
                        : "Спор между двумя агентами City Hall (free / $ / $$ / $$$)"
                  }
                >
                  Спор
                </button>
              )}
              <span className="workspace-chat-dock__estimate" data-testid="workspace-execution-estimate">
                {estimate}
              </span>
            </div>
          )}

          <div ref={listRef} className="workspace-chat-dock-messages" data-testid="workspace-chat-history">
            {messages.length === 0 && !loading && (
              <p className="workspace-chat-dock__empty">История пуста — задайте вопрос ниже.</p>
            )}
            {messages.map((m) => (
              <article
                key={m.id}
                className={`workspace-chat-message workspace-chat-message--${m.role}${
                  m.isError ? " workspace-chat-message--error" : ""
                }`}
              >
                <header className="workspace-chat-message__head">
                  <span className="workspace-chat-message__author">
                    {m.role === "user" ? "Вы" : "Ответ"}
                  </span>
                  <time className="workspace-chat-message__time" dateTime={m.createdAt}>
                    {formatMessageTime(m.createdAt)}
                  </time>
                </header>
                <div className="workspace-chat-message__body">{m.text}</div>
                {m.attachments && m.attachments.length > 0 && (
                  <ChatMessageAttachments attachments={m.attachments} />
                )}
                <ChatMessageDetails message={m} />
              </article>
            ))}
            {loading && (
              <div className="workspace-chat-dock__loading" aria-live="polite">
                {loadingLabel}
              </div>
            )}
          </div>

          {error && (
            <p className="workspace-chat-dock__error" role="alert">
              {error}
            </p>
          )}

          <form ref={formRef} onSubmit={handleSubmit} className="workspace-chat-dock__composer">
            {pendingFiles.length > 0 && (
              <div className="workspace-chat-pending-files" data-testid="workspace-chat-pending-files">
                {pendingFiles.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="workspace-bubble-chip">
                    {file.name}
                    <button
                      type="button"
                      aria-label={`Убрать ${file.name}`}
                      onClick={() =>
                        setPendingFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index))
                      }
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="workspace-chat-dock__composer-row">
            <button
              type="button"
              className="workspace-chat-dock__attach"
              data-testid="workspace-mayor-chat-attach"
              disabled={loading || debateLoading}
              onClick={() => chatFileRef.current?.click()}
              title="Прикрепить файл"
            >
              📎
            </button>
            <input
              ref={chatFileRef}
              type="file"
              className="hidden"
              multiple
              accept={KNOWLEDGE_FILE_ACCEPT}
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                if (picked.length === 0) return;
                setPendingFiles((prev) => [...prev, ...picked]);
              }}
            />
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!loading && !debateLoading && (input.trim() || pendingFiles.length > 0)) {
                    formRef.current?.requestSubmit();
                  }
                }
              }}
              placeholder={placeholder}
              disabled={loading || debateLoading}
              data-testid="workspace-mayor-chat-input"
              className="workspace-chat-input"
            />
            <button
              type="submit"
              disabled={loading || debateLoading || (!input.trim() && pendingFiles.length === 0)}
              data-testid="workspace-mayor-chat-send"
              className="workspace-chat-dock__send"
            >
              {loading ? "…" : "Отправить"}
            </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
