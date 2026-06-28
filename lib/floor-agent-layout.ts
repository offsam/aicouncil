import { FLOOR_AGENTS } from "./floor-agents";
import { AGENT_DB_IDS } from "./ai-council-ids";
import type { AgentRow } from "./office-types";

export interface FloorAgentView extends AgentRow {
  slug: string;
  color: string;
  position: [number, number, number];
}

const layoutByDbId = new Map(
  FLOOR_AGENTS.map((a) => [AGENT_DB_IDS[a.id], { slug: a.id, color: a.color, position: a.position }]),
);

export function attachFloorLayout(agents: AgentRow[]): FloorAgentView[] {
  return agents
    .map((agent) => {
      const layout = layoutByDbId.get(agent.id);
      if (!layout) return null;
      return { ...agent, ...layout };
    })
    .filter((a): a is FloorAgentView => a !== null);
}
