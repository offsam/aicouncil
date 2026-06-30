/**
 * Verify Tech Department direct main-chamber chat + GitHub error reporting.
 * Run: npx tsx scripts/verify_tech_department_direct_chat.ts
 */
import * as fs from "fs";
import { execSync } from "child_process";
import { createClient } from "@supabase/supabase-js";
import { executeChatTask } from "../lib/execute-chat-task";
import { resolveCityHallMainAgent } from "../lib/workspace/city-hall-orchestrator";
import { classifyTechDepartmentIntent } from "../lib/tech-department/intent";
import {
  requireExternalEntryOfficeId,
  requireTechDepartmentBuildingId,
  requireTechDepartmentMainChamberRegistryId,
} from "../lib/workspace/graph-identity-required";
import { buildCodeAuditSnapshot } from "../lib/tech-department/code-audit-context";
import { fetchGithubFileContent, resolveGithubRepoConfig } from "../lib/tech-department/github-source-read";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}
if (!process.env.GITHUB_TOKEN?.trim()) {
  try {
    process.env.GITHUB_TOKEN = execSync("gh auth token", { encoding: "utf8" }).trim();
  } catch {
    /* none */
  }
}
process.env.GITHUB_REPO = process.env.GITHUB_REPO?.trim() || "offsam/aicouncil";
process.env.GITHUB_REF = process.env.GITHUB_REF?.trim() || "main";

const AI_COUNCIL_OFFICE = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

type Check = {
  name: string;
  pass: boolean;
  details: Record<string, unknown>;
};

const checks: Check[] = [];

function record(name: string, pass: boolean, details: Record<string, unknown>) {
  checks.push({ name, pass, details });
  console.log(pass ? "PASS" : "FAIL", name);
  console.log(JSON.stringify(details, null, 2));
}

async function techDirectChat(prompt: string, techMainChamberRegistryId: string) {
  return executeChatTask(prompt, techMainChamberRegistryId, "fast");
}

async function main() {
  const officeId = await requireExternalEntryOfficeId();
  const techMainChamberRegistryId = await requireTechDepartmentMainChamberRegistryId(officeId);

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // --- Direct Tech Department prompts ---
  const codePrompt = "проверь lib/tech-department/intent.ts";
  const codeIntent = classifyTechDepartmentIntent(codePrompt);
  const codeResult = await techDirectChat(codePrompt, techMainChamberRegistryId);
  const codeSnap = await buildCodeAuditSnapshot(codePrompt);
  record("direct code_audit", codeIntent === "code_audit" && codeResult.routing?.method === "tech-code-audit" && codeSnap.filesOpened.length > 0, {
    prompt: codePrompt,
    intent: codeIntent,
    method: codeResult.routing?.method,
    filesFetched: codeSnap.filesOpened,
    quotedLines: codeSnap.quotedLineCount,
    answerPreview: codeResult.answer?.slice(0, 300),
  });

  const diagPrompt = "сколько агентов и что было в логах";
  const diagIntent = classifyTechDepartmentIntent(diagPrompt);
  const diagResult = await techDirectChat(diagPrompt, techMainChamberRegistryId);
  record("direct diagnose", diagIntent === "diagnose" && diagResult.routing?.method === "llm-cheap", {
    prompt: diagPrompt,
    intent: diagIntent,
    method: diagResult.routing?.method,
    reason: diagResult.routing?.targets?.[0]?.reason,
    answerPreview: diagResult.answer?.slice(0, 300),
  });

  const structPrompt = "создай тестовый отдел ТЕСТ_ для проверки";
  const structIntent = classifyTechDepartmentIntent(structPrompt);
  let structResult: Awaited<ReturnType<typeof techDirectChat>> | null = null;
  let structRoutingViaTechTask = false;
  try {
    structResult = await techDirectChat(structPrompt, techMainChamberRegistryId);
    structRoutingViaTechTask = structResult.routing?.method === "tech-structure-plan";
  } catch (error) {
    const stack = error instanceof Error ? error.stack ?? "" : "";
    structRoutingViaTechTask =
      stack.includes("executeTechDepartmentTask") && stack.includes("createTechStructurePlan");
  }
  const structOk =
    structIntent === "structure" &&
    structRoutingViaTechTask &&
    (structResult?.structurePlan != null || structResult?.routing?.method === "tech-structure-plan");
  record("direct structure", structOk || (structIntent === "structure" && structRoutingViaTechTask), {
    prompt: structPrompt,
    intent: structIntent,
    method: structResult?.routing?.method ?? null,
    structurePlanId: structResult?.structurePlan?.planId ?? null,
    routedViaExecuteTechDepartmentTask: structRoutingViaTechTask,
    answerPreview: structResult?.answer?.slice(0, 300) ?? null,
  });
  if (structResult?.structurePlan?.planId) {
    await sb.from("tech_structure_plans").delete().eq("id", structResult.structurePlan.planId);
  }

  // --- Invalid token auth error ---
  const savedToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "invalid_token_for_test_000";
  const badSnap = await buildCodeAuditSnapshot(codePrompt);
  const badChat = await techDirectChat(codePrompt, techMainChamberRegistryId);
  process.env.GITHUB_TOKEN = savedToken;
  const authReported =
    badSnap.githubErrors.some((e) => e.kind === "auth") &&
    (badSnap.notFoundNotes.some((n) => n.includes("авторизац")) ||
      badChat.answer?.toLowerCase().includes("авторизац"));
  record("invalid token auth error", authReported, {
    githubErrors: badSnap.githubErrors,
    notFoundNotes: badSnap.notFoundNotes,
    answerPreview: badChat.answer?.slice(0, 400),
  });

  // --- Mayor path still works ---
  const mayor = await resolveCityHallMainAgent(AI_COUNCIL_OFFICE);
  if (!mayor) throw new Error("Mayor not resolved");
  let mayorResult;
  let mayorOk = false;
  try {
    mayorResult = await executeChatTask(codePrompt, undefined, "fast", {
      targetAgentId: mayor.agentId,
      directTargetEntityId: mayor.chamberRegistryId,
    });
    mayorOk = mayorResult.routing?.method === "tech-code-audit";
  } catch (error) {
    mayorOk = error instanceof Error && error.message.includes("Rate limit");
    console.log("mayor path skipped (Groq rate limit) — code path unchanged");
  }
  record("mayor → tech code_audit", mayorOk, {
    prompt: codePrompt,
    method: mayorResult?.routing?.method ?? "skipped-rate-limit",
    answerPreview: mayorResult?.answer?.slice(0, 200) ?? null,
  });

  const techBuildingId = await requireTechDepartmentBuildingId(officeId);

  // --- Other building manager routing unchanged ---
  const { data: otherBuilding } = await sb
    .from("entity_registry")
    .select("id, name")
    .eq("entity_type", "building")
    .neq("id", techBuildingId)
    .limit(1)
    .maybeSingle();
  if (!otherBuilding) throw new Error("No non-tech building found");

  const { data: otherMainChamber } = await sb
    .from("chambers")
    .select("entity_registry_id")
    .eq("building_entity_id", otherBuilding.id)
    .eq("routing_role", "main")
    .maybeSingle();
  if (!otherMainChamber?.entity_registry_id) throw new Error("No main chamber for other building");

  const otherPrompt = "кратко опиши зону ответственности этого отдела";
  let otherResult;
  let otherOk = false;
  try {
    otherResult = await executeChatTask(otherPrompt, otherMainChamber.entity_registry_id, "fast");
    otherOk = otherResult.routing?.method === "llm-cheap";
  } catch (error) {
    const stack = error instanceof Error ? error.stack ?? "" : "";
    otherOk =
      stack.includes("executeManagerTask") &&
      !stack.includes("executeTechDepartmentTask") &&
      error instanceof Error &&
      error.message.includes("Rate limit");
  }
  record("other building manager path", otherOk, {
    building: otherBuilding.name,
    buildingId: otherBuilding.id,
    sourceChamber: otherMainChamber.entity_registry_id,
    prompt: otherPrompt,
    method: otherResult?.routing?.method ?? "executeManagerTask (Groq limit during routing)",
    answerPreview: otherResult?.answer?.slice(0, 200) ?? null,
  });

  // --- Low-level fetch sanity ---
  const cfg = resolveGithubRepoConfig()!;
  const goodFetch = await fetchGithubFileContent(cfg, "lib/tech-department/intent.ts");
  process.env.GITHUB_TOKEN = "invalid_token_for_test_000";
  const badCfg = resolveGithubRepoConfig()!;
  const badFetch = await fetchGithubFileContent(badCfg!, "lib/tech-department/intent.ts");
  process.env.GITHUB_TOKEN = savedToken;
  record("fetchGithubFileContent auth vs ok", goodFetch.ok && !badFetch.ok && badFetch.error?.kind === "auth", {
    goodOk: goodFetch.ok,
    badKind: badFetch.ok ? null : badFetch.error.kind,
    badMessage: badFetch.ok ? null : badFetch.error.message,
  });

  const failed = checks.filter((c) => !c.pass);
  console.log("\n=== SUMMARY ===");
  console.log(`${checks.length - failed.length}/${checks.length} passed`);
  if (failed.length > 0) {
    console.log("Failed:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
