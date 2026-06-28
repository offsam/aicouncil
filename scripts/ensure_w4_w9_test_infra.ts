/**
 * Idempotent setup for isolated W4/W9 test building + chambers + free-tier agents.
 * Run: npx tsx scripts/ensure_w4_w9_test_infra.ts
 */
import { createClient } from "@supabase/supabase-js";
import { ensureW4W9TestInfra, loadEnvLocal } from "../lib/w4-w9-test-infra";

loadEnvLocal();

const BASE = process.env.W4W9_TEST_BASE ?? "http://localhost:3000";

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const infra = await ensureW4W9TestInfra(supabase, BASE);
  console.log(JSON.stringify(infra, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
