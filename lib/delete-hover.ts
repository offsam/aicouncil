import type { OfficeObjectRow, OfficeObjectType } from "./office-types";
import { CITY, OBJECT_LABELS_CITY } from "./city-labels";

export type DeleteHoverTarget =
  | { kind: "object"; id: string }
  | { kind: "floor"; zone: "inner" | "outer" }
  | { kind: "cell"; key: string }
  | { kind: "wallSegment"; id: string }
  | { kind: "link"; id: string }
  | { kind: "connection"; id: string };

const OBJECT_LABELS: Record<OfficeObjectType, string> = OBJECT_LABELS_CITY;

export function objectDisplayLabel(obj: OfficeObjectRow): string {
  if (obj.object_type === "desk" && obj.agents?.name) return obj.agents.name;
  if (obj.object_type === "room") return obj.label?.trim() || OBJECT_LABELS.room;
  return OBJECT_LABELS[obj.object_type];
}

export function getDeleteHoverLabel(
  target: DeleteHoverTarget | null,
  objects: OfficeObjectRow[],
  selectedObjectIds: string[],
): string | null {
  if (!target) return null;

  if (target.kind === "floor") {
    return target.zone === "inner"
      ? CITY.centerSquare
      : CITY.buildPad;
  }

  if (target.kind === "cell") {
    return CITY.floorCell;
  }

  if (target.kind === "wallSegment") {
    return CITY.wallSegment;
  }

  if (target.kind === "link") {
    return CITY.cableToBuilding;
  }

  if (target.kind === "connection") {
    return "Кабель связи (Connection)";
  }

  const obj = objects.find((o) => o.id === target.id);
  if (!obj) return null;

  if (selectedObjectIds.includes(obj.id) && selectedObjectIds.length > 1) {
    return `${selectedObjectIds.length} объектов`;
  }

  return objectDisplayLabel(obj);
}

export function isDeleteHoverActive(
  target: DeleteHoverTarget | null,
  check: DeleteHoverTarget,
): boolean {
  if (!target) return false;
  if (target.kind !== check.kind) return false;
  if (target.kind === "floor" && check.kind === "floor") {
    return target.zone === check.zone;
  }
  if (target.kind === "cell" && check.kind === "cell") {
    return target.key === check.key;
  }
  if (target.kind === "wallSegment" && check.kind === "wallSegment") {
    return target.id === check.id;
  }
  if (target.kind === "object" && check.kind === "object") {
    return target.id === check.id;
  }
  if (target.kind === "link" && check.kind === "link") {
    return target.id === check.id;
  }
  if (target.kind === "connection" && check.kind === "connection") {
    return target.id === check.id;
  }
  return false;
}
