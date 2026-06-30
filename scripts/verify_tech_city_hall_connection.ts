/**
 * Verify Tech Department → City Hall connection exists (API or direct logic).
 * Run: npx tsx scripts/verify_tech_city_hall_connection.ts
 */
import * as fs from "fs";
import { getSupabaseAdmin } from "../lib/supabase/admin";
import {
  findTechDepartmentCityHallConnection,
  TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID,
} from "../lib/tech-department-escalation";
import {
  requireExternalEntryOfficeId,
  requireTechDepartmentBuildingId,
} from "../lib/workspace/graph-identity-required";

try {
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
} catch {
  /* optional */
}

const BASE = process.env.VERIFY_BASE_URL ?? "http://localhost:3000";

async function verifyViaApi(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/tech-department/escalations`, {
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("API escalations:", res.status);
      return false;
    }
    const data = (await res.json()) as {
      connection?: {
        connectionId: string;
        sendTasks: boolean;
        readResults: boolean;
      } | null;
    };
    const c = data.connection;
    if (!c?.connectionId) {
      console.error("FAIL: connection null in API response");
      return false;
    }
    console.log("API connection:", c);
    return c.connectionId === TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID && c.readResults === true;
  } catch (err) {
    console.warn("API check skipped:", err instanceof Error ? err.message : err);
    return false;
  }
}

async function main() {
  const officeId = await requireExternalEntryOfficeId();
  const techBuildingId = await requireTechDepartmentBuildingId(officeId);
  console.log("Tech Dept building:", techBuildingId);
  console.log("Expected connection id:", TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID);

  const direct = await findTechDepartmentCityHallConnection();
  if (direct) {
    console.log("Direct DB lookup:", direct);

    const supabase = getSupabaseAdmin();
    const { data: row } = await supabase
      .from("connections")
      .select("id, is_active")
      .eq("id", direct.connectionId)
      .maybeSingle();

    if (!row?.is_active) {
      console.error("FAIL: connection not active");
      process.exit(1);
    }
    if (direct.connectionId !== TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID) {
      console.error("FAIL: unexpected connection id");
      process.exit(1);
    }
    if (!direct.readResults) {
      console.error("FAIL: read_results must be true");
      process.exit(1);
    }
    console.log("OK: active system edge with read_results (escalation via edge existence)");
  } else {
    console.warn("Direct lookup: connection not found (migration not applied?)");
  }

  const viaApi = await verifyViaApi();
  if (viaApi) {
    console.log("OK: API confirms connection");
  }

  if (!direct && !viaApi) {
    console.error(
      "FAIL: no connection. Apply supabase/migrations/20260624240000_tech_department_city_hall_connection.sql",
    );
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
