import type { MayorExecutiveSystemPromptParts } from "./mayor-persona";
import { CHAMBER_ANSWER_SYSTEM_PREFIX } from "./agent-persona";

/** Anthropic Messages API system block with optional prompt cache breakpoint. */
export type AnthropicSystemBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

const EPHEMERAL_CACHE: AnthropicSystemBlock["cache_control"] = { type: "ephemeral" };

/**
 * Stable Mayor system blocks for Anthropic prompt caching (MAYOR-COST-1A).
 * Dynamic blocks (office snapshot, agent context) are excluded from cache_control.
 */
export function buildMayorAnthropicCachedSystemBlocks(
  parts: MayorExecutiveSystemPromptParts,
  agentContextPrompt: string,
): AnthropicSystemBlock[] {
  const blocks: AnthropicSystemBlock[] = [
    { type: "text", text: parts.stablePrefix, cache_control: EPHEMERAL_CACHE },
  ];

  if (parts.officeSnapshot) {
    blocks.push({ type: "text", text: `\n${parts.officeSnapshot}\n` });
  }

  blocks.push(
    { type: "text", text: parts.buildingsBlock, cache_control: EPHEMERAL_CACHE },
    {
      type: "text",
      text: `\n\n${CHAMBER_ANSWER_SYSTEM_PREFIX}`,
      cache_control: EPHEMERAL_CACHE,
    },
  );

  const context = agentContextPrompt.trim();
  if (context) {
    blocks.push({ type: "text", text: `\n\n${context}` });
  }

  return blocks;
}

export function anthropicSystemBlocksToString(blocks: AnthropicSystemBlock[]): string {
  return blocks.map((b) => b.text).join("");
}
