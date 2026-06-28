import * as fs from "fs";
import { getSupabaseAdmin } from "../lib/supabase/admin";

const envPath = "./.env.local";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const parts = line.split("=");
    if (parts.length >= 2) process.env[parts[0].trim()] = parts.slice(1).join("=").trim();
  }
}

async function main() {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("agent_assignments").select("id").limit(1);
  console.log("agent_assignments:", error ? `MISSING (${error.message})` : "OK");
  const { data: nullRules } = await supabase
    .from("rules")
    .select("id")
    .is("entity_registry_id", null)
    .limit(3);
  console.log("rules with null entity_registry_id:", nullRules?.length ?? "?");
}

main().catch(console.error);
