import type { ManagerRoutingDecision } from "./office-types";
import { MANAGER_ROUTING_PROMPT_PREFIX } from "./agent-persona";

export type ManagerRoutingChamber = {
  id: string;
  name: string;
  routing_description?: string | null;
};

function chamberDescription(chamber: ManagerRoutingChamber): string {
  const desc = chamber.routing_description?.trim();
  if (desc) return desc;
  return chamber.name;
}

/**
 * Resolve internal routing for a building Manager: answer_self or delegate to an internal chamber.
 * Skips LLM when there are no internal chambers (always answer_self).
 */
export async function resolveManagerRoutingDecision(
  taskText: string,
  buildingRegistryId: string,
  managerChamberRegistryId: string,
  internalChambers: ManagerRoutingChamber[],
): Promise<ManagerRoutingDecision> {
  const base = {
    buildingId: buildingRegistryId,
    managerChamberId: managerChamberRegistryId,
  };

  if (!internalChambers.length) {
    return {
      ...base,
      action: "answer_self",
      matchedBy: "semantic",
      confidence: 1,
      reasoning: "No internal chambers in building — Manager answers directly",
      trace: ["no_internal_chambers"],
    };
  }

  const chamberList = internalChambers
    .map(
      (c) =>
        `- ID: ${c.id}, Name: ${c.name}, Description: ${chamberDescription(c)}`,
    )
    .join("\n");

  const prompt = `${MANAGER_ROUTING_PROMPT_PREFIX}

- action: "answer_self" or "delegate"
- target (optional): the internal chamber ID if delegating
- matchedBy: "explicit_name" if the user explicitly mentioned the department/chamber name, otherwise "semantic"
- confidence: number between 0 and 1
- reasoning: short human readable explanation
- trace: array of strings describing steps taken (for debugging)

Available internal departments:
${chamberList}

User request: "${taskText}"

Respond with JSON only.`;

  let responseText = "";
  if (process.env.GROQ_API_KEY) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
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
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Gemini API returned status ${response.status}`);
    }
    responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    throw new Error("No cheap LLM API key configured for manager routing decision");
  }

  const validIds = new Set(internalChambers.map((c) => c.id));

  try {
    const jsonMatch = responseText.trim().match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }
    const parsed = JSON.parse(jsonMatch[0]);
    const decision: ManagerRoutingDecision = {
      ...base,
      action: parsed.action === "delegate" ? "delegate" : "answer_self",
      target: parsed.target || undefined,
      matchedBy: parsed.matchedBy === "explicit_name" ? "explicit_name" : "semantic",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
      reasoning: parsed.reasoning || "",
      trace: Array.isArray(parsed.trace) ? parsed.trace.map(String) : [],
    };

    if (decision.action === "delegate" && decision.target && validIds.has(decision.target)) {
      decision.delegatedChamberId = decision.target;
    } else if (decision.action === "delegate") {
      return {
        ...decision,
        action: "answer_self",
        target: undefined,
        delegatedChamberId: null,
        reasoning: "Invalid or missing internal target — fallback to Manager",
        trace: [...decision.trace, "fallback_invalid_target"],
      };
    }

    if (decision.action === "delegate" && (!decision.target || decision.confidence < 0.4)) {
      return {
        ...decision,
        action: "answer_self",
        target: undefined,
        delegatedChamberId: null,
        reasoning: "Low confidence or missing target — fallback to Manager",
        trace: [...decision.trace, "fallback_low_confidence"],
      };
    }

    return decision;
  } catch (e) {
    return {
      ...base,
      action: "answer_self",
      matchedBy: "semantic",
      confidence: 0,
      reasoning: `Failed to parse LLM response: ${e instanceof Error ? e.message : String(e)}`,
      trace: ["parse_error"],
      delegatedChamberId: null,
    };
  }
}
