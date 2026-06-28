import type { OfficeLinkRow } from "./office-types";

const STORAGE_PREFIX = "floor-links-";

export function loadLocalLinks(officeId: string): OfficeLinkRow[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${officeId}`);
    if (!raw) return null;
    return JSON.parse(raw) as OfficeLinkRow[];
  } catch {
    return null;
  }
}

export function saveLocalLinks(officeId: string, rows: OfficeLinkRow[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_PREFIX}${officeId}`, JSON.stringify(rows));
}

export function newLocalLinkId() {
  return `local-link-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
