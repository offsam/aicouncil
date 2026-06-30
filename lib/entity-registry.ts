import {
  appendKnowledgeToPromptParts,
  buildKnowledgeRefsFromRows,
} from "./knowledge/knowledge-context";
import {
  assertAgentAssignedToChamberRegistry,
  assertAgentContextAccess,
} from "./security/agent-context-access";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase/admin";
import { requireExternalEntryOfficeId } from "./workspace/graph-identity-required";
import type {
  EntityRegistryRow,
  ChamberRow,
  UniversalKnowledgeRow,
  RuleRow,
  KnowledgeRef,
  ContextLayer,
  BuiltContext,
  BuildContextOptions,
} from "./office-types";

// Local storage keys
const REGISTRY_STORAGE_KEY = "floor-entity-registry";
const CHAMBERS_STORAGE_KEY = "floor-chambers";
const KNOWLEDGE_STORAGE_KEY = "floor-universal-knowledge";
const RULES_STORAGE_KEY = "floor-universal-rules";

// In-memory cache for database queries to prevent N+1 queries in consensus batches
const globalQueryCache = new Map<string, { promise: Promise<any>; timestamp: number }>();
const CACHE_TTL_MS = 5000; // 5 seconds TTL is plenty for concurrent requests

function getOrCreateCachedQuery<T>(key: string, fetchFn: () => Promise<T>): Promise<T> {
  const cached = globalQueryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.promise;
  }
  const promise = fetchFn().catch((err) => {
    globalQueryCache.delete(key);
    throw err;
  });
  globalQueryCache.set(key, { promise, timestamp: Date.now() });
  return promise;
}

// Helper to load/save local storage for Entity Registry
export function loadLocalRegistry(): EntityRegistryRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(REGISTRY_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalRegistry(rows: EntityRegistryRow[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(rows));
}

// Helper to load/save local storage for Chambers
export function loadLocalChambers(): ChamberRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHAMBERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalChambers(rows: ChamberRow[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHAMBERS_STORAGE_KEY, JSON.stringify(rows));
}

// Helper to load/save local storage for Universal Knowledge
export function loadLocalKnowledge(): UniversalKnowledgeRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KNOWLEDGE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalKnowledge(rows: UniversalKnowledgeRow[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KNOWLEDGE_STORAGE_KEY, JSON.stringify(rows));
}

// Helper to load/save local storage for Universal Rules
export function loadLocalRules(): RuleRow[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalRules(rows: RuleRow[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rows));
}

/**
 * Returns the path of an entity by traversing up parent_entity_id pointers.
 * Example result: city/ai-council/building/building-1/chamber/marketing
 */
export async function getEntityPath(entityId: string): Promise<string> {
  const parts: string[] = [];
  let currentId: string | null = entityId;

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdmin();
      while (currentId) {
        const targetId: string = currentId; // bind local
        const data: { entity_type: string; slug: string; parent_entity_id: string | null } = await getOrCreateCachedQuery<{ entity_type: string; slug: string; parent_entity_id: string | null }>(`reg_${targetId}`, async (): Promise<{ entity_type: string; slug: string; parent_entity_id: string | null }> => {
          const response = await supabase
            .from("entity_registry")
            .select("entity_type, slug, parent_entity_id")
            .eq("id", targetId)
            .single();
          if (response.error || !response.data) {
            throw new Error(response.error?.message || "Entity not found");
          }
          return response.data;
        });

        parts.unshift(`${data.entity_type}/${data.slug}`);
        currentId = data.parent_entity_id;
      }
    } catch {
      // Fallback if db query fails
    }
  } else {
    const registry = loadLocalRegistry();
    while (currentId) {
      const row = registry.find((r) => r.id === currentId);
      if (!row) break;
      parts.unshift(`${row.entity_type}/${row.slug}`);
      currentId = row.parent_entity_id;
    }
  }

  return parts.join("/");
}

type RegistryRow = {
  id: string;
  entity_type: string;
  name: string;
  slug: string;
  parent_entity_id: string | null;
};

async function fetchRegistryRow(id: string): Promise<RegistryRow | null> {
  const supabase = getSupabaseAdmin();
  try {
    return await getOrCreateCachedQuery<RegistryRow | null>(`reg_full_${id}`, async () => {
      const { data, error } = await supabase
        .from("entity_registry")
        .select("id, entity_type, name, slug, parent_entity_id")
        .eq("id", id)
        .single();
      if (error || !data) return null;
      return data;
    });
  } catch {
    return null;
  }
}

async function traverseUpRegistry(startId: string): Promise<RegistryRow[]> {
  const chain: RegistryRow[] = [];
  let currentId: string | null = startId;
  while (currentId) {
    const row = await fetchRegistryRow(currentId);
    if (!row) break;
    chain.push(row);
    currentId = row.parent_entity_id;
  }
  return chain;
}

async function defaultChamberRegistryForAgent(agentRegistryId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agent_assignments")
    .select("chamber_id, chambers(entity_registry_id)")
    .eq("agent_id", agentRegistryId);

  if (error || !data || data.length !== 1) return null;

  const chamber = data[0].chambers as { entity_registry_id: string } | { entity_registry_id: string }[] | null;
  if (Array.isArray(chamber)) {
    return chamber[0]?.entity_registry_id ?? null;
  }
  return chamber?.entity_registry_id ?? null;
}

async function buildRegistryChainForContext(
  entityRegistryId: string,
  chamberRegistryId?: string,
): Promise<RegistryRow[]> {
  const entityRow = await fetchRegistryRow(entityRegistryId);
  if (!entityRow) return [];

  if (entityRow.entity_type === "agent") {
    let chamberId = chamberRegistryId;
    if (!chamberId) {
      chamberId = (await defaultChamberRegistryForAgent(entityRegistryId)) ?? undefined;
    }
    if (chamberId) {
      await assertAgentAssignedToChamberRegistry(entityRegistryId, chamberId);
      const chamberChain = await traverseUpRegistry(chamberId);
      chamberChain.reverse();
      if (!chamberChain.some((r) => r.id === entityRegistryId)) {
        chamberChain.push(entityRow);
      }
      return chamberChain;
    }
  }

  const chain = await traverseUpRegistry(entityRegistryId);
  chain.reverse();
  return chain;
}

/**
 * buildContext - Assembles context layer-by-layer up the hierarchy tree.
 * For agents with many-to-many chamber assignments, pass chamberRegistryId explicitly.
 * Pure reading function, does not make any LLM calls.
 */
export async function buildContext(
  entityRegistryId: string,
  options?: BuildContextOptions,
): Promise<BuiltContext> {
  
    if (!isSupabaseConfigured()) {
    // If Supabase is not configured, return an empty context
    return {
      layers: [],
      flattenedPrompt: "",
      tokenEstimate: 0,
    };
  }

  const supabase = getSupabaseAdmin();
  const registryChain = await buildRegistryChainForContext(
    entityRegistryId,
    options?.chamberRegistryId,
  );

  const layers: ContextLayer[] = [];

  for (const entity of registryChain) {
    try {
      // Fetch rules for this specific entity registry ID
      const rulesRows = await getOrCreateCachedQuery<{ id: string; rule_text: string }[]>(`rules_${entity.id}`, async (): Promise<{ id: string; rule_text: string }[]> => {
        const { data, error } = await supabase
          .from("rules")
          .select("id, rule_text")
          .eq("entity_registry_id", entity.id);
        if (error) throw error;
        return (data as { id: string; rule_text: string }[]) || [];
      });

      // Limit rules: max 30 rules or 4000 characters total per layer
      let finalRules: string[] = [];
      let charCount = 0;
      let truncatedCount = 0;

      for (let i = 0; i < rulesRows.length; i++) {
        const ruleText = rulesRows[i].rule_text || "";
        if (finalRules.length >= 30) {
          truncatedCount = rulesRows.length - i;
          break;
        }
        if (charCount + ruleText.length > 4000) {
          truncatedCount = rulesRows.length - i;
          break;
        }
        finalRules.push(ruleText);
        charCount += ruleText.length;
      }
      if (truncatedCount > 0) {
        finalRules.push(`[+ еще ${truncatedCount} правил, не показаны]`);
      }

      // Fetch knowledge for this specific entity registry ID
      const knowRows = await getOrCreateCachedQuery<{ id: string; title: string; content: string | null; body: string | null; file_url: string | null }[]>(`know_${entity.id}`, async (): Promise<{ id: string; title: string; content: string | null; body: string | null; file_url: string | null }[]> => {
        const { data, error } = await supabase
          .from("knowledge")
          .select("id, title, content, body, file_url")
          .eq("entity_registry_id", entity.id)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data as { id: string; title: string; content: string | null; body: string | null; file_url: string | null }[]) || [];
      });

      const knowledgeRefs = buildKnowledgeRefsFromRows(knowRows, {
        taskText: options?.taskText,
      });

      layers.push({
        entityRegistryId: entity.id,
        entityType: entity.entity_type,
        entityName: entity.name,
        rules: finalRules,
        knowledge: knowledgeRefs,
      });
    } catch (err) {
      console.error(`Error building context layer for ${entity.name}:`, err);
    }
  }

  // 2. Fetch active horizontal connections (target_entity_id = entityRegistryId)
  const horizontalLayers: {
    sourceName: string;
    rules: string[];
    knowledge: KnowledgeRef[];
    lastResult: string | null;
  }[] = [];

  try {
    const { data: conns } = await supabase
      .from("connections")
      .select(`
        id,
        source_entity_id,
        priority,
        created_at,
        source:entity_registry!source_entity_id(name),
        connection_permissions(read_knowledge, read_rules, read_results)
      `)
      .eq("target_entity_id", entityRegistryId)
      .eq("is_active", true);

    if (conns && conns.length > 0) {
      // Sort by priority DESC, then by created_at DESC (more recent first)
      const sortedConns = [...conns].sort((a: any, b: any) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      const activeConns = sortedConns.slice(0, 10);
      const omittedConns = sortedConns.slice(10);

      if (omittedConns.length > 0) {
        console.log(`[buildContext] ${omittedConns.length} connections omitted due to 10-connection limit.`);
      }

      for (const conn of activeConns) {
        const rawPerms = conn.connection_permissions;
        const perms = Array.isArray(rawPerms) ? rawPerms[0] : rawPerms;
        if (!perms) continue;

        const sourceId = conn.source_entity_id;
        const sourceName = (conn.source as any)?.name || "Unknown Source";
        const rulesList: string[] = [];
        const knowRefs: KnowledgeRef[] = [];
        let lastResultSummary: string | null = null;

        // Read rules
        if (perms.read_rules) {
          const { data: rRows } = await supabase
            .from("rules")
            .select("rule_text")
            .eq("entity_registry_id", sourceId);

          if (rRows) {
            let charCount = 0;
            for (const r of rRows) {
              if (rulesList.length >= 30 || charCount + (r.rule_text || "").length > 4000) break;
              rulesList.push(r.rule_text);
              charCount += (r.rule_text || "").length;
            }
          }
          await logConnectionRead(conn.id, "rules", `Read ${rulesList.length} rules from ${sourceName}`);
        }

        // Read knowledge
        if (perms.read_knowledge) {
          const { data: kRows } = await supabase
            .from("knowledge")
            .select("id, title, content, body, file_url")
            .eq("entity_registry_id", sourceId)
            .order("created_at", { ascending: false });

          if (kRows) {
            knowRefs.push(
              ...buildKnowledgeRefsFromRows(kRows, { taskText: options?.taskText }),
            );
          }
          await logConnectionRead(conn.id, "knowledge", `Read ${knowRefs.length} knowledge entries from ${sourceName}`);
        }

        // Read results
        if (perms.read_results) {
          const { data: sourceAgents } = await supabase
            .from("entity_registry")
            .select("id")
            .eq("entity_type", "agent")
            .eq("parent_entity_id", sourceId);

          const agentIds = sourceAgents?.map((a: any) => a.id) || [];
          if (agentIds.length > 0) {
            const { data: lastLog } = await supabase
              .from("request_logs")
              .select("response")
              .in("agent_id", agentIds)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (lastLog && lastLog.response) {
              const resText = lastLog.response.trim();
              lastResultSummary = resText.length > 200 ? resText.substring(0, 200) + "..." : resText;
            }
          }
          await logConnectionRead(conn.id, "results", `Read last result from ${sourceName}: ${lastResultSummary ? "success" : "none"}`);
        }

        if (rulesList.length > 0 || knowRefs.length > 0 || lastResultSummary) {
          horizontalLayers.push({
            sourceName,
            rules: rulesList,
            knowledge: knowRefs,
            lastResult: lastResultSummary
          });
        }
      }
    }
  } catch (err) {
    console.error("Error building horizontal connections:", err);
  }

  // 3. Build flattenedPrompt
  const promptParts: string[] = [];
  for (const layer of layers) {
    const layerTypeLabel = layer.entityType.charAt(0).toUpperCase() + layer.entityType.slice(1);
    
    // Add rules block if not empty
    if (layer.rules.length > 0) {
      promptParts.push(`[${layerTypeLabel} Rules: ${layer.entityName}]`);
      for (const rule of layer.rules) {
        promptParts.push(`- ${rule}`);
      }
      promptParts.push(""); // empty line separator
    }

    // Add knowledge block if not empty
    if (layer.knowledge.length > 0) {
      promptParts.push(`[${layerTypeLabel} Knowledge available: ${layer.entityName}]`);
      appendKnowledgeToPromptParts(promptParts, layer.knowledge);
      promptParts.push(""); // empty line separator
    }
  }

  // Append horizontal connections (if any)
  if (horizontalLayers.length > 0) {
    for (const h of horizontalLayers) {
      promptParts.push(`[Connected: ${h.sourceName} (via cable)]`);
      for (const rule of h.rules) {
        promptParts.push(`- Rule: ${rule}`);
      }
      appendKnowledgeToPromptParts(
        promptParts,
        h.knowledge.map((k) => ({
          ...k,
          title: `Knowledge available: ${k.title}`,
        })),
      );
      if (h.lastResult) {
        promptParts.push(`- Last Result: ${h.lastResult}`);
      }
      promptParts.push(""); // empty line separator
    }
  }

  const flattenedPrompt = promptParts.join("\n").trim();
  const tokenEstimate = Math.ceil(flattenedPrompt.length / 4);

  return {
    layers,
    flattenedPrompt,
    tokenEstimate,
  };
}

/**
 * Helper to log connection data access.
 */
async function logConnectionRead(connectionId: string, payloadType: 'knowledge' | 'rules' | 'results' | 'task', summary: string) {
  try {
    const supabase = getSupabaseAdmin();
    await supabase.from("connection_logs").insert({
      connection_id: connectionId,
      payload_type: payloadType,
      summary: summary
    });
  } catch (err) {
    console.error("Failed to log connection read:", err);
  }
}

/**
 * Helper to determine agent slug from route path and request body,
 * retrieve its registry ID, and build its context.
 */
export async function getAgentContextPrompt(routePath: string, body: any): Promise<string> {
  if (!isSupabaseConfigured()) return "";

  let slug = "";
  const path = routePath.toLowerCase();

  if (path.includes("ask-claude")) slug = "claude";
  else if (path.includes("ask-gpt")) slug = "gpt";
  else if (path.includes("ask-gemini")) slug = "gemini";
  else if (path.includes("ask-deepseek")) slug = "deepseek";
  else if (path.includes("ask-groq")) slug = "groq";
  else if (path.includes("ask-mistral")) slug = "mistral";
  else if (path.includes("ask-openrouter")) {
    const model = (body.model || "").toLowerCase();
    if (model.includes("qwen")) slug = "or-qwen";
    else if (model.includes("llama")) slug = "or-llama";
    else if (model.includes("deepseek")) slug = "or-deepseek-r1";
    else if (model.includes("gemma")) slug = "or-gemma";
    else if (model.includes("mistral")) slug = "or-mistral";
  }

  if (!slug) return "";

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("entity_registry")
      .select("id")
      .eq("entity_type", "agent")
      .eq("slug", slug)
      .single();

    if (error || !data) {
      console.warn(`Registry ID not found for agent slug: ${slug}`);
      return "";
    }

    const officeId = await requireExternalEntryOfficeId();
    const chamberRegistryId = body?.chamberRegistryId ?? body?.chamberId;
    await assertAgentContextAccess({
      officeId,
      agentId: data.id,
      chamberRegistryId: typeof chamberRegistryId === "string" ? chamberRegistryId : undefined,
    });

    const context = await buildContext(data.id, {
      chamberRegistryId: typeof chamberRegistryId === "string" ? chamberRegistryId : undefined,
      taskText: typeof body?.question === "string" ? body.question : undefined,
    });
    return context.flattenedPrompt;
  } catch (err) {
    console.error("Error retrieving agent context prompt:", err);
    return "";
  }
}


