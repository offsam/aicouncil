import { AGENT_DB_IDS } from "./ai-council-ids";
import { FLOOR_AGENTS } from "./floor-agents";
import { withComputedStatus } from "./agent-status";
import type { AgentRow } from "./office-types";

const dbIdToSlug = new Map(
  Object.entries(AGENT_DB_IDS).map(([slug, id]) => [id, slug]),
);

const slugToVisual = new Map(
  FLOOR_AGENTS.map((a) => [a.id, { color: a.color, slug: a.id }]),
);

export function getAgentVisual(agent: AgentRow) {
  const slug = dbIdToSlug.get(agent.id) ?? agent.name.toLowerCase();
  const visual = slugToVisual.get(slug);
  return {
    slug,
    color: visual?.color ?? "#8b5cf6",
    name: agent.name,
    status: withComputedStatus(agent).status,
  };
}

export function getAgentColorById(agentId: string): string {
  const slug = dbIdToSlug.get(agentId);
  if (!slug) return "#8b5cf6";
  return slugToVisual.get(slug)?.color ?? "#8b5cf6";
}
