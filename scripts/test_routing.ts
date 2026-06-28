import * as fs from "fs";
import { resolveRoute } from "../lib/routing";

// Load environment variables manually from .env.local
const envContent = fs.readFileSync(".env.local", "utf8");
for (const line of envContent.split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

async function run() {
  console.log("=== ROUTING TEST FOR 'сколько кабелей подключено' ===");
  const cityHallChamberId = "9f52e7ae-495d-49d8-ad79-444d25d53b7c";

  console.log("\n1. Calling resolveRoute WITH City Hall sourceEntityId...");
  const decisionWithSource = await resolveRoute("сколько кабелей подключено", undefined, cityHallChamberId);
  console.log("Decision:", JSON.stringify(decisionWithSource, null, 2));

  console.log("\n2. Calling resolveRoute WITHOUT sourceEntityId...");
  const decisionWithoutSource = await resolveRoute("сколько кабелей подключено", undefined, undefined);
  console.log("Decision:", JSON.stringify(decisionWithoutSource, null, 2));
}

run().catch(console.error);
