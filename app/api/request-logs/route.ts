import { NextRequest, NextResponse } from "next/server";
import { resolveAgentDbId } from "@/lib/ai-council-ids";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import type { LogStatus } from "@/lib/office-types";
import { requireWorkspaceOfficeId } from "@/lib/workspace/resolve-workspace-office-id";

interface AgentLogInput {
  slug: string;
  response?: string;
  status: LogStatus;
  latency_ms?: number;
}

interface RequestLogsBody {
  phase?: "start" | "complete";
  office_id?: string;
  question: string;
  agents?: AgentLogInput[];
  agent_slugs?: string[];
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ skipped: true, reason: "Supabase не настроен" });
  }

  try {
    const body = (await request.json()) as RequestLogsBody;
    const question = body.question?.trim();
    const officeId = await requireWorkspaceOfficeId(body.office_id);

    if (!question) {
      return NextResponse.json({ error: "question обязателен" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    if (body.phase === "start") {
      if (!Array.isArray(body.agent_slugs)) {
        return NextResponse.json({ error: "agent_slugs обязателен для phase=start" }, { status: 400 });
      }

      const logIds: Record<string, string> = {};
      for (const slug of body.agent_slugs) {
        const agentId = resolveAgentDbId(slug);
        if (!agentId) continue;

        const { data, error } = await supabase
          .from("request_logs")
          .insert({
            office_id: officeId,
            agent_id: agentId,
            question,
            response: null,
            status: "pending",
            latency_ms: null,
          })
          .select("id")
          .single();

        if (error) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        logIds[slug] = data.id;
      }

      return NextResponse.json({ ok: true, logIds });
    }

    if (!Array.isArray(body.agents)) {
      return NextResponse.json({ error: "agents обязателен" }, { status: 400 });
    }
    const rows: Array<{
      office_id: string;
      agent_id: string | null;
      question: string;
      response: string | null;
      status: LogStatus;
      latency_ms: number | null;
    }> = [
      {
        office_id: officeId,
        agent_id: null,
        question,
        response: null,
        status: "success",
        latency_ms: null,
      },
    ];

    for (const agent of body.agents) {
      const agentId = resolveAgentDbId(agent.slug);
      if (!agentId) continue;

      rows.push({
        office_id: officeId,
        agent_id: agentId,
        question,
        response: agent.response ?? null,
        status: agent.status,
        latency_ms: agent.latency_ms ?? null,
      });
    }

    const { error } = await supabase.from("request_logs").insert(rows);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
