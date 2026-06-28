import { getSupabaseAdmin } from "../supabase/admin";
import { requireExternalEntryOfficeId } from "../workspace/graph-identity-required";
import type { StructureAction, TechStructurePlan } from "./structure-types";

async function callCheapLLM(prompt: string): Promise<string> {
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
      throw new Error(data.error?.message || `Groq API ${response.status}`);
    }
    return data.choices?.[0]?.message?.content || "";
  }

  if (process.env.GOOGLE_API_KEY) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      },
    );
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error?.message || `Gemini API ${response.status}`);
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  throw new Error("No cheap LLM key configured for structure planning");
}

function parseActions(raw: unknown): StructureAction[] {
  if (!Array.isArray(raw)) return [];
  const actions: StructureAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = row.type;
    const description = String(row.description ?? "").trim() || "Действие";
    const ref = row.ref != null ? String(row.ref) : undefined;

    if (type === "create_building") {
      const label = String(row.label ?? "").trim();
      const routing_description = String(row.routing_description ?? "").trim();
      if (!label || !routing_description) continue;
      actions.push({
        type: "create_building",
        ref,
        description,
        label,
        routing_description,
        position_x: typeof row.position_x === "number" ? row.position_x : undefined,
        position_z: typeof row.position_z === "number" ? row.position_z : undefined,
        size_w: typeof row.size_w === "number" ? row.size_w : undefined,
        size_d: typeof row.size_d === "number" ? row.size_d : undefined,
        color: row.color != null ? String(row.color) : undefined,
      });
    } else if (type === "create_chamber") {
      const building_ref = String(row.building_ref ?? "").trim();
      const name = String(row.name ?? "").trim();
      if (!building_ref || !name) continue;
      actions.push({
        type: "create_chamber",
        ref,
        description,
        building_ref,
        name,
        routing_description:
          row.routing_description != null ? String(row.routing_description) : undefined,
        x: typeof row.x === "number" ? row.x : undefined,
        z: typeof row.z === "number" ? row.z : undefined,
        width: typeof row.width === "number" ? row.width : undefined,
        depth: typeof row.depth === "number" ? row.depth : undefined,
        routing_role: row.routing_role === "main" ? "main" : null,
      });
    } else if (type === "create_connection") {
      const source_ref = String(row.source_ref ?? "").trim();
      const target_ref = String(row.target_ref ?? "").trim();
      if (!source_ref || !target_ref) continue;
      actions.push({
        type: "create_connection",
        ref,
        description,
        source_ref,
        target_ref,
        read_knowledge: row.read_knowledge === true,
        read_rules: row.read_rules === true,
        read_results: row.read_results === true,
        send_tasks: row.send_tasks === true,
      });
    } else if (type === "assign_agent") {
      const agent_id = String(row.agent_id ?? "").trim();
      const chamber_ref = String(row.chamber_ref ?? "").trim();
      if (!agent_id || !chamber_ref) continue;
      actions.push({
        type: "assign_agent",
        ref,
        description,
        agent_id,
        chamber_ref,
        role: row.role != null ? String(row.role) : "member",
      });
    }
  }
  return actions;
}

function formatActionList(actions: StructureAction[]): string {
  return actions.map((a, i) => `${i + 1}. [${a.type}] ${a.description}`).join("\n");
}

/**
 * Parse user command into a pending structure plan (no DB writes except plan storage).
 */
export async function createTechStructurePlan(taskText: string): Promise<TechStructurePlan> {
  const supabase = getSupabaseAdmin();
  const officeId = await requireExternalEntryOfficeId();

  const [{ data: buildings }, { data: chambers }, { data: agents }] = await Promise.all([
    supabase
      .from("entity_registry")
      .select("id, name, slug, routing_description")
      .eq("entity_type", "building"),
    supabase
      .from("entity_registry")
      .select("id, name, slug, parent_entity_id, routing_description")
      .eq("entity_type", "chamber"),
    supabase.from("agents").select("id, name, provider").eq("office_id", officeId),
  ]);

  const prompt = `You are the Tech Department planner. The user wants to change system structure. Produce a JSON object ONLY:
{
  "summary": "human-readable plan in Russian for user confirmation",
  "actions": [
    {
      "type": "create_building" | "create_chamber" | "create_connection" | "assign_agent",
      "ref": "$optionalRef",
      "description": "what this step does",
      ... type-specific fields ...
    }
  ]
}

Rules:
- Use refs ($building1, $chamber1) for entities created in the same plan; reference existing entities by UUID.
- Safe order in actions array: create_building → create_chamber → assign_agent → create_connection.
- Do NOT include destructive actions.
- create_building requires: label, routing_description. Default position_x=20, position_z=20, size_w=18, size_d=15.
- create_chamber requires: building_ref, name. Optional routing_description, routing_role="main" only for first/main chamber.
- create_connection requires: source_ref, target_ref (entity registry ids).
- assign_agent requires: agent_id (UUID), chamber_ref.

Existing buildings:
${(buildings ?? []).map((b) => `- ${b.id} ${b.name}: ${b.routing_description ?? ""}`).join("\n")}

Existing chambers:
${(chambers ?? []).map((c) => `- ${c.id} ${c.name} parent=${c.parent_entity_id}`).join("\n")}

Available agents:
${(agents ?? []).map((a) => `- ${a.id} ${a.name} (${a.provider})`).join("\n")}

User command: "${taskText.replace(/"/g, '\\"')}"`;

  const responseText = await callCheapLLM(prompt);
  const jsonMatch = responseText.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Planner did not return JSON");
  }

  const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; actions?: unknown };
  const actions = parseActions(parsed.actions);
  if (actions.length === 0) {
    throw new Error("Planner returned empty action list");
  }

  const summary =
    String(parsed.summary ?? "").trim() ||
    `План из ${actions.length} шагов:\n${formatActionList(actions)}`;

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { data: row, error } = await supabase
    .from("tech_structure_plans")
    .insert({
      task_text: taskText,
      plan_summary: summary,
      actions,
      status: "pending",
      expires_at: expiresAt,
    })
    .select("id, expires_at")
    .single();

  if (error || !row) {
    throw new Error(error?.message ?? "Failed to store structure plan");
  }

  return {
    planId: row.id,
    taskText,
    summary,
    actions,
    expiresAt: row.expires_at ?? expiresAt,
  };
}

export function formatStructurePlanForUser(plan: TechStructurePlan): string {
  const lines = [
    "Технический отдел подготовил план изменений. Подтвердите выполнение:",
    "",
    plan.summary,
    "",
    "Детали:",
    ...plan.actions.map((a, i) => `${i + 1}. ${a.description}`),
    "",
    "Без подтверждения изменения в базу не вносятся.",
  ];
  return lines.join("\n");
}
