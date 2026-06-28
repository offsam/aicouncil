import { AI_COUNCIL_OFFICE_ID, AGENT_DB_IDS } from "./ai-council-ids";
import { FLOOR_AGENTS } from "./floor-agents";
import type { OfficeObjectRow } from "./office-types";

const STORAGE_PREFIX = "floor-objects-";

export function buildFallbackObjects(officeId: string): OfficeObjectRow[] {
  const now = new Date().toISOString();
  return FLOOR_AGENTS.map((agent) => ({
    id: `local-desk-${agent.id}`,
    office_id: officeId,
    object_type: "desk" as const,
    position_x: agent.position[0],
    position_z: agent.position[2],
    rotation_y: 0,
    agent_id: AGENT_DB_IDS[agent.id] ?? null,
    color: null,
    size_w: null,
    size_d: null,
    label: null,
    created_at: now,
    agents: {
      id: AGENT_DB_IDS[agent.id] ?? agent.id,
      office_id: officeId,
      name: agent.name,
      provider: "unknown",
      model_id: "",
      status: agent.envVar && process.env[agent.envVar]?.trim() ? "online" : "offline",
      created_at: now,
    },
  }));
}

export function loadLocalObjects(officeId: string): OfficeObjectRow[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${officeId}`);
    if (!raw) return null;
    return JSON.parse(raw) as OfficeObjectRow[];
  } catch {
    return null;
  }
}

export function saveLocalObjects(officeId: string, objects: OfficeObjectRow[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`${STORAGE_PREFIX}${officeId}`, JSON.stringify(objects));
}

export function defaultObjectsForOffice(officeId: string): OfficeObjectRow[] {
  return buildFallbackObjects(officeId);
}

export { AI_COUNCIL_OFFICE_ID };
