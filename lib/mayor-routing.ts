import { MayorRoutingDecision } from "./office-types";
import { MAYOR_ROUTING_PROMPT_PREFIX } from "./mayor-persona";
import { isStructureMutationCommand } from "./structure-command-intent";
import { isStructureMutationCommandSemantic } from "./structure-command-semantic-gate";
import { resolveMainChamber } from "./workspace/resolve-main-chamber";
import { TECH_DEPARTMENT_BUILDING_ID } from "./workspace/tech-department";

/** routing_logs.routing_action value for Mayor structure-command gate. */
export function mayorRoutingLogAction(decision: MayorRoutingDecision): string {
  if (
    decision.matchedBy === "structure_command" ||
    decision.matchedBy === "structure_command_llm"
  ) {
    return "structure_delegate";
  }
  return decision.action;
}

async function delegateToTechDepartment(
  matchedBy: "structure_command" | "structure_command_llm",
  reasoning: string,
  trace: string[],
): Promise<MayorRoutingDecision> {
  const mainChamber = await resolveMainChamber(TECH_DEPARTMENT_BUILDING_ID);
  return {
    action: "delegate",
    target: TECH_DEPARTMENT_BUILDING_ID,
    matchedBy,
    confidence: 1,
    reasoning,
    trace,
    delegatedBuildingId: TECH_DEPARTMENT_BUILDING_ID,
    delegatedChamberId: mainChamber?.chamberRegistryId ?? null,
  };
}

/**
 * Resolve routing decision for Mayor given the user's task text.
 * Uses a cheap LLM (Groq or Gemini) to pick a building.
 * Returns a concrete MayorRoutingDecision object.
 */
export async function resolveRoutingDecision(
  taskText: string,
  buildings: Array<{ id: string; name: string; routing_description?: string | null }>,
): Promise<MayorRoutingDecision> {
  // If there are no buildings, answer self.
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
      "structure_command",
      "Structure mutation command detected before semantic routing — delegate to Tech Department",
      ["structure_command_gate", "tech_department"],
    );
  }

  if (await isStructureMutationCommandSemantic(taskText)) {
    return delegateToTechDepartment(
      "structure_command_llm",
      "Structure mutation command detected by LLM semantic gate — delegate to Tech Department",
      ["structure_command_llm_gate", "tech_department"],
    );
  }

  const buildingList = buildings
    .map((b) => `- ID: ${b.id}, Name: ${b.name}, Description: ${b.routing_description ?? "No description"}`)
    .join("\n");
  const prompt = `${MAYOR_ROUTING_PROMPT_PREFIX}

- action: "answer_self" or "delegate"
- target (optional): the building ID if delegating
- matchedBy: "explicit_name" if the user explicitly mentioned the building name, otherwise "semantic"
- confidence: number between 0 and 1
- reasoning: short human readable explanation
- trace: array of strings describing steps taken (for debugging)

Available buildings:\n${buildingList}\n\nUser request: \"${taskText}\"\n\nRespond with JSON only.`;

  let responseText = "";
  if (process.env.GROQ_API_KEY) {
    const apiKey = process.env.GROQ_API_KEY;
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Groq API returned status ${response.status}`);
    }
    responseText = data.choices?.[0]?.message?.content || "";
  } else if (process.env.GOOGLE_API_KEY) {
    const apiKey = process.env.GOOGLE_API_KEY;
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Gemini API returned status ${response.status}`);
    }
    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error("No cheap LLM API key configured for routing decision");
  }

  try {
    const jsonMatch = responseText.trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    const parsed = JSON.parse(jsonMatch[0]);
    const decision: MayorRoutingDecision = {
      action: parsed.action === "delegate" ? "delegate" : "answer_self",
      target: parsed.target || undefined,
      matchedBy: parsed.matchedBy === "explicit_name" ? "explicit_name" : "semantic",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      reasoning: parsed.reasoning || "",
      trace: Array.isArray(parsed.trace) ? parsed.trace.map(String) : [],
    };
    if (decision.action === "delegate" && (!decision.target || decision.confidence < 0.4)) {
      return {
        action: "answer_self",
        matchedBy: decision.matchedBy,
        confidence: decision.confidence,
        reasoning: "Low confidence or missing target – fallback to self",
        trace: [...decision.trace, "fallback_low_confidence"],
      };
    }
    if (decision.action === "delegate" && decision.target) {
      const mainChamber = await resolveMainChamber(decision.target);
      decision.delegatedBuildingId = decision.target;
      decision.delegatedChamberId = mainChamber?.chamberRegistryId ?? null;
    }
    return decision;
  } catch (e) {
    return {
      action: "answer_self",
      matchedBy: "semantic",
      confidence: 0,
      reasoning: `Failed to parse LLM response: ${e instanceof Error ? e.message : String(e)}`,
      trace: ["parse_error"],
    };
  }
}
