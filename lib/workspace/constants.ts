/** Pixels per world unit (shared with office_objects / chambers coords). */
export const WORKSPACE_UNIT_PX = 24;

export const SIDEBAR_WIDTH_PX = 320;
export const INSPECTOR_WIDTH_PX = 320;

export const DEFAULT_CITY_HALL = {
  x: -168,
  y: -120,
  width: 288,
  height: 240,
} as const;

export const HIGHLIGHT_CLASS = "workspace-node-highlight";

export const MINIMAP_WIDTH_PX = 160;
export const MINIMAP_HEIGHT_PX = 100;

export const MINIMAP_NODE_COLORS: Record<string, string> = {
  cityHall: "var(--accent-violet)",
  building: "var(--border-soft)",
  chamber: "var(--accent-cyan)",
  agent: "var(--accent-violet)",
  default: "var(--border-soft)",
};

export type CityHallLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

import type { ExecutionMode } from "@/lib/execution-mode";

export type WorkspaceMeta = {
  /** Headless-integration entry office (Telegram, etc.) — ADR-002 */
  external_entry?: boolean;
  /** City-wide Fast / Team / Council activator (defaults to fast = free tier only). */
  execution_mode?: ExecutionMode;
  city_hall?: CityHallLayout;
  viewport?: { x: number; y: number; zoom: number };
  canvas_bg?: string;
  /** nodeId → handleId → perimeter percent (0–100) */
  connection_handle_positions?: Record<string, Record<string, number>>;
  /** connectionId → handles chosen when the cable was drawn */
  connection_handle_assignments?: Record<string, { sourceHandle: string; targetHandle: string }>;
  /** nodeId → extra user-added handle slots */
  extra_connection_handles?: Record<string, Array<{ id: string; type: "source" | "target"; perimeterPercent: number }>>;
  /** Tech Department building tile — which counter ids are visible */
  tech_department_visible_counters?: string[];
};

export const WORKSPACE_CANVAS_BG_DEFAULT = "#070A12";

/** React Flow: buildings/chambers drag only from the title row (cross + name). */
export const WORKSPACE_NODE_DRAG_HANDLE = ".workspace-node-drag-zone";

export const WORKSPACE_CANVAS_BG_PRESETS = [
  "#070A12",
  "#0F1423",
  "#10131D",
  "#111827",
  "#0B1020",
] as const;
