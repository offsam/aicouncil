import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "./ai-council-ids";
import { OPENROUTER_MODEL_BY_SLUG } from "./openrouter-free";

/** Isolated building label — never used by production departments. */
export const W4W9_TEST_BUILDING_LABEL = "W4 W9 Test Isolated";

export const W4W9_TEST_CHAMBER_PRIMARY = "Test Test Test Test";
export const W4W9_TEST_CHAMBER_SECONDARY = "Test Test Test Test B";
export const W4W9_TEST_CHAMBER_TERTIARY = "Test Test Test Test C";

export const W4W9_TEST_AGENT_A_NAME = "W4-W9 Test Agent A";
export const W4W9_TEST_AGENT_B_NAME = "W4-W9 Test Agent B";

/** Smallest OpenRouter :free model from existing fallback pool (or-mistral primary). */
export const W4W9_TEST_FREE_MODEL =
  OPENROUTER_MODEL_BY_SLUG["or-mistral"] ?? "liquid/lfm-2.5-1.2b-instruct:free";

export const W4W9_TEST_AGENT_A_ID = "e4090001-0001-4000-8000-000000000001";
export const W4W9_TEST_AGENT_B_ID = "e4090002-0002-4000-8000-000000000002";

export const W4W9_TEST_ROUTING_DESCRIPTION =
  "W4/W9 isolated test chamber: Instagram captions, social media posts, short marketing copy for Instagram. Evidence only.";

export type W4W9TestChamber = {
  id: string;
  name: string;
  entity_registry_id: string;
};

export type W4W9TestInfra = {
  buildingId: string;
  chambers: {
    primary: W4W9TestChamber;
    secondary: W4W9TestChamber;
    tertiary: W4W9TestChamber;
  };
  agents: {
    a: { id: string; name: string };
    b: { id: string; name: string };
  };
};

async function findBuilding(supabase: SupabaseClient): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from("office_objects")
    .select("id")
    .eq("office_id", AI_COUNCIL_OFFICE_ID)
    .eq("object_type", "room")
    .eq("label", W4W9_TEST_BUILDING_LABEL)
    .maybeSingle();
  return data?.id ? { id: data.id } : null;
}

async function ensureBuilding(
  supabase: SupabaseClient,
  base: string,
): Promise<string> {
  const existing = await findBuilding(supabase);
  if (existing) return existing.id;

  const res = await fetch(`${base}/api/offices/${AI_COUNCIL_OFFICE_ID}/objects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      object_type: "room",
      label: W4W9_TEST_BUILDING_LABEL,
      routing_description: W4W9_TEST_ROUTING_DESCRIPTION,
      position_x: 52,
      position_z: 52,
      size_w: 10,
      size_d: 8,
    }),
  });
  const body = (await res.json()) as { object?: { id: string }; error?: string };
  if (!res.ok || !body.object?.id) {
    throw new Error(body.error ?? "Failed to create W4/W9 test building");
  }
  return body.object.id;
}

async function ensureChamber(
  supabase: SupabaseClient,
  base: string,
  buildingId: string,
  name: string,
  routingDescription?: string,
): Promise<W4W9TestChamber> {
  const { data: existing } = await supabase
    .from("chambers")
    .select("id, name, entity_registry_id")
    .eq("building_object_id", buildingId)
    .eq("name", name)
    .maybeSingle();

  if (existing?.entity_registry_id) {
    if (routingDescription) {
      await fetch(
        `${base}/api/offices/${AI_COUNCIL_OFFICE_ID}/buildings/${buildingId}/chambers/${existing.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ routing_description: routingDescription }),
        },
      );
    }
    return {
      id: existing.id,
      name: existing.name,
      entity_registry_id: existing.entity_registry_id,
    };
  }

  const res = await fetch(
    `${base}/api/offices/${AI_COUNCIL_OFFICE_ID}/buildings/${buildingId}/chambers`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        x: 1,
        z: 1,
        width: 3,
        depth: 3,
        ...(routingDescription ? { routing_description: routingDescription } : {}),
      }),
    },
  );
  const body = (await res.json()) as {
    chamber?: { id: string; name: string; entity_registry_id: string };
    error?: string;
  };
  if (!res.ok || !body.chamber?.entity_registry_id) {
    throw new Error(body.error ?? `Failed to create chamber ${name}`);
  }
  return {
    id: body.chamber.id,
    name: body.chamber.name,
    entity_registry_id: body.chamber.entity_registry_id,
  };
}

async function ensureTestAgent(
  supabase: SupabaseClient,
  spec: {
    id: string;
    name: string;
    slug: string;
    modelId: string;
    chamberRegistryId: string;
  },
): Promise<{ id: string; name: string }> {
  const { data: existing } = await supabase
    .from("agents")
    .select("id, name")
    .eq("id", spec.id)
    .maybeSingle();

  if (!existing) {
    const { error } = await supabase.from("agents").insert({
      id: spec.id,
      office_id: AI_COUNCIL_OFFICE_ID,
      name: spec.name,
      provider: "openrouter",
      model_id: spec.modelId,
      status: "offline",
      cost_tier: "free",
    });
    if (error) throw new Error(`agent insert ${spec.name}: ${error.message}`);
  } else {
    await supabase
      .from("agents")
      .update({
        name: spec.name,
        provider: "openrouter",
        model_id: spec.modelId,
        cost_tier: "free",
        office_id: AI_COUNCIL_OFFICE_ID,
      })
      .eq("id", spec.id);
  }

  const { data: regExisting } = await supabase
    .from("entity_registry")
    .select("id")
    .eq("id", spec.id)
    .maybeSingle();

  if (regExisting) {
    await supabase
      .from("entity_registry")
      .update({
        name: spec.name,
        slug: spec.slug,
        parent_entity_id: spec.chamberRegistryId,
      })
      .eq("id", spec.id);
  } else {
    await supabase.from("entity_registry").insert({
      id: spec.id,
      entity_type: "agent",
      name: spec.name,
      slug: spec.slug,
      parent_entity_id: spec.chamberRegistryId,
    });
  }

  return { id: spec.id, name: spec.name };
}

async function ensureAssignment(
  supabase: SupabaseClient,
  base: string,
  chamberId: string,
  agentId: string,
): Promise<void> {
  const { data: existing } = await supabase
    .from("agent_assignments")
    .select("id")
    .eq("chamber_id", chamberId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (existing?.id) return;

  const res = await fetch(`${base}/api/chambers/${chamberId}/assignments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId }),
  });
  if (res.ok) return;

  const body = (await res.json()) as { error?: string };
  const duplicate =
    res.status === 409 ||
    /duplicate key|already exists|agent_assignments_agent_id_chamber_id/i.test(body.error ?? "");
  if (duplicate) {
    const { data: again } = await supabase
      .from("agent_assignments")
      .select("id")
      .eq("chamber_id", chamberId)
      .eq("agent_id", agentId)
      .maybeSingle();
    if (again?.id) return;
  }
  throw new Error(body.error ?? "Failed to assign test agent");
}

/**
 * Idempotent W4/W9 isolated test fixtures (building + 3 chambers + 2 free OR agents).
 */
export async function ensureW4W9TestInfra(
  supabase: SupabaseClient,
  base = "http://localhost:3000",
): Promise<W4W9TestInfra> {
  const buildingId = await ensureBuilding(supabase, base);

  const primary = await ensureChamber(
    supabase,
    base,
    buildingId,
    W4W9_TEST_CHAMBER_PRIMARY,
    W4W9_TEST_ROUTING_DESCRIPTION,
  );
  const secondary = await ensureChamber(supabase, base, buildingId, W4W9_TEST_CHAMBER_SECONDARY);
  const tertiary = await ensureChamber(supabase, base, buildingId, W4W9_TEST_CHAMBER_TERTIARY);

  const gemmaModel =
    OPENROUTER_MODEL_BY_SLUG["or-gemma"] ?? "google/gemma-4-31b-it:free";

  const agentA = await ensureTestAgent(supabase, {
    id: W4W9_TEST_AGENT_A_ID,
    name: W4W9_TEST_AGENT_A_NAME,
    slug: "or-mistral",
    modelId: W4W9_TEST_FREE_MODEL,
    chamberRegistryId: primary.entity_registry_id,
  });
  const agentB = await ensureTestAgent(supabase, {
    id: W4W9_TEST_AGENT_B_ID,
    name: W4W9_TEST_AGENT_B_NAME,
    slug: "or-gemma",
    modelId: gemmaModel,
    chamberRegistryId: secondary.entity_registry_id,
  });

  await ensureAssignment(supabase, base, primary.id, agentA.id);
  await ensureAssignment(supabase, base, secondary.id, agentB.id);

  return {
    buildingId,
    chambers: { primary, secondary, tertiary },
    agents: { a: agentA, b: agentB },
  };
}

export function loadEnvLocal(): void {
  for (const line of require("fs").readFileSync(".env.local", "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
}
