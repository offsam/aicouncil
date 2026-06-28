/**
 * Verify Tech Department → City Hall connection exists (API or direct logic).
 * Run: npx tsx scripts/verify_tech_city_hall_connection.ts
 */
import * as fs from "fs";
import {
  findTechDepartmentCityHallConnection,
  TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID,
} from "../lib/tech-department-escalation";
import { TECH_DEPARTMENT_BUILDING_ID } from "../lib/workspace/tech-department";

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
    if (!c) {
      console.error("FAIL: connection null in API response");
      return false;
    }
    console.log("API connection:", c);
    return c.sendTasks && c.readResults;
  } catch (err) {
    console.warn("API check skipped:", err instanceof Error ? err.message : err);
    return false;
  }
}

async function main() {
  console.log("Tech Dept building:", TECH_DEPARTMENT_BUILDING_ID);
  console.log("Expected connection id:", TECH_DEPARTMENT_CITY_HALL_CONNECTION_ID);

  const direct = await findTechDepartmentCityHallConnection();
  if (direct) {
    console.log("Direct DB lookup:", direct);
    if (!direct.sendTasks || !direct.readResults) {
      console.error("FAIL: permissions incomplete");
      process.exit(1);
    }
    console.log("OK: connection found with send_tasks + read_results");
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
