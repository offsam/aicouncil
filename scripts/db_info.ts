import * as fs from "fs";
import { getSupabaseAdmin } from "../lib/supabase/admin";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function main() {
  const s = getSupabaseAdmin();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  console.log("URL:", url);
  const { data: offices } = await s.from("offices").select("id, name");
  console.log("offices:", offices);
  const { data: agents } = await s.from("agents").select("id, name").limit(3);
  console.log("agents sample:", agents);
}

main();
