import { MayorRoutingDecision } from "./office-types";
import { MAYOR_ROUTING_PARSE_ERROR_ANSWER } from "./mayor-persona";
import { isStructureMutationCommand } from "./structure-command-intent";
import { resolveMainChamber } from "./workspace/resolve-main-chamber";
import {
  requireExternalEntryOfficeId,
  requireTechDepartmentBuildingId,
} from "./workspace/graph-identity-required";

export type MayorAgentRoutingEnvelope = {
  decision: MayorRoutingDecision;
  answer: string | null;
};

export type MayorBuildingRow = {
  id: string;
  name: string;
  routing_description?: string | null;
};

/** routing_logs.routing_action value for Mayor structure-command gate. */
export function mayorRoutingLogAction(decision: MayorRoutingDecision): string {
  if (decision.matchedBy === "structure_command") {
    return "structure_delegate";
  }
  return decision.action;
}

async function delegateToTechDepartment(
  reasoning: string,
  trace: string[],
): Promise<MayorRoutingDecision> {
  const officeId = await requireExternalEntryOfficeId();
  const techBuildingId = await requireTechDepartmentBuildingId(officeId);
  const mainChamber = await resolveMainChamber(techBuildingId);
  return {
    action: "delegate",
    target: techBuildingId,
    matchedBy: "structure_command",
    confidence: 1,
    reasoning,
    trace,
    delegatedBuildingId: techBuildingId,
    delegatedChamberId: mainChamber?.chamberRegistryId ?? null,
  };
}

/**
 * MR-2: sole deterministic bypass — keyword structure mutation commands only.
 * Returns null when the configured Mayor agent must decide.
 */
export async function resolveDeterministicMayorRoutingDecision(
  taskText: string,
  buildings: MayorBuildingRow[],
): Promise<MayorRoutingDecision | null> {
  if (!buildings || buildings.length === 0) {
    return {
      action: "answer_self",
      matchedBy: "semantic",
      confidence: 1,
      reasoning: "No buildings available, Mayor answers directly",
      trace: ["no_buildings"],
    };
  }

  if (isStructureMutationCommand(taskText)) {
    return delegateToTechDepartment(
      "Structure mutation command detected by deterministic system gate — delegate to Tech Department",
      ["structure_command_gate", "tech_department"],
    );
  }

  return null;
}

function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in Mayor response");
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    // Truncated or slightly malformed JSON — try to salvage routing + answer fields
    const salvaged = salvageMayorEnvelopeJson(jsonMatch[0]);
    if (salvaged) return salvaged;
    throw new Error("Invalid JSON in Mayor response");
  }
}

/** Best-effort extraction when the model truncates closing braces/quotes. */
function salvageMayorEnvelopeJson(fragment: string): Record<string, unknown> | null {
  const actionMatch = fragment.match(/"action"\s*:\s*"(answer_self|delegate)"/);
  if (!actionMatch) return null;

  const action = actionMatch[1];
  const result: Record<string, unknown> = {
    routing: { action, matchedBy: "semantic", confidence: 0.8, reasoning: "salvaged", trace: ["mayor_agent", "json_salvage"] },
  };

  const targetMatch = fragment.match(/"target"\s*:\s*"([0-9a-f-]{36})"/i);
  if (targetMatch) {
    (result.routing as Record<string, unknown>).target = targetMatch[1];
  }

  const answerMatch = fragment.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (answerMatch) {
    result.answer = answerMatch[1]!.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  }

  return result;
}

function looksLikePlainTextAnswer(rawText: string): boolean {
  const trimmed = rawText.trim();
  if (!trimmed || trimmed.startsWith("{")) return false;
  if (/^```/.test(trimmed)) return false;
  if (trimmed.length < 4) return false;
  return /[\u0400-\u04FFa-zA-Z]/.test(trimmed);
}

function routingFieldsFromParsed(parsed: Record<string, unknown>): MayorRoutingDecision {
  const routingRaw =
    parsed.routing && typeof parsed.routing === "object"
      ? (parsed.routing as Record<string, unknown>)
      : parsed;

  const action = routingRaw.action === "delegate" ? "delegate" : "answer_self";
  const target =
    typeof routingRaw.target === "string" && routingRaw.target.trim()
      ? routingRaw.target.trim()
      : undefined;
  const matchedBy =
    routingRaw.matchedBy === "explicit_name" ? "explicit_name" : "semantic";
  const confidence =
    typeof routingRaw.confidence === "number" ? routingRaw.confidence : 0;
  const reasoning =
    typeof routingRaw.reasoning === "string" ? routingRaw.reasoning : "";
  const trace = Array.isArray(routingRaw.trace)
    ? routingRaw.trace.map(String)
    : ["mayor_agent"];

  return {
    action,
    target,
    matchedBy,
    confidence,
    reasoning,
    trace,
  };
}

function answerFromParsed(parsed: Record<string, unknown>): string | null {
  if (!("answer" in parsed)) return null;
  const answer = parsed.answer;
  if (answer === null || answer === undefined) return null;
  if (typeof answer === "string") return answer.trim() || null;
  return String(answer).trim() || null;
}

/** Parse routing + optional answer from the configured Mayor agent's single response. */
export function parseMayorAgentRoutingEnvelope(
  rawText: string,
  buildings: MayorBuildingRow[],
): MayorAgentRoutingEnvelope {
  try {
    const parsed = extractJsonObject(rawText) as Record<string, unknown>;
    const decision = routingFieldsFromParsed(parsed);
    const answer = answerFromParsed(parsed);
    return { decision, answer };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (looksLikePlainTextAnswer(rawText)) {
      return {
        decision: {
          action: "answer_self",
          matchedBy: "semantic",
          confidence: 1,
          reasoning: "Plain-text Mayor response treated as direct answer",
          trace: ["mayor_agent", "plain_text_fallback"],
        },
        answer: rawText.trim(),
      };
    }

    return {
      decision: {
        action: "answer_self",
        matchedBy: "semantic",
        confidence: 0,
        reasoning: `Failed to parse Mayor routing envelope: ${message}`,
        trace: ["parse_error"],
      },
      answer: MAYOR_ROUTING_PARSE_ERROR_ANSWER,
    };
  }
}

/** Apply confidence/target validation and resolve delegate chamber ids. */
export async function finalizeMayorRoutingDecision(
  decision: MayorRoutingDecision,
  validBuildingIds: Set<string>,
): Promise<MayorRoutingDecision> {
  if (decision.action !== "delegate" || !decision.target) {
    return decision;
  }

  if (!validBuildingIds.has(decision.target) || decision.confidence < 0.4) {
    return {
      action: "answer_self",
      matchedBy: decision.matchedBy,
      confidence: decision.confidence,
      reasoning:
        decision.confidence < 0.4
          ? "Low confidence delegate target — Mayor answers directly"
          : "Invalid or unknown building target — Mayor answers directly",
      trace: [...decision.trace, "fallback_invalid_or_low_confidence"],
    };
  }

  const mainChamber = await resolveMainChamber(decision.target);
  if (!mainChamber?.chamberRegistryId) {
    return {
      action: "answer_self",
      matchedBy: decision.matchedBy,
      confidence: decision.confidence,
      reasoning: "Delegate target building has no main chamber (Manager) — not configured for execution",
      trace: [...decision.trace, "fallback_no_main_chamber"],
    };
  }

  return {
    ...decision,
    delegatedBuildingId: decision.target,
    delegatedChamberId: mainChamber.chamberRegistryId,
  };
}

/**
 * @deprecated MR-2: returns deterministic gate only. Semantic routing is decided by the Mayor agent.
 */
export async function resolveRoutingDecision(
  taskText: string,
  buildings: MayorBuildingRow[],
): Promise<MayorRoutingDecision> {
  const deterministic = await resolveDeterministicMayorRoutingDecision(taskText, buildings);
  if (deterministic) return deterministic;
  throw new Error(
    "resolveRoutingDecision: non-deterministic Mayor routing requires the configured Mayor agent (MR-2)",
  );
}
