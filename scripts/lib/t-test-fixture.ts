/**
 * Creates read-only-safe test entities prefixed with t_ (additive only).
 */
import * as fs from "fs";
import * as path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_COUNCIL_OFFICE_ID } from "../../lib/ai-council-ids";
import { seedDefaultChamberRoster } from "../../lib/chamber-default-roster";
import {
  ensureBuildingRegistry,
  resolveUniqueChamberSlug,
} from "../../lib/entity-registry-ensure";
import { NEW_CONNECTION_PERMISSIONS } from "../../lib/workspace/workspace-connections";

export type CreatedChamber = {
  chamberId: string;
  registryId: string;
  name: string;
  routingRole: "main" | "internal";
};

export type CreatedBuilding = {
  objectId: string;
  registryId: string;
  label: string;
  mainChamber: CreatedChamber;
  internalChambers: CreatedChamber[];
};

export type TestFixture = {
  tag: string;
  cactusShop: CreatedBuilding;
  emptyShell: CreatedBuilding;
  freeOnlyChamber: CreatedChamber;
  fullRosterChamber: CreatedChamber;
  connectionId: string | null;
  knowledgeEntryIds: string[];
};

const FIXTURE_LABELS = {
  cactusShop: "t_Кактусовая_Лавка",
  emptyShell: "t_Пустышка",
  freeOnlyBuilding: "t_ТолькоФри_Башня",
} as const;

async function findBuildingByLabel(
  supabase: SupabaseClient,
  label: string,
): Promise<{ id: string; label: string } | null> {
  const { data } = await supabase
    .from("office_objects")
    .select("id, label")
    .eq("office_id", AI_COUNCIL_OFFICE_ID)
    .eq("object_type", "room")
    .eq("label", label)
    .maybeSingle();
  return data ?? null;
}

async function loadBuildingFixture(
  supabase: SupabaseClient,
  objectId: string,
  label: string,
): Promise<CreatedBuilding | null> {
  const { data: chambers } = await supabase
    .from("chambers")
    .select("id, entity_registry_id, name, routing_role")
    .or(`building_entity_id.eq.${objectId},building_object_id.eq.${objectId}`);

  if (!chambers?.length) return null;

  const main = chambers.find((c) => c.routing_role === "main");
  if (!main?.entity_registry_id) return null;

  const internal = chambers
    .filter((c) => c.routing_role !== "main")
    .map((c) => ({
      chamberId: c.id,
      registryId: c.entity_registry_id,
      name: c.name,
      routingRole: "internal" as const,
    }));

  return {
    objectId,
    registryId: objectId,
    label,
    mainChamber: {
      chamberId: main.id,
      registryId: main.entity_registry_id,
      name: main.name,
      routingRole: "main",
    },
    internalChambers: internal,
  };
}

async function createChamber(
  supabase: SupabaseClient,
  params: {
    buildingId: string;
    name: string;
    routingRole: "main" | null;
    routingDescription?: string;
    x: number;
    z: number;
    seedRoster: boolean;
  },
): Promise<CreatedChamber> {
  const slug = await resolveUniqueChamberSlug(supabase, params.buildingId, params.name);

  const { data: registry, error: regError } = await supabase
    .from("entity_registry")
    .insert({
      entity_type: "chamber",
      name: params.name,
      slug,
      parent_entity_id: params.buildingId,
      ...(params.routingDescription ? { routing_description: params.routingDescription } : {}),
    })
    .select("id")
    .single();

  if (regError || !registry) {
    throw new Error(regError?.message ?? `Failed registry for ${params.name}`);
  }

  const { data: chamber, error: chamError } = await supabase
    .from("chambers")
    .insert({
      entity_registry_id: registry.id,
      building_entity_id: params.buildingId,
      building_object_id: params.buildingId,
      name: params.name,
      x: params.x,
      z: params.z,
      width: 4,
      depth: 4,
      routing_role: params.routingRole,
    })
    .select("id, entity_registry_id, name")
    .single();

  if (chamError || !chamber) {
    throw new Error(chamError?.message ?? `Failed chamber ${params.name}`);
  }

  if (params.seedRoster) {
    await seedDefaultChamberRoster(supabase, {
      chamberId: chamber.id,
      chamberRegistryId: chamber.entity_registry_id,
    });
  }

  return {
    chamberId: chamber.id,
    registryId: chamber.entity_registry_id,
    name: chamber.name,
    routingRole: params.routingRole === "main" ? "main" : "internal",
  };
}

async function createBuildingWithChambers(
  supabase: SupabaseClient,
  params: {
    label: string;
    routingDescription: string;
    position_x: number;
    position_z: number;
    internals: Array<{ name: string; routingDescription: string; x: number; z: number }>;
    mainSeedRoster?: boolean;
  },
): Promise<CreatedBuilding> {
  const existing = await findBuildingByLabel(supabase, params.label);
  if (existing) {
    const loaded = await loadBuildingFixture(supabase, existing.id, params.label);
    if (loaded) return loaded;
  }

  const { data: building, error } = await supabase
    .from("office_objects")
    .insert({
      office_id: AI_COUNCIL_OFFICE_ID,
      object_type: "room",
      position_x: params.position_x,
      position_z: params.position_z,
      size_w: 16,
      size_d: 14,
      label: params.label,
      color: "slate",
    })
    .select("id, label")
    .single();

  if (error || !building) {
    throw new Error(error?.message ?? `Failed building ${params.label}`);
  }

  await ensureBuildingRegistry(
    supabase,
    {
      id: building.id,
      label: building.label,
      routing_description: params.routingDescription,
      office_id: AI_COUNCIL_OFFICE_ID,
    },
    "AI Council",
  );

  const mainChamber = await createChamber(supabase, {
    buildingId: building.id,
    name: `t_${params.label.replace(/^t_/, "")}_Менеджер`,
    routingRole: "main",
    routingDescription: "Главный отдел тестового здания, маршрутизация во внутренние отделы",
    x: 2,
    z: 2,
    seedRoster: params.mainSeedRoster ?? true,
  });

  const internalChambers: CreatedChamber[] = [];
  for (const internal of params.internals) {
    internalChambers.push(
      await createChamber(supabase, {
        buildingId: building.id,
        name: internal.name,
        routingRole: null,
        routingDescription: internal.routingDescription,
        x: internal.x,
        z: internal.z,
        seedRoster: true,
      }),
    );
  }

  return {
    objectId: building.id,
    registryId: building.id,
    label: params.label,
    mainChamber,
    internalChambers,
  };
}

async function ensureFreeOnlyChamber(supabase: SupabaseClient): Promise<CreatedChamber> {
  const label = FIXTURE_LABELS.freeOnlyBuilding;
  const existing = await findBuildingByLabel(supabase, label);
  if (existing) {
    const loaded = await loadBuildingFixture(supabase, existing.id, label);
    if (loaded) return loaded.mainChamber;
  }

  const building = await createBuildingWithChambers(supabase, {
    label,
    routingDescription: "t_ тест cost_tier: только free-агенты",
    position_x: 120,
    position_z: 40,
    internals: [],
    mainSeedRoster: false,
  });

  const { count: existingAssignments } = await supabase
    .from("agent_assignments")
    .select("id", { count: "exact", head: true })
    .eq("chamber_id", building.mainChamber.chamberId);

  if ((existingAssignments ?? 0) === 0) {
    const { data: freeAgent } = await supabase
      .from("agents")
      .select("id")
      .eq("cost_tier", "free")
      .limit(1)
      .maybeSingle();
    if (!freeAgent) throw new Error("No free agent in pool for t_ free-only chamber");
    await supabase.from("agent_assignments").insert({
      agent_id: freeAgent.id,
      chamber_id: building.mainChamber.chamberId,
      role: "free",
      layout_x: 0,
      layout_y: 0,
    });
  }

  return building.mainChamber;
}

async function ensureConnection(
  supabase: SupabaseClient,
  sourceRegistryId: string,
  targetRegistryId: string,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("connections")
    .select("id")
    .eq("source_entity_id", sourceRegistryId)
    .eq("target_entity_id", targetRegistryId)
    .maybeSingle();

  if (existing?.id) return existing.id;

  const { data: conn, error } = await supabase
    .from("connections")
    .insert({
      source_entity_id: sourceRegistryId,
      target_entity_id: targetRegistryId,
      priority: 1,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !conn) return null;

  await supabase.from("connection_permissions").insert({
    connection_id: conn.id,
    ...NEW_CONNECTION_PERMISSIONS,
  });

  return conn.id;
}

function projectDocExcerpt(): string {
  const docPath = path.join(process.cwd(), "city_builder_architecture_reference.md");
  const rulesPath = path.join(process.cwd(), "AGENT_RULES.md");
  const parts: string[] = [];
  if (fs.existsSync(docPath)) {
    parts.push(fs.readFileSync(docPath, "utf8").slice(0, 1200));
  }
  if (fs.existsSync(rulesPath)) {
    parts.push(fs.readFileSync(rulesPath, "utf8").slice(0, 400));
  }
  return parts.join("\n\n---\n\n") || "t_fallback doc excerpt for knowledge tests";
}

export async function ensureTestFixture(supabase: SupabaseClient): Promise<TestFixture> {
  const tag = `t_diag_${Date.now()}`;

  const cactusShop = await createBuildingWithChambers(supabase, {
    label: FIXTURE_LABELS.cactusShop,
    routingDescription:
      "t_ тестовый магазин кактусов и кружек: бухгалтерия, каталог кружек, менеджер",
    position_x: 80,
    position_z: 20,
    internals: [
      {
        name: "t_Бухгалтерия",
        routingDescription: "Учёт продаж кактусов, налоги, отчёты, баланс, счета",
        x: 8,
        z: 2,
      },
      {
        name: "t_Кружка",
        routingDescription: "Каталог керамических кружек, дизайн, цвета, объём 300мл",
        x: 8,
        z: 8,
      },
    ],
  });

  const emptyShell = await createBuildingWithChambers(supabase, {
    label: FIXTURE_LABELS.emptyShell,
    routingDescription: "t_ пустое здание без внутренних отделов для answer_self",
    position_x: 100,
    position_z: 20,
    internals: [],
  });

  const freeOnlyChamber = await ensureFreeOnlyChamber(supabase);

  const fullRosterChamber =
    cactusShop.internalChambers.find((c) => c.name === "t_Бухгалтерия") ??
    cactusShop.mainChamber;

  const connectionId = await ensureConnection(
    supabase,
    cactusShop.mainChamber.registryId,
    emptyShell.mainChamber.registryId,
  );

  const excerpt = projectDocExcerpt();
  const knowledgeEntryIds: string[] = [];

  const knowledgeRows = [
    {
      title: "t_Каталог_кактусов",
      content: "Описание: виды кактусов для витрины",
      body: `${excerpt}\n\nT_KNOWLEDGE_SECRET_CACTUS: опунция t_диаг ${tag}`,
      matchToken: "опунция t_диаг",
    },
    {
      title: "t_Рецепт_кружек",
      content: "Описание: обжиг и глазурь керамики",
      body: "T_KNOWLEDGE_SECRET_MUG: kiln temperature 980C for t_mug_batch",
      matchToken: "kiln temperature",
    },
    {
      title: "t_Шум_видео",
      content: "Описание: промты для видео (не про кактусы)",
      body: "T_KNOWLEDGE_SECRET_VIDEO: unrelated video prompt noise",
      matchToken: "video prompt noise",
    },
  ];

  for (const row of knowledgeRows) {
    const { data: existing } = await supabase
      .from("knowledge")
      .select("id")
      .eq("entity_registry_id", fullRosterChamber.registryId)
      .eq("title", row.title)
      .maybeSingle();

    if (existing?.id) {
      knowledgeEntryIds.push(existing.id);
      continue;
    }

    const { data: inserted, error } = await supabase
      .from("knowledge")
      .insert({
        entity_type: "chamber",
        entity_id: fullRosterChamber.registryId,
        entity_registry_id: fullRosterChamber.registryId,
        title: row.title,
        content: row.content,
        body: row.body,
        file_url: null,
      })
      .select("id")
      .single();

    if (error || !inserted) {
      throw new Error(error?.message ?? `knowledge insert failed: ${row.title}`);
    }
    knowledgeEntryIds.push(inserted.id);
  }

  return {
    tag,
    cactusShop,
    emptyShell,
    freeOnlyChamber,
    fullRosterChamber,
    connectionId,
    knowledgeEntryIds,
  };
}

export async function auditExistingBuildings(supabase: SupabaseClient) {
  const { data: buildings } = await supabase
    .from("entity_registry")
    .select("id, name, routing_description")
    .eq("entity_type", "building")
    .order("name");

  const report: Array<{
    id: string;
    name: string;
    chamberCount: number;
    internalCount: number;
    agentCount: number;
    knowledgeCount: number;
    connectionCount: number;
    note: string;
  }> = [];

  for (const b of buildings ?? []) {
    const { data: chambers } = await supabase
      .from("chambers")
      .select("id, routing_role")
      .or(`building_entity_id.eq.${b.id},building_object_id.eq.${b.id}`);

    const chamberIds = (chambers ?? []).map((c) => c.id);
    const internalCount = (chambers ?? []).filter((c) => c.routing_role !== "main").length;

    let agentCount = 0;
    if (chamberIds.length > 0) {
      const { count } = await supabase
        .from("agent_assignments")
        .select("id", { count: "exact", head: true })
        .in("chamber_id", chamberIds);
      agentCount = count ?? 0;
    }

    const { count: knowledgeCount } = await supabase
      .from("knowledge")
      .select("id", { count: "exact", head: true })
      .eq("entity_registry_id", b.id);

    const { count: connOut } = await supabase
      .from("connections")
      .select("id", { count: "exact", head: true })
      .or(`source_entity_id.eq.${b.id},target_entity_id.eq.${b.id}`);

    const isProtected = /citizly|юрист|city hall|техн/i.test(b.name);
    const isSparse = (chambers?.length ?? 0) <= 1 || agentCount === 0;

    report.push({
      id: b.id,
      name: b.name,
      chamberCount: chambers?.length ?? 0,
      internalCount,
      agentCount,
      knowledgeCount: knowledgeCount ?? 0,
      connectionCount: connOut ?? 0,
      note: isProtected
        ? "protected — read-only routing checks only"
        : isSparse
          ? "sparse — insufficient for full integration test"
          : "usable",
    });
  }

  return report;
}
