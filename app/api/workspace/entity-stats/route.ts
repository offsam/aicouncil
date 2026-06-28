import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { requireWorkspaceOfficeId } from "@/lib/workspace/resolve-workspace-office-id";

/** Cap rows loaded for aggregate stats (recent window, not full history). */
const STATS_LOGS_FETCH_LIMIT = 500;

type LogRow = {
  id: string;
  agent_id: string | null;
  question: string;
  response: string | null;
  status: string;
  latency_ms: number | null;
  created_at: string;
};

type ArchiveRow = {
  id: string;
  entity_registry_id: string;
  type: "raw" | "summary";
  content: string;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  archived_into: string | null;
};

type ArchiveGroup = {
  chamberId: string;
  name: string;
  registryId: string;
  rows: ArchiveRow[];
};

function estimateTokens(log: { question: string; response: string | null }): number {
  const chars = log.question.length + (log.response?.length ?? 0);
  return Math.max(1, Math.ceil(chars / 4));
}

function summarizeLogs(logs: LogRow[]) {
  let requestCount = 0;
  let successCount = 0;
  let errorCount = 0;
  let pendingCount = 0;
  let estimatedTokens = 0;

  for (const log of logs) {
    requestCount += 1;
    estimatedTokens += estimateTokens(log);
    if (log.status === "success") successCount += 1;
    else if (log.status === "error") errorCount += 1;
    else pendingCount += 1;
  }

  return { requestCount, successCount, errorCount, pendingCount, estimatedTokens };
}

async function loadArchiveGroups(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  chamberRows: Array<{ id: string; name: string; entity_registry_id: string }>,
): Promise<ArchiveGroup[]> {
  if (chamberRows.length === 0) return [];

  const registryIds = chamberRows.map((c) => c.entity_registry_id);
  const { data, error } = await supabase
    .from("chamber_archive")
    .select("id, entity_registry_id, type, content, period_start, period_end, created_at, archived_into")
    .in("entity_registry_id", registryIds)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ArchiveRow[];
  const rowsByRegistryId = new Map<string, ArchiveRow[]>();
  for (const row of rows) {
    const list = rowsByRegistryId.get(row.entity_registry_id) ?? [];
    list.push(row);
    rowsByRegistryId.set(row.entity_registry_id, list);
  }

  return chamberRows
    .map((chamber) => ({
      chamberId: chamber.id,
      name: chamber.name,
      registryId: chamber.entity_registry_id,
      rows: rowsByRegistryId.get(chamber.entity_registry_id) ?? [],
    }))
    .filter((group) => group.rows.length > 0);
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { searchParams } = request.nextUrl;
  const scope = searchParams.get("scope");
  const officeId = await requireWorkspaceOfficeId(searchParams.get("officeId"));
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20), 1), 100);

  try {
    const supabase = getSupabaseAdmin();

    if (scope === "agent") {
      const agentId = searchParams.get("agentId")?.trim();
      if (!agentId) {
        return NextResponse.json({ error: "agentId обязателен" }, { status: 400 });
      }

      const [{ data: agent }, { data: allLogs, error: logsError }] = await Promise.all([
        supabase
          .from("agents")
          .select("id, name, provider, model_id, status, cost_tier, created_at")
          .eq("id", agentId)
          .maybeSingle(),
        supabase
          .from("request_logs")
          .select("id, agent_id, question, response, status, latency_ms, created_at")
          .eq("office_id", officeId)
          .eq("agent_id", agentId)
          .order("created_at", { ascending: false })
          .limit(STATS_LOGS_FETCH_LIMIT),
      ]);

      if (logsError) {
        return NextResponse.json({ error: logsError.message }, { status: 500 });
      }

      const logs = (allLogs ?? []) as LogRow[];
      const stats = summarizeLogs(logs);

      return NextResponse.json({
        stats,
        recentLogs: logs.slice(0, limit),
        agent: agent ?? null,
      });
    }

    if (scope === "chamber") {
      const chamberId = forChamberId(searchParams.get("chamberId"));
      if (!chamberId) {
        return NextResponse.json({ error: "chamberId обязателен" }, { status: 400 });
      }

      const { data: chamberRow } = await supabase
        .from("chambers")
        .select("id, name, entity_registry_id")
        .eq("id", chamberId)
        .maybeSingle();

      const { data: assignments, error: assignError } = await supabase
        .from("agent_assignments")
        .select("agent_id, agents(id, name, provider, model_id, cost_tier)")
        .eq("chamber_id", chamberId);

      if (assignError) {
        return NextResponse.json({ error: assignError.message }, { status: 500 });
      }

      const agentIds = [...new Set((assignments ?? []).map((a) => a.agent_id).filter(Boolean))];
      const agentsInScope = (assignments ?? []).map((a) => {
        const ag = Array.isArray(a.agents) ? a.agents[0] : a.agents;
        return {
          id: a.agent_id,
          name: ag?.name ?? a.agent_id.slice(0, 8),
          provider: ag?.provider ?? null,
          model_id: ag?.model_id ?? null,
          cost_tier: ag?.cost_tier ?? null,
        };
      });

      if (agentIds.length === 0) {
        return NextResponse.json({
          stats: {
            requestCount: 0,
            successCount: 0,
            errorCount: 0,
            pendingCount: 0,
            estimatedTokens: 0,
          },
          recentLogs: [],
          agentsInScope,
          agentStats: [],
          archiveGroups: chamberRow ? await loadArchiveGroups(supabase, [chamberRow]) : [],
        });
      }

      const { data: allLogs, error: logsError } = await supabase
        .from("request_logs")
        .select("id, agent_id, question, response, status, latency_ms, created_at")
        .eq("office_id", officeId)
        .in("agent_id", agentIds)
        .order("created_at", { ascending: false })
        .limit(STATS_LOGS_FETCH_LIMIT);

      if (logsError) {
        return NextResponse.json({ error: logsError.message }, { status: 500 });
      }

      const logs = (allLogs ?? []) as LogRow[];
      const stats = summarizeLogs(logs);
      const nameById = new Map(agentsInScope.map((a) => [a.id, a.name]));

      const agentStats = agentIds.map((id) => {
        const agentLogs = logs.filter((l) => l.agent_id === id);
        const s = summarizeLogs(agentLogs);
        return { agentId: id, name: nameById.get(id) ?? id.slice(0, 8), ...s };
      });

      return NextResponse.json({
        stats,
        recentLogs: logs.slice(0, limit).map((l) => ({
          ...l,
          agent_name: l.agent_id ? nameById.get(l.agent_id) ?? null : null,
        })),
        agentsInScope,
        agentStats,
        archiveGroups: chamberRow ? await loadArchiveGroups(supabase, [chamberRow]) : [],
      });
    }

    if (scope === "building") {
      const buildingId = searchParams.get("buildingId")?.trim();
      if (!buildingId) {
        return NextResponse.json({ error: "buildingId обязателен" }, { status: 400 });
      }

      const { data: chambers, error: chamberError } = await supabase
        .from("chambers")
        .select("id, name, entity_registry_id")
        .or(`building_object_id.eq.${buildingId},building_entity_id.eq.${buildingId}`);

      if (chamberError) {
        return NextResponse.json({ error: chamberError.message }, { status: 500 });
      }

      const chamberIds = (chambers ?? []).map((c) => c.id);
      if (chamberIds.length === 0) {
        return NextResponse.json({
          stats: {
            requestCount: 0,
            successCount: 0,
            errorCount: 0,
            pendingCount: 0,
            estimatedTokens: 0,
          },
          recentLogs: [],
          chambersInScope: [],
          archiveGroups: [],
        });
      }

      const { data: assignments, error: assignError } = await supabase
        .from("agent_assignments")
        .select("agent_id, chamber_id")
        .in("chamber_id", chamberIds);

      if (assignError) {
        return NextResponse.json({ error: assignError.message }, { status: 500 });
      }

      const agentIds = [...new Set((assignments ?? []).map((a) => a.agent_id).filter(Boolean))];

      const chamberSummaries = (chambers ?? []).map((ch) => {
        const chamberAgentIds = new Set(
          (assignments ?? []).filter((a) => a.chamber_id === ch.id).map((a) => a.agent_id),
        );
        return {
          chamberId: ch.id,
          name: ch.name,
          registryId: ch.entity_registry_id,
          agentCount: chamberAgentIds.size,
        };
      });

      if (agentIds.length === 0) {
        return NextResponse.json({
          stats: {
            requestCount: 0,
            successCount: 0,
            errorCount: 0,
            pendingCount: 0,
            estimatedTokens: 0,
          },
          recentLogs: [],
          chambersInScope: chamberSummaries,
          archiveGroups: await loadArchiveGroups(supabase, chambers ?? []),
        });
      }

      const { data: allLogs, error: logsError } = await supabase
        .from("request_logs")
        .select("id, agent_id, question, response, status, latency_ms, created_at")
        .eq("office_id", officeId)
        .in("agent_id", agentIds)
        .order("created_at", { ascending: false })
        .limit(STATS_LOGS_FETCH_LIMIT);

      if (logsError) {
        return NextResponse.json({ error: logsError.message }, { status: 500 });
      }

      const logs = (allLogs ?? []) as LogRow[];
      const stats = summarizeLogs(logs);

      const agentToChamber = new Map<string, string>();
      for (const a of assignments ?? []) {
        const ch = chambers?.find((c) => c.id === a.chamber_id);
        if (ch) agentToChamber.set(a.agent_id, ch.name);
      }

      const chambersWithStats = chamberSummaries.map((ch) => {
        const chamberAgentIds = new Set(
          (assignments ?? []).filter((a) => a.chamber_id === ch.chamberId).map((a) => a.agent_id),
        );
        const chamberLogs = logs.filter((l) => l.agent_id && chamberAgentIds.has(l.agent_id));
        const s = summarizeLogs(chamberLogs);
        return { ...ch, ...s };
      });

      return NextResponse.json({
        stats,
        recentLogs: logs.slice(0, limit).map((l) => ({
          ...l,
          agent_name: l.agent_id ? agentToChamber.get(l.agent_id) ?? null : null,
        })),
        chambersInScope: chambersWithStats,
        archiveGroups: await loadArchiveGroups(supabase, chambers ?? []),
      });
    }

    if (scope === "connection") {
      const connectionId = searchParams.get("connectionId")?.trim();
      if (!connectionId) {
        return NextResponse.json({ error: "connectionId обязателен" }, { status: 400 });
      }

      const { data: conn, error: connError } = await supabase
        .from("connections")
        .select(`
          id,
          source_entity_id,
          target_entity_id,
          priority,
          is_active,
          created_at,
          source:entity_registry!source_entity_id(name, entity_type),
          target:entity_registry!target_entity_id(name, entity_type),
          connection_permissions(read_knowledge, read_rules, read_results, send_tasks)
        `)
        .eq("id", connectionId)
        .maybeSingle();

      if (connError) {
        return NextResponse.json({ error: connError.message }, { status: 500 });
      }
      if (!conn) {
        return NextResponse.json({ error: "Connection not found" }, { status: 404 });
      }

      const sourceEmbed = Array.isArray(conn.source) ? conn.source[0] : conn.source;
      const targetEmbed = Array.isArray(conn.target) ? conn.target[0] : conn.target;
      const permsRaw = conn.connection_permissions;
      const perms = Array.isArray(permsRaw) ? permsRaw[0] : permsRaw;

      const agentIds = await resolveAgentIdsForEntity(
        supabase,
        conn.source_entity_id,
        sourceEmbed?.entity_type ?? null,
      );

      let stats = {
        requestCount: 0,
        successCount: 0,
        errorCount: 0,
        pendingCount: 0,
        estimatedTokens: 0,
      };

      if (agentIds.length > 0) {
        const { data: logs, error: logsError } = await supabase
          .from("request_logs")
          .select("id, agent_id, question, response, status, latency_ms, created_at")
          .eq("office_id", officeId)
          .in("agent_id", agentIds)
          .order("created_at", { ascending: false })
          .limit(STATS_LOGS_FETCH_LIMIT);

        if (logsError) {
          return NextResponse.json({ error: logsError.message }, { status: 500 });
        }
        stats = summarizeLogs((logs ?? []) as LogRow[]);
      }

      const createdAt = conn.created_at ? new Date(conn.created_at).getTime() : Date.now();
      const activeDurationMs = Math.max(0, Date.now() - createdAt);

      return NextResponse.json({
        stats,
        connection: {
          id: conn.id,
          priority: conn.priority ?? 0,
          is_active: conn.is_active ?? true,
          permissions: perms ?? {
            connection_id: connectionId,
            read_knowledge: false,
            read_rules: false,
            read_results: false,
            send_tasks: false,
          },
          sourceLabel: sourceEmbed?.name ?? conn.source_entity_id.slice(0, 8),
          targetLabel: targetEmbed?.name ?? conn.target_entity_id.slice(0, 8),
          sourceRegistryId: conn.source_entity_id,
          targetRegistryId: conn.target_entity_id,
          created_at: conn.created_at ?? "",
        },
        activeDurationMs,
        statsNote:
          agentIds.length > 0
            ? "Запросы агентов на стороне источника"
            : "Нет агентов на стороне источника — статистика недоступна",
      });
    }

    return NextResponse.json({ error: "scope должен быть agent, chamber, building или connection" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function resolveAgentIdsForEntity(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  entityId: string,
  entityType: string | null,
): Promise<string[]> {
  if (entityType === "agent") {
    return [entityId];
  }

  if (entityType === "chamber") {
    const { data: chamber } = await supabase
      .from("chambers")
      .select("id")
      .eq("entity_registry_id", entityId)
      .maybeSingle();
    if (!chamber?.id) return [];

    const { data: assignments } = await supabase
      .from("agent_assignments")
      .select("agent_id")
      .eq("chamber_id", chamber.id);
    return [...new Set((assignments ?? []).map((a) => a.agent_id).filter(Boolean))];
  }

  if (entityType === "building") {
    const { data: chambers } = await supabase
      .from("chambers")
      .select("id")
      .or(`building_object_id.eq.${entityId},building_entity_id.eq.${entityId}`);
    const chamberIds = (chambers ?? []).map((c) => c.id);
    if (chamberIds.length === 0) return [];

    const { data: assignments } = await supabase
      .from("agent_assignments")
      .select("agent_id")
      .in("chamber_id", chamberIds);
    return [...new Set((assignments ?? []).map((a) => a.agent_id).filter(Boolean))];
  }

  const { data: registry } = await supabase
    .from("entity_registry")
    .select("entity_type")
    .eq("id", entityId)
    .maybeSingle();

  if (registry?.entity_type) {
    return resolveAgentIdsForEntity(supabase, entityId, registry.entity_type);
  }

  return [];
}

function forChamberId(raw: string | null): string | null {
  const id = raw?.trim();
  return id || null;
}
