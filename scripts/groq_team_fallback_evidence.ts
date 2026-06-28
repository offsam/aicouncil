/**
 * Live Team run proving Groq auto-fallback when primary model is rate-limited.
 */
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { exitEvidence } from "./evidence-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const BASE = "http://localhost:3000";
const OUT = path.join(process.cwd(), "docs/evidence/groq-team-fallback-live");
const INSTAGRAM = "39d9aa14-6eb3-4359-bd21-ee9a148d62b8";
const TERMINALS_DIR = path.join(
  process.env.HOME ?? "",
  ".cursor/projects/Users-sammov-AI-consult/terminals",
);

const TEAM_AGENT_IDS = [
  "a1000005-0000-4000-8000-000000000005",
  "a1000004-0000-4000-8000-000000000004",
  "a1000007-0000-4000-8000-000000000007",
];

function findDevServerLog(): string {
  const files = fs
    .readdirSync(TERMINALS_DIR)
    .filter((f) => f.endsWith(".txt"))
    .map((f) => path.join(TERMINALS_DIR, f))
    .filter((p) => fs.readFileSync(p, "utf8").includes("next dev"))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] ?? "";
}

async function ensureTeamRoster(supabase: ReturnType<typeof createClient>) {
  const { data: chamber } = await supabase
    .from("chambers")
    .select("id")
    .eq("entity_registry_id", INSTAGRAM)
    .maybeSingle();
  if (!chamber?.id) throw new Error("Instagram chamber not found");
  await supabase.from("agent_assignments").delete().eq("chamber_id", chamber.id);
  for (const agentId of TEAM_AGENT_IDS) {
    const { error } = await supabase.from("agent_assignments").insert({
      chamber_id: chamber.id,
      agent_id: agentId,
    });
    if (error) throw new Error(error.message);
  }
}

/** Hammer primary model to trigger Groq TPD/rate limit before Team run. */
async function exhaustPrimaryGroqModel(): Promise<{ attempts: number; lastError?: string }> {
  const apiKey = process.env.GROQ_API_KEY!;
  let attempts = 0;
  let lastError: string | undefined;

  for (let i = 0; i < 40; i++) {
    attempts++;
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: `Write a detailed 800-word essay about AI council systems iteration ${i}. Include many examples.`,
          },
        ],
      }),
    });
    const data = await response.json();
    if (response.status === 429) {
      lastError = data.error?.message ?? "429 rate limit";
      break;
    }
    if (!response.ok) {
      lastError = data.error?.message ?? `HTTP ${response.status}`;
      if (response.status !== 200) break;
    }
  }

  return { attempts, lastError };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const serverLog = findDevServerLog();
  const logStart = serverLog
    ? fs.readFileSync(serverLog, "utf8").split("\n").length
    : 0;

  const exhaust = await exhaustPrimaryGroqModel();
  fs.writeFileSync(path.join(OUT, "exhaust-primary.json"), JSON.stringify(exhaust, null, 2));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  await ensureTeamRoster(supabase);

  const ts = Date.now();
  const teamTask = `Groq fallback Team live ${ts}`;
  const teamRes = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskText: teamTask,
      executionMode: "team",
      sourceEntityId: INSTAGRAM,
    }),
  });
  const teamData = await teamRes.json();
  fs.writeFileSync(path.join(OUT, "team-api-response.json"), JSON.stringify(teamData, null, 2));

  const serverLogs = serverLog
    ? fs
        .readFileSync(serverLog, "utf8")
        .split("\n")
        .slice(logStart)
        .filter((l) => /\[groq\]|\[executeChatTask\] executionMode=team|\[executeParallelAgents\]/.test(l))
    : [];
  fs.writeFileSync(path.join(OUT, "server-logs.txt"), serverLogs.join("\n"));

  const groqLogs = serverLogs.filter((l) => l.includes("[groq]"));
  const hadAutoFallback = groqLogs.some((l) => l.includes("auto-fallback"));

  const agents = (teamData.team?.agents ?? []) as Array<{
    slug: string;
    status: string;
    error?: string;
    answer?: string;
  }>;
  const groqAgent = agents.find((a) => a.slug === "groq");
  const successCount = agents.filter((a) => a.status === "success").length;

  const report = {
    step: "groq-team-fallback-live",
    timestamp: new Date().toISOString(),
    pass: hadAutoFallback && teamRes.ok && successCount >= 2,
    exhaustPrimary: exhaust,
    team: {
      httpStatus: teamRes.status,
      successCount,
      invokedCount: teamData.team?.invokedCount,
      partial: teamData.team?.partial,
      groqAgent: groqAgent
        ? {
            status: groqAgent.status,
            error: groqAgent.error,
            answerPreview: groqAgent.answer?.slice(0, 160),
          }
        : null,
      agents: agents.map((a) => ({
        slug: a.slug,
        status: a.status,
        error: a.error?.slice(0, 120),
      })),
      summaryPreview: teamData.team?.summary?.slice(0, 200),
    },
    groqFallback: {
      hadAutoFallback,
      logLines: groqLogs,
    },
    serverLogSource: serverLog,
    serverLogLineFrom: logStart,
  };

  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  exitEvidence(report.pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  exitEvidence(1);
});
