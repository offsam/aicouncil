export type InspectorViewMode = "basic" | "professional";

export const INSPECTOR_MODE_STORAGE_KEY = "workspace-inspector-view-mode";

export function readInspectorViewMode(): InspectorViewMode {
  if (typeof window === "undefined") return "basic";
  try {
    const raw = localStorage.getItem(INSPECTOR_MODE_STORAGE_KEY);
    return raw === "professional" ? "professional" : "basic";
  } catch {
    return "basic";
  }
}

export function writeInspectorViewMode(mode: InspectorViewMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INSPECTOR_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
