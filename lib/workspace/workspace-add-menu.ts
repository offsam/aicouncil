import type { WorkspaceMessages } from "@/lib/workspace/i18n/messages";
import { workspaceAssignmentNodeId } from "@/lib/workspace/agent-nodes";

export type WorkspaceAddMenuTarget =
  | {
      kind: "building";
      officeId: string;
      buildingId: string;
      label: string;
      accentIndex?: number;
      isCityHall?: boolean;
    }
  | {
      kind: "chamber";
      officeId: string;
      buildingId: string;
      chamberId: string;
      registryId: string;
      label: string;
      accentIndex?: number;
    }
  | {
      kind: "agent";
      officeId: string;
      agentId: string;
      assignmentId: string;
      label: string;
    };

export type WorkspaceAddMenuActionId =
  | "chamber"
  | "agent"
  | "rule"
  | "knowledge"
  | "routing"
  | "color"
  | "inspector"
  | "connect"
  | "delete";

export type WorkspaceAddMenuOption = {
  id: WorkspaceAddMenuActionId;
  label: string;
  description: string;
  danger?: boolean;
};

export function objectMenuTitle(
  target: WorkspaceAddMenuTarget,
  t: WorkspaceMessages,
): string {
  if (target.kind === "building") return t.menuActionsBuilding(target.label);
  if (target.kind === "chamber") return t.menuActionsChamber(target.label);
  return t.menuActionsAgent(target.label);
}

export function workspaceAddMenuOptions(
  kind: WorkspaceAddMenuTarget["kind"],
  t: WorkspaceMessages,
  opts?: { isCityHall?: boolean },
): WorkspaceAddMenuOption[] {
  const connectOption: WorkspaceAddMenuOption = {
    id: "connect",
    label: t.menuConnect,
    description: t.menuConnectDesc,
  };

  if (kind === "building") {
    const items: WorkspaceAddMenuOption[] = [
      connectOption,
      { id: "chamber", label: t.menuChamber, description: "Новый отдел в здании" },
      { id: "color", label: t.menuColor, description: "Цвет контура здания на canvas" },
      { id: "rule", label: t.menuRule, description: "Правило для здания" },
      { id: "knowledge", label: t.menuKnowledge, description: "Локальный источник знаний" },
      { id: "inspector", label: t.menuInspector, description: "Все настройки здания" },
      {
        id: "delete",
        label: t.menuDelete,
        description: t.menuDeleteDescBuilding,
        danger: true,
      },
    ];
    if (opts?.isCityHall) {
      return items.filter((item) => item.id !== "color" && item.id !== "delete");
    }
    return items;
  }

  if (kind === "chamber") {
    return [
      connectOption,
      { id: "agent", label: t.menuAgent, description: "Назначить агента в отдел" },
      { id: "color", label: t.menuColor, description: "Цвет контура отдела на canvas" },
      { id: "rule", label: t.menuRule, description: "Правило для отдела" },
      { id: "knowledge", label: t.menuKnowledge, description: "Источник / материалы" },
      { id: "routing", label: t.menuRouting, description: "Описание для маршрутизации" },
      { id: "inspector", label: t.menuInspector, description: "Все настройки отдела" },
      {
        id: "delete",
        label: t.menuDelete,
        description: t.menuDeleteDescChamber,
        danger: true,
      },
    ];
  }

  return [
    connectOption,
    { id: "inspector", label: t.menuInspector, description: "Все настройки агента" },
    {
      id: "delete",
      label: t.menuDelete,
      description: t.menuDeleteDescAgent,
      danger: true,
    },
  ];
}

export function connectRegistryIdFromMenuTarget(target: WorkspaceAddMenuTarget): string {
  if (target.kind === "building") return target.buildingId;
  if (target.kind === "chamber") return target.registryId;
  return target.agentId;
}

/** React Flow node id to elevate when add-menu opens on this target. */
export function overlayOwnerIdFromMenuTarget(target: WorkspaceAddMenuTarget): string {
  if (target.kind === "building") return target.buildingId;
  if (target.kind === "chamber") return target.registryId;
  return workspaceAssignmentNodeId(target.assignmentId);
}
