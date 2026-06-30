import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";
import type { RouteCandidate, RouteDecision, RoutingScoreDetail, MayorRoutingDecision } from "./office-types";
import { mayorRoutingLogAction } from "./mayor-routing";
import type { ExecutionMode } from "./execution-mode";
import { invokeCheapLLM } from "./cheap-llm";
import { insertLlmUsageLog } from "./llm-usage-log";
import { extractRawUsage } from "./tokens";

const GENERAL_INTAKE_ID = "c0000000-0000-4000-8000-000000000000";
const CITY_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

/**
 * Extract and parse JSON response from LLM router.
 */
function parseLlmResponse(text: string, validIds: string[]): RouteCandidate[] | null {
  try {
    const trimmed = text.trim();
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || !Array.isArray(parsed.selections)) return null;

    const candidates: RouteCandidate[] = [];
    for (const sel of parsed.selections) {
      if (typeof sel.id === "string" && typeof sel.confidence === "number") {
        // Enforce valid UUID referencing existing targets
        if (validIds.includes(sel.id)) {
          candidates.push({
            entityRegistryId: sel.id,
            confidence: sel.confidence,
            reason: typeof sel.reason === "string" ? sel.reason : "LLM selection",
          });
        }
      }
    }

    return candidates.length > 0 ? candidates : null;
  } catch {
    return null;
  }
}

/**
 * Helper to query Claude LLM router (expensive fallback).
 */
async function callClaudeRouter(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-sonnet-latest",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    }),
  });

  const data = await response.json();
  const rawUsage = extractRawUsage("anthropic", data);
  if (!response.ok) {
    if (rawUsage != null) {
      await insertLlmUsageLog({
        provider: "anthropic",
        modelId: "claude-3-5-sonnet-latest",
        purpose: "claude_router",
        rawUsage,
        error: data.error?.message || `Claude API returned status ${response.status}`,
      });
    }
    throw new Error(data.error?.message || `Claude API returned status ${response.status}`);
  }

  await insertLlmUsageLog({
    provider: "anthropic",
    modelId: "claude-3-5-sonnet-latest",
    purpose: "claude_router",
    rawUsage: rawUsage ?? null,
  });

  const content = data.content?.[0]?.text;
  if (!content) throw new Error("Claude returned empty response");
  return content;
}

function ruleLabel(rule: { id: string; condition_type: string; condition_value: string }): string {
  return `${rule.id}:${rule.condition_type}='${rule.condition_value}'`;
}

function buildRuleScoreDetail(
  rules: Array<{
    id: string;
    condition_type: string;
    condition_value: string;
    target_entity_registry_id: string;
    priority: number;
  }>,
  taskText: string,
  attachedFileType?: string,
): { candidates: RouteCandidate[]; scoreDetail: RoutingScoreDetail } {
  const matchedCandidates: RouteCandidate[] = [];
  const matchedRules: string[] = [];
  const matchedKeywords: string[] = [];

  for (const rule of rules) {
    let isMatch = false;

    if (rule.condition_type === "file_extension" && attachedFileType) {
      const c1 = rule.condition_value.toLowerCase().replace(/^\./, "");
      const c2 = attachedFileType.toLowerCase().replace(/^\./, "");
      isMatch = c1 === c2;
      if (isMatch) matchedKeywords.push(rule.condition_value);
    } else if (rule.condition_type === "keyword") {
      isMatch = taskText.toLowerCase().includes(rule.condition_value.toLowerCase());
      if (isMatch) matchedKeywords.push(rule.condition_value);
    } else if (rule.condition_type === "length_threshold") {
      const limit = parseInt(rule.condition_value, 10);
      isMatch = !isNaN(limit) && taskText.length >= limit;
    } else if (rule.condition_type === "explicit_entity") {
      isMatch = taskText.toLowerCase().includes(rule.condition_value.toLowerCase());
      if (isMatch) matchedKeywords.push(rule.condition_value);
    }

    if (isMatch) {
      matchedRules.push(ruleLabel(rule));
      const confidence = Math.min(1.0, 0.5 + rule.priority * 0.05);
      matchedCandidates.push({
        entityRegistryId: rule.target_entity_registry_id,
        confidence,
        reason: `Rule-based match: ${rule.condition_type} = '${rule.condition_value}'`,
      });
    }
  }

  matchedCandidates.sort((a, b) => b.confidence - a.confidence);

  return {
    candidates: matchedCandidates,
    scoreDetail: { matchedRules, matchedKeywords, llmReason: null },
  };
}

async function finalizeDecision(
  taskText: string,
  decision: RouteDecision,
  conns: Array<{ id: string; target_entity_id: string }> | null | undefined,
  sourceEntityId?: string,
): Promise<RouteDecision> {
  const chosenTargetId = decision.targets[0]?.entityRegistryId ?? null;
  const logId = await logRoutingDecision(
    taskText,
    chosenTargetId,
    decision.targets,
    decision.method,
    decision.agentCount,
  );
  decision.routingLogId = logId ?? undefined;

  if (chosenTargetId) {
    const supabase = getSupabaseAdmin();
    const matchedConn = conns?.find((c) => c.target_entity_id === chosenTargetId);
    if (matchedConn) {
      decision.usedConnectionId = matchedConn.id;
      if (sourceEntityId) {
        decision.routeViaEntityId = sourceEntityId;
      }
      try {
        await supabase.from("connection_logs").insert({
          connection_id: matchedConn.id,
          payload_type: "task",
          summary: `Forwarded task to registry ID: ${chosenTargetId}`,
        });
      } catch (logErr) {
        console.warn("Failed to insert task connection log:", logErr);
      }
    }
  }
  return decision;
}

function intakeFallbackDecision(reason: string): RouteDecision {
  return {
    targets: [{ entityRegistryId: GENERAL_INTAKE_ID, confidence: 1.0, reason }],
    method: "fallback",
    agentCount: 0,
  };
}

function canUseGeneralIntake(
  sourceEntityId: string | undefined,
  allowedTargetIds: string[],
): boolean {
  return !sourceEntityId || allowedTargetIds.includes(GENERAL_INTAKE_ID);
}

/**
 * resolveRoute - Determines which department/agent should handle the user request.
 * Pure business logic with tiered fallback and RLS logging.
 */
export async function resolveRoute(
  taskText: string,
  attachedFileType?: string,
  sourceEntityId?: string,
  officeId?: string,
): Promise<RouteDecision> {
  const defaultIntakeDecision: RouteDecision = {
    targets: [{ entityRegistryId: GENERAL_INTAKE_ID, confidence: 1.0, reason: "fallback" }],
    method: "rule-based",
    agentCount: 0,
  };

  if (!isSupabaseConfigured()) {
    console.warn("Supabase not configured, defaulting to General Intake.");
    return finalizeDecision(taskText, defaultIntakeDecision, null, sourceEntityId);
  }

  const supabase = getSupabaseAdmin();

  // 0. Fetch allowed horizontal target IDs if sourceEntityId is provided
  let allowedTargetIds: string[] = [];
  let conns: any[] | null = null;
  if (sourceEntityId) {
    try {
      const { data } = await supabase
        .from("connections")
        .select("id, target_entity_id, connection_permissions(send_tasks)")
        .eq("source_entity_id", sourceEntityId)
        .eq("is_active", true);
      
      conns = data;
      allowedTargetIds = (data || [])
        .filter((c: any) => c.connection_permissions?.send_tasks === true)
        .map((c: any) => c.target_entity_id);
    } catch (err) {
      console.error("Failed to fetch allowed forwarding connections:", err);
    }
  }

  try {
    // 1. Fetch routing rules from DB
    const { data: rules, error: rulesErr } = await supabase
      .from("routing_rules")
      .select("*");

    if (rulesErr) {
      console.warn("Failed to fetch routing rules:", rulesErr.message);
    }

    // 2. Rule-Based routing match
    const { candidates: matchedCandidates, scoreDetail: ruleScoreDetail } =
      rules && rules.length > 0
        ? buildRuleScoreDetail(rules, taskText, attachedFileType)
        : {
            candidates: [] as RouteCandidate[],
            scoreDetail: { matchedRules: [], matchedKeywords: [], llmReason: null },
          };

    if (matchedCandidates.length > 0) {
      if (matchedCandidates[0].confidence >= 0.8) {
        const filteredCandidates = sourceEntityId
          ? matchedCandidates.filter((c) => allowedTargetIds.includes(c.entityRegistryId))
          : matchedCandidates;

        if (filteredCandidates.length > 0) {
          return finalizeDecision(
            taskText,
            {
              targets: filteredCandidates,
              method: "rule-based",
              agentCount: 0,
              scoreDetail: ruleScoreDetail,
            },
            conns,
            sourceEntityId,
          );
        }
      }
    }

    // 3. Heuristic checks for simple conversational query
    const cleanText = taskText.trim().toLowerCase();
    const conversationalRegex = /(?:^|[^a-zа-яё0-9])(привет|здравствуй|хай|ку|как дела|что делаешь|посоветуй что|че делаешь|hello|hi|how are you|what to do|recommend|help)(?:$|[^a-zа-яё0-9])/i;
    if (taskText.length < 60 && (conversationalRegex.test(cleanText) || taskText.length < 15)) {
      if (sourceEntityId && !allowedTargetIds.includes(GENERAL_INTAKE_ID)) {
        return finalizeDecision(
          taskText,
          { targets: [], method: "fallback-blocked", agentCount: 0 },
          conns,
          sourceEntityId,
        );
      }

        return finalizeDecision(
          taskText,
          {
            targets: [{ entityRegistryId: GENERAL_INTAKE_ID, confidence: 1.0, reason: "Conversational heuristic fallback" }],
            method: "rule-based",
            agentCount: 0,
            scoreDetail: {
              matchedRules: ["conversational-heuristic"],
              matchedKeywords: [],
            llmReason: null,
          },
        },
        conns,
        sourceEntityId,
      );
    }

    // 4. LLM Routing - Fetch available buildings and chambers
    const { data: registryEntities } = await supabase
      .from("entity_registry")
      .select("id, name, entity_type, routing_description")
      .in("entity_type", ["building", "chamber"]);

    let targetsList = registryEntities || [];
    
    // Filter the candidates that cheap LLM can see based on allowed connections
    if (sourceEntityId) {
      targetsList = targetsList.filter((t) => allowedTargetIds.includes(t.id));
    }

    const validIds = [...targetsList.map((t) => t.id), GENERAL_INTAKE_ID, CITY_ID];

    // Compile router prompt
    const prompt = `You are an AI task router in a municipal office city-simulation. Your job is to route the user's task to the most appropriate department (chamber or building).

Available departments/targets:
${targetsList
  .map((t) => `- ID: ${t.id}, Type: ${t.entity_type}, Name: ${t.name}, Description: ${t.routing_description || "No description"}`)
  .join("\n")}
${(!sourceEntityId || allowedTargetIds.includes(GENERAL_INTAKE_ID)) ? `- ID: ${GENERAL_INTAKE_ID}, Type: chamber, Name: General Intake, Description: Default fallback for general conversation, greetings, unknown topics, or when no other specific department matches.` : ''}

User Task: "${taskText}"

Analyze the task and choose the best fit department from the list above. Respond ONLY with a valid JSON object matching this structure:
{
  "selections": [
    {
      "id": "target-registry-uuid",
      "confidence": 0.85,
      "reason": "Explain briefly why this department matches the task"
    }
  ]
}
If no specific department matches well, select General Intake ID "${GENERAL_INTAKE_ID}" with confidence 1.0.`;

    // Tier 1: Cheap LLM routing (Groq or Gemini)
    let llmResponse = "";
    let methodUsed: "llm-cheap" | "llm-expensive" = "llm-cheap";

    // Only attempt LLM routing if there are potential targets to route to
    if (targetsList.length > 0 || !sourceEntityId || allowedTargetIds.includes(GENERAL_INTAKE_ID)) {
      try {
        llmResponse = await invokeCheapLLM({
          purpose: "city-router",
          prompt,
          responseFormat: "json",
          officeId,
        });
      } catch (cheapErr) {
        console.warn("Cheap LLM router failed, escalating to expensive:", (cheapErr as Error).message);
        methodUsed = "llm-expensive";
      }

      let selections: RouteCandidate[] | null = null;
      if (llmResponse) {
        selections = parseLlmResponse(llmResponse, validIds);
      }

      // Tier 2: Expensive LLM routing (Claude) if cheap failed or was invalid
      if (!selections || selections.length === 0 || selections[0].confidence < 0.3) {
        methodUsed = "llm-expensive";
        try {
          console.log("Calling Claude for router escalation...");
          const expensiveResponse = await callClaudeRouter(prompt);
          selections = parseLlmResponse(expensiveResponse, validIds);
        } catch (expensiveErr) {
          console.error("Expensive LLM router failed:", (expensiveErr as Error).message);
        }
      }

      // 5. Finalize selections
      let finalTargets = selections || [];
      
      if (finalTargets.length === 0 && (!sourceEntityId || allowedTargetIds.includes(GENERAL_INTAKE_ID))) {
        finalTargets = defaultIntakeDecision.targets;
      }

      // Apply sourceEntityId filter to the final output to be double-safe
      if (sourceEntityId) {
        finalTargets = finalTargets.filter((t) => allowedTargetIds.includes(t.entityRegistryId));
      }

      const decision: RouteDecision = {
        targets: finalTargets,
        method: methodUsed,
        agentCount: 0,
        scoreDetail: {
          matchedRules: [],
          matchedKeywords: [],
          llmReason: finalTargets[0]?.reason ?? null,
        },
      };

      return finalizeDecision(taskText, decision, conns, sourceEntityId);
    } else {
      if (canUseGeneralIntake(sourceEntityId, allowedTargetIds)) {
        return finalizeDecision(
          taskText,
          intakeFallbackDecision("No LLM routing target — General Intake"),
          conns,
          sourceEntityId,
        );
      }
      return finalizeDecision(
        taskText,
        { targets: [], method: "fallback-blocked", agentCount: 0 },
        conns,
        sourceEntityId,
      );
    }
  } catch (err) {
    console.error("Error in resolveRoute, falling back to General Intake:", err);
    if (!canUseGeneralIntake(sourceEntityId, allowedTargetIds)) {
      return finalizeDecision(
        taskText,
        { targets: [], method: "fallback-blocked", agentCount: 0 },
        conns,
        sourceEntityId,
      );
    }
    return finalizeDecision(taskText, defaultIntakeDecision, conns, sourceEntityId);
  }
}

export async function updateRoutingLogAgentCount(
  routingLogId: string,
  agentCount: number,
  executionMode?: ExecutionMode,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const patch: { agent_count: number; execution_mode?: ExecutionMode } = {
      agent_count: agentCount,
    };
    if (executionMode) {
      patch.execution_mode = executionMode;
    }
    const { error } = await supabase.from("routing_logs").update(patch).eq("id", routingLogId);
    if (error) {
      console.error("Failed to update routing_logs.agent_count:", error.message);
    }
  } catch (err) {
    console.error("Failed to update routing_logs.agent_count:", err);
  }
}

/**
 * Log a direct agent chat (bypasses Mayor semantic routing). Best effort.
 */
export async function logDirectAgentRoutingDecision(params: {
  taskText: string;
  directAgentId: string;
  directTargetEntityId: string;
  agentCount?: number;
}): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("routing_logs")
      .insert({
        task_text: params.taskText,
        method: "direct_agent",
        agent_count: params.agentCount ?? 1,
        outcome: "unrated",
        execution_mode: "fast",
        routing_action: "direct_agent",
        routing_matched_by: "direct_agent",
        routing_reasoning: "Direct agent chat — bypasses Mayor semantic routing",
        routing_trace: ["direct_agent"],
        direct_agent_id: params.directAgentId,
        direct_target_entity_id: params.directTargetEntityId,
        all_candidates: [],
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to write direct agent routing_log:", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error("Failed to write direct agent routing_log:", err);
    return null;
  }
}

/**
 * Log the routing decision to routing_logs. Best effort, never blocks execution.
 */
async function logRoutingDecision(
  taskText: string,
  chosenTargetId: string | null,
  allCandidates: RouteCandidate[],
  method: string,
  agentCount: number,
  executionMode?: ExecutionMode,
): Promise<string | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("routing_logs")
      .insert({
        task_text: taskText,
        chosen_target_entity_registry_id: chosenTargetId,
        all_candidates: allCandidates,
        method,
        agent_count: agentCount,
        outcome: "unrated",
        ...(executionMode ? { execution_mode: executionMode } : {}),
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to write to routing_logs:", error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error("Failed to write to routing_logs:", err);
    return null;
  }
}

/**
 * Log the Mayor's routing decision. Best effort.
 */
export async function logMayorRoutingDecision(
  routingLogId: string,
  decision: MayorRoutingDecision,
  delegatedAgentId: string | null,
  delegatedAnswer: string | null,
  summaryApplied: boolean,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("routing_logs")
      .update({
        routing_action: mayorRoutingLogAction(decision),
        routing_matched_by: decision.matchedBy,
        routing_confidence: decision.confidence,
        routing_reasoning: decision.reasoning,
        routing_trace: decision.trace,
        delegated_building_id: decision.delegatedBuildingId ?? null,
        delegated_chamber_id: decision.delegatedChamberId ?? null,
        delegated_agent_id: delegatedAgentId,
        delegated_answer: delegatedAnswer,
        summary_applied: summaryApplied,
      })
      .eq("id", routingLogId);

    if (error) {
      console.error("Failed to update mayor routing log:", error.message);
    }
  } catch (err) {
    console.error("Failed to update mayor routing log:", err);
  }
}
