import { ANTHROPIC_PRIMARY_MODEL } from "./anthropic-models";
import { OPENAI_PRIMARY_MODEL } from "./openai-models";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";

export type SystemLlmRole = "planner" | "router" | "summary";

export const SYSTEM_LLM_ROLES: SystemLlmRole[] = ["planner", "router", "summary"];

export const SYSTEM_LLM_ROLE_LABELS: Record<SystemLlmRole, string> = {
  planner: "Planner",
  router: "Router",
  summary: "Summary",
};

export type SystemLlmProvider = "groq" | "gemini" | "anthropic" | "openai";

export type SystemLlmRoleConfig = {
  primaryProvider: SystemLlmProvider;
  primaryModel: string;
  fallbackProvider: SystemLlmProvider;
  fallbackModel: string;
};

const PURPOSE_TO_ROLE: Record<string, SystemLlmRole> = {
  "city-router": "router",
  "manager-routing": "router",
  "structure-command-gate": "router",
  "structure-anaphora-expand": "router",
  "manager-summary": "summary",
  "chamber-archive-summary": "summary",
  summary: "summary",
  "tech-structure-plan": "planner",
  "tech-structure-plan-destructive": "planner",
  "workflow-planner": "planner",
};

/** Map invokeCheapLLM purpose string → service role. Unknown purposes skip DB lookup. */
export function resolveSystemLlmRole(purpose: string): SystemLlmRole | null {
  return PURPOSE_TO_ROLE[purpose] ?? null;
}

/** Pre-1A hardcoded defaults when officeId/role row missing (sync with system_llm_roles seed). */
export function defaultHardcodedRoleConfig(): SystemLlmRoleConfig {
  return {
    primaryProvider: "anthropic",
    primaryModel: ANTHROPIC_PRIMARY_MODEL,
    fallbackProvider: "openai",
    fallbackModel: OPENAI_PRIMARY_MODEL,
  };
}

const PROVIDERS: SystemLlmProvider[] = ["groq", "gemini", "anthropic", "openai"];

function normalizeProvider(raw: string): SystemLlmProvider | null {
  const value = raw.trim().toLowerCase() as SystemLlmProvider;
  return PROVIDERS.includes(value) ? value : null;
}

function rowToConfig(row: {
  primary_provider: string;
  primary_model: string;
  fallback_provider: string;
  fallback_model: string;
}): SystemLlmRoleConfig | null {
  const primaryProvider = normalizeProvider(row.primary_provider);
  const fallbackProvider = normalizeProvider(row.fallback_provider);
  const primaryModel = row.primary_model?.trim();
  const fallbackModel = row.fallback_model?.trim();
  if (!primaryProvider || !fallbackProvider || !primaryModel || !fallbackModel) {
    return null;
  }
  return {
    primaryProvider,
    primaryModel,
    fallbackProvider,
    fallbackModel,
  };
}

/** Load per-office role config; null → caller uses defaultHardcodedRoleConfig(). */
export async function loadSystemLlmRoleConfig(
  officeId: string | undefined,
  role: SystemLlmRole,
): Promise<SystemLlmRoleConfig | null> {
  if (!officeId?.trim() || !isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("system_llm_roles")
    .select("primary_provider, primary_model, fallback_provider, fallback_model")
    .eq("office_id", officeId)
    .eq("role", role)
    .maybeSingle();

  if (error || !data) return null;
  return rowToConfig(data);
}

export type SystemLlmRoleRecord = {
  role: SystemLlmRole;
  primaryProvider: SystemLlmProvider;
  primaryModel: string;
  fallbackProvider: SystemLlmProvider;
  fallbackModel: string;
  updatedAt: string | null;
};

function isSystemLlmRole(value: string): value is SystemLlmRole {
  return (SYSTEM_LLM_ROLES as string[]).includes(value);
}

function mapDbRow(row: {
  role: string;
  primary_provider: string;
  primary_model: string;
  fallback_provider: string;
  fallback_model: string;
  updated_at?: string | null;
}): SystemLlmRoleRecord | null {
  if (!isSystemLlmRole(row.role)) return null;
  const config = rowToConfig(row);
  if (!config) return null;
  return {
    role: row.role,
    ...config,
    updatedAt: row.updated_at ?? null,
  };
}

/** All three roles for an office; missing rows filled with hardcoded defaults. */
export async function listSystemLlmRolesForOffice(officeId: string): Promise<SystemLlmRoleRecord[]> {
  const fallback = defaultHardcodedRoleConfig();
  if (!isSupabaseConfigured()) {
    return SYSTEM_LLM_ROLES.map((role) => ({
      role,
      ...fallback,
      updatedAt: null,
    }));
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("system_llm_roles")
    .select("role, primary_provider, primary_model, fallback_provider, fallback_model, updated_at")
    .eq("office_id", officeId);

  if (error) throw new Error(error.message);

  const byRole = new Map<SystemLlmRole, SystemLlmRoleRecord>();
  for (const row of data ?? []) {
    const mapped = mapDbRow(row);
    if (mapped) byRole.set(mapped.role, mapped);
  }

  return SYSTEM_LLM_ROLES.map((role) => {
    const existing = byRole.get(role);
    if (existing) return existing;
    return { role, ...fallback, updatedAt: null };
  });
}

export type UpdateSystemLlmRolePatch = {
  primaryProvider?: SystemLlmProvider;
  primaryModel?: string;
  fallbackProvider?: SystemLlmProvider;
  fallbackModel?: string;
};

export async function updateSystemLlmRoleForOffice(
  officeId: string,
  role: SystemLlmRole,
  patch: UpdateSystemLlmRolePatch,
): Promise<SystemLlmRoleRecord> {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase не настроен");
  }

  const hasPrimary = patch.primaryProvider !== undefined || patch.primaryModel !== undefined;
  const hasFallback = patch.fallbackProvider !== undefined || patch.fallbackModel !== undefined;
  if (!hasPrimary && !hasFallback) {
    throw new Error("Укажите primary или fallback provider+model");
  }
  if (
    (patch.primaryProvider !== undefined && !patch.primaryModel?.trim()) ||
    (patch.primaryModel !== undefined && !patch.primaryProvider)
  ) {
    throw new Error("primaryProvider и primaryModel задаются вместе");
  }
  if (
    (patch.fallbackProvider !== undefined && !patch.fallbackModel?.trim()) ||
    (patch.fallbackModel !== undefined && !patch.fallbackProvider)
  ) {
    throw new Error("fallbackProvider и fallbackModel задаются вместе");
  }

  const current = (await listSystemLlmRolesForOffice(officeId)).find((r) => r.role === role);
  if (!current) throw new Error("Unknown role");

  const next = {
    primary_provider: patch.primaryProvider ?? current.primaryProvider,
    primary_model: patch.primaryModel?.trim() ?? current.primaryModel,
    fallback_provider: patch.fallbackProvider ?? current.fallbackProvider,
    fallback_model: patch.fallbackModel?.trim() ?? current.fallbackModel,
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("system_llm_roles")
    .upsert(
      {
        office_id: officeId,
        role,
        ...next,
      },
      { onConflict: "office_id,role" },
    )
    .select("role, primary_provider, primary_model, fallback_provider, fallback_model, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to update system LLM role");
  }

  const mapped = mapDbRow(data);
  if (!mapped) throw new Error("Invalid role row after update");
  return mapped;
}

export function parseSystemLlmRoleParam(value: string): SystemLlmRole | null {
  const normalized = value.trim().toLowerCase();
  return isSystemLlmRole(normalized) ? normalized : null;
}

export function parseSystemLlmProvider(value: unknown): SystemLlmProvider | null {
  if (typeof value !== "string") return null;
  return normalizeProvider(value);
}

/** Resolve office_id from entity_registry id (building/chamber/city). */
export async function resolveOfficeIdForEntityRegistry(
  entityRegistryId: string,
): Promise<string | null> {
  if (!entityRegistryId.trim() || !isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  let currentId: string | null = entityRegistryId;
  for (let depth = 0; depth < 4 && currentId; depth += 1) {
    const { data: row } = await supabase
      .from("entity_registry")
      .select("entity_type, parent_entity_id")
      .eq("id", currentId)
      .maybeSingle();

    if (!row) return null;
    const entityType = row.entity_type as string;
    const parentId = row.parent_entity_id as string | null;
    if (entityType === "city") return currentId;
    if (entityType === "building") {
      return parentId;
    }
    currentId = parentId;
  }
  return null;
}
