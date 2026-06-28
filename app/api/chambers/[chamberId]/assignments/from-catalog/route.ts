import { NextRequest, NextResponse } from "next/server";
import type { CostTier } from "@/lib/cost-tier";
import { isCostTier } from "@/lib/cost-tier";
import { ensureAgentRegistry } from "@/lib/entity-registry-ensure";
import {
  agentCategoryFromSpecialization,
  getModelCatalog,
} from "@/lib/model-catalog/build-catalog";
import type { ModelGateway, ModelSpecialization } from "@/lib/model-catalog/types";
import { catalogOriginToAgentIcon } from "@/lib/agent-icon-ids";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

type RouteParams = { params: Promise<{ chamberId: string }> };

type FromCatalogBody = {
  gateway?: string;
  model_id?: string;
  cost_tier?: string;
  primary_specialization?: string;
};

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { chamberId } = await params;

  try {
    const body = (await request.json()) as FromCatalogBody;
    const gateway = body.gateway?.trim().toLowerCase() as ModelGateway | undefined;
    const modelId = body.model_id?.trim();

    if (!gateway || !modelId) {
      return NextResponse.json({ error: "gateway и model_id обязательны" }, { status: 400 });
    }

    const catalog = await getModelCatalog();
    const catalogEntry = catalog.find((m) => m.gateway === gateway && m.modelId === modelId);
    if (!catalogEntry) {
      return NextResponse.json({ error: "Модель не найдена в каталоге" }, { status: 404 });
    }

    const costTier = (isCostTier(body.cost_tier) ? body.cost_tier : catalogEntry.costTier) as CostTier;
    const primarySpec = (body.primary_specialization ??
      catalogEntry.primarySpecialization) as ModelSpecialization;

    const supabase = getSupabaseAdmin();

    const { data: chamber, error: chamberError } = await supabase
      .from("chambers")
      .select("entity_registry_id, building_entity_id")
      .eq("id", chamberId)
      .single();

    if (chamberError || !chamber) {
      return NextResponse.json({ error: "Chamber не найден" }, { status: 404 });
    }

    const iconId = catalogOriginToAgentIcon(catalogEntry.originProviderSlug);

    const { data: existingAgent } = await supabase
      .from("agents")
      .select("id, name, office_id")
      .eq("provider", gateway)
      .eq("model_id", modelId)
      .maybeSingle();

    let agentId = existingAgent?.id ?? null;

    if (!agentId) {
      const agentName = `${catalogEntry.originProvider} ${catalogEntry.displayName}`.slice(0, 120);
      const { data: created, error: createError } = await supabase
        .from("agents")
        .insert({
          name: agentName,
          provider: gateway,
          model_id: modelId,
          status: "offline",
          cost_tier: costTier,
          category: agentCategoryFromSpecialization(primarySpec),
          color: iconId,
        })
        .select("id, name, office_id")
        .single();

      if (createError || !created) {
        const hint =
          createError?.message?.includes("agents_cost_tier_check") && costTier === "cheap"
            ? " (БД constraint agents_cost_tier_check не принимает tier=cheap — отдельный баг миграции tier v2)"
            : "";
        return NextResponse.json(
          { error: `${createError?.message ?? "Не удалось создать агента"}${hint}` },
          { status: 500 },
        );
      }
      agentId = created.id;
    } else {
      await supabase.from("agents").update({ color: iconId }).eq("id", agentId);
    }

    const { data: duplicateAssignment } = await supabase
      .from("agent_assignments")
      .select("id")
      .eq("chamber_id", chamberId)
      .eq("agent_id", agentId)
      .maybeSingle();

    if (duplicateAssignment) {
      return NextResponse.json(
        { error: "Этот агент уже назначен в отдел", assignment_id: duplicateAssignment.id },
        { status: 409 },
      );
    }

    const { data: agentRow } = await supabase
      .from("agents")
      .select("id, name, office_id")
      .eq("id", agentId)
      .single();

    if (!agentRow) {
      return NextResponse.json({ error: "Agent не найден после создания" }, { status: 500 });
    }

    await ensureAgentRegistry(supabase, agentRow, chamber.entity_registry_id);

    const { data: assignment, error: assignError } = await supabase
      .from("agent_assignments")
      .insert({
        agent_id: agentId,
        chamber_id: chamberId,
        role: null,
      })
      .select(
        "id, agent_id, chamber_id, role, layout_x, layout_y, layout_size, created_at, agents(id, name, office_id, provider, model_id, status, cost_tier, color, created_at)",
      )
      .single();

    if (assignError) {
      return NextResponse.json({ error: assignError.message }, { status: 500 });
    }

    return NextResponse.json({ assignment, agent_id: agentId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
