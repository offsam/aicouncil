/**
 * LLM-ROLES-1B: API + Inspector City Hall service LLM roles.
 * Run: npx tsx scripts/verify_llm_roles_1b.ts
 */
import * as fs from "fs";
import { invokeCheapLLM } from "../lib/cheap-llm";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import {
  listSystemLlmRolesForOffice,
  updateSystemLlmRoleForOffice,
} from "../lib/system-llm-roles";
import { requireExternalEntryOfficeId } from "../lib/workspace/graph-identity-required";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

async function main() {
  const officeId = await requireExternalEntryOfficeId();
  const sb = getSupabaseAdmin();

  console.log("=== GET list (lib) ===\n");
  const listed = await listSystemLlmRolesForOffice(officeId);
  record("returns 3 roles", listed.length === 3, listed.map((r) => r.role));

  const routerBefore = listed.find((r) => r.role === "router")!;
  const savedPrimary = routerBefore.primaryProvider;
  const savedPrimaryModel = routerBefore.primaryModel;

  console.log("\n=== PATCH router primary → groq ===\n");
  const groqModel = "llama-3.3-70b-versatile";
  const updated = await updateSystemLlmRoleForOffice(officeId, "router", {
    primaryProvider: "groq",
    primaryModel: groqModel,
  });
  record("router primary is groq", updated.primaryProvider === "groq");
  record("router primary model set", updated.primaryModel === groqModel);

  const reloaded = await listSystemLlmRolesForOffice(officeId);
  const routerAfter = reloaded.find((r) => r.role === "router")!;
  record("reload matches patch", routerAfter.primaryProvider === "groq" && routerAfter.primaryModel === groqModel);

  console.log("\n=== invokeCheapLLM city-router uses new provider (check logs) ===\n");
  try {
    await invokeCheapLLM({
      purpose: "city-router",
      prompt: "Reply with JSON: {\"route\":\"mayor\"}",
      responseFormat: "json",
      officeId,
    });
    record("invokeCheapLLM city-router completed", true);
  } catch (err) {
    record("invokeCheapLLM city-router completed", false, err);
  }

  console.log("\n=== Restore router primary ===\n");
  await updateSystemLlmRoleForOffice(officeId, "router", {
    primaryProvider: savedPrimary,
    primaryModel: savedPrimaryModel,
  });
  const restored = (await listSystemLlmRolesForOffice(officeId)).find((r) => r.role === "router")!;
  record(
    "router restored",
    restored.primaryProvider === savedPrimary && restored.primaryModel === savedPrimaryModel,
  );

  console.log("\n=== API route files exist ===\n");
  record(
    "GET route file",
    fs.existsSync("app/api/offices/[officeId]/system-llm-roles/route.ts"),
  );
  record(
    "PATCH route file",
    fs.existsSync("app/api/offices/[officeId]/system-llm-roles/[role]/route.ts"),
  );
  record(
    "Inspector panel component",
    fs.existsSync("components/workspace/inspector/SystemLlmRolesPanel.tsx"),
  );

  const inspectorSrc = fs.readFileSync("components/workspace/WorkspaceInspector.tsx", "utf8");
  record(
    "Inspector wires City Hall section",
    inspectorSrc.includes("Служебные LLM-роли") &&
      inspectorSrc.includes("SystemLlmRolesPanel") &&
      inspectorSrc.includes("isCityHallTarget") &&
      inspectorSrc.includes('inspectorMode === "professional"'),
  );
  record(
    "TechDepartmentStatsPanel untouched import",
    inspectorSrc.includes("TechDepartmentStatsPanel"),
  );

  void sb;
}

void main();
