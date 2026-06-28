export type WorkspaceChatTarget =
  | { kind: "mayor"; label: string }
  | {
      kind: "chamber";
      registryId: string;
      label: string;
      buildingId?: string;
      /** Primary entry chamber — enables internal Manager routing instead of direct execution. */
      isMainChamber?: boolean;
    }
  | {
      kind: "agent";
      agentId: string;
      chamberRegistryId: string;
      label: string;
    };

export const DEFAULT_MAYOR_CHAT_TARGET: WorkspaceChatTarget = {
  kind: "mayor",
  label: "Mayor",
};

/** Stable key for chat history buckets (mayor / chamber / agent). */
export function workspaceChatTargetKey(target: WorkspaceChatTarget): string {
  switch (target.kind) {
    case "mayor":
      return "mayor";
    case "chamber":
      return `chamber:${target.registryId}`;
    case "agent":
      return `agent:${target.agentId}`;
  }
}

export function chatTargetLabel(target: WorkspaceChatTarget): string {
  return target.label;
}

export function chatTargetHint(target: WorkspaceChatTarget): string {
  switch (target.kind) {
    case "mayor":
      return "System Orchestrator · маршрутизация по городу";
    case "chamber":
      return target.isMainChamber
        ? `Вопрос в Manager «${target.label}» · маршрутизация внутри здания`
        : `Вопрос напрямую в отдел «${target.label}»`;
    case "agent":
      return `Вопрос агенту «${target.label}»`;
  }
}
