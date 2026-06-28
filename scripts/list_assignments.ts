import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

async function run() {
  const envContent = fs.readFileSync(".env.local", "utf8");
  for (const line of envContent.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(url, key);

  const { data: assignments, error } = await supabase.from("agent_assignments").select("id, agent_id, chamber_id");
  if (error) {
    console.error(error);
  } else {
    console.log("Agent Assignments in DB:", assignments.length);
    for (const a of assignments) {
      console.log(`Assignment ID: ${a.id}`);
      console.log(`  Agent ID: ${a.agent_id}`);
      console.log(`  Chamber ID: ${a.chamber_id}`);
    }
  }
}

run().catch(console.error);
