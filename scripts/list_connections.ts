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

  const { data: conns, error } = await supabase.from("connections").select("*");
  if (error) {
    console.error("Error fetching connections:", error.message);
  } else {
    console.log("Connections in DB:", conns.length);
    conns.forEach(c => {
      console.log(`Connection ID: ${c.id}`);
      console.log(`  Source: ${c.source_entity_id}`);
      console.log(`  Target: ${c.target_entity_id}`);
      console.log(`  Route Path:`, JSON.stringify(c.route_path));
    });
  }
}

run().catch(console.error);
