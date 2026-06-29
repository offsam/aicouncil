/**
 * Verify SEC-01: INTERNAL_API_SECRET gate on X-02 context + X-03 connection [id] routes.
 * Run: npx tsx scripts/verify_internal_api_secret.ts
 */
import { NextRequest } from "next/server";
import {
  INTERNAL_SECRET_HEADER,
  requireInternalSecret,
} from "../lib/security/require-internal-secret";

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

function mockRequest(secretHeader?: string): NextRequest {
  const headers = new Headers();
  if (secretHeader !== undefined) {
    headers.set(INTERNAL_SECRET_HEADER, secretHeader);
  }
  return new NextRequest("http://localhost/api/test", { headers });
}

function responseSnapshot(res: Response) {
  return { status: res.status, body: res.body };
}

async function responseBody(res: Response): Promise<string> {
  return JSON.stringify(await res.json());
}

async function main() {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedSecret = process.env.INTERNAL_API_SECRET;

  console.log("=== Helper: production fail closed (secret unset) ===");
  process.env.NODE_ENV = "production";
  delete process.env.INTERNAL_API_SECRET;
  {
    const res = requireInternalSecret(mockRequest("anything"));
    record(
      "production + no env → 401 Unauthorized",
      res?.status === 401 && (await responseBody(res!)) === JSON.stringify({ error: "Unauthorized" }),
    );
  }

  console.log("\n=== Helper: production missing header ===");
  process.env.INTERNAL_API_SECRET = "test-secret-prod";
  {
    const res = requireInternalSecret(mockRequest());
    record(
      "production + missing header → 401 Unauthorized",
      res?.status === 401 && (await responseBody(res!)) === JSON.stringify({ error: "Unauthorized" }),
    );
  }

  console.log("\n=== Helper: production wrong secret ===");
  {
    const res = requireInternalSecret(mockRequest("wrong-secret"));
    record(
      "production + wrong secret → 401 Unauthorized (same body as missing header)",
      res?.status === 401 && (await responseBody(res!)) === JSON.stringify({ error: "Unauthorized" }),
    );
  }

  console.log("\n=== Helper: production valid secret ===");
  {
    const res = requireInternalSecret(mockRequest("test-secret-prod"));
    record("production + valid secret → allow (null)", res === null);
  }

  console.log("\n=== Helper: development bypass when secret unset ===");
  process.env.NODE_ENV = "development";
  delete process.env.INTERNAL_API_SECRET;
  {
    const res = requireInternalSecret(mockRequest());
    record("development + no env + no header → bypass", res === null);
  }

  console.log("\n=== Helper: development enforces secret when configured ===");
  process.env.INTERNAL_API_SECRET = "dev-secret";
  {
    const denied = requireInternalSecret(mockRequest("bad"));
    const allowed = requireInternalSecret(mockRequest("dev-secret"));
    record(
      "development + configured + wrong secret → 401",
      denied?.status === 401 &&
        (await responseBody(denied!)) === JSON.stringify({ error: "Unauthorized" }),
    );
    record("development + configured + valid secret → allow", allowed === null);
  }

  console.log("\n=== Helper: refusal responses are identical ===");
  process.env.NODE_ENV = "production";
  process.env.INTERNAL_API_SECRET = "same-secret";
  const noHeader = requireInternalSecret(mockRequest())!;
  const wrong = requireInternalSecret(mockRequest("not-same-secret"))!;
  process.env.INTERNAL_API_SECRET = "";
  const noEnv = requireInternalSecret(mockRequest("same-secret"))!;
  const noHeaderBody = await responseBody(noHeader);
  const wrongBody = await responseBody(wrong);
  const noEnvBody = await responseBody(noEnv);
  record(
    "missing header vs wrong secret vs missing env → same status+body",
    noHeader.status === wrong.status &&
      noHeader.status === noEnv.status &&
      noHeaderBody === wrongBody &&
      wrongBody === noEnvBody,
    {
      status: noHeader.status,
      body: JSON.parse(noHeaderBody),
    },
  );

  console.log("\n=== Source scan: secret not logged in helper ===");
  const helperSource = await import("fs/promises").then((fs) =>
    fs.readFile("lib/security/require-internal-secret.ts", "utf8"),
  );
  record(
    "require-internal-secret.ts has no console.log/error",
    !/\bconsole\.(log|error|warn|info|debug)\b/.test(helperSource),
  );
  record(
    "require-internal-secret.ts does not echo provided secret",
    !helperSource.includes("provided") || !helperSource.match(/console.*provided/),
  );

  console.log("\n=== X-03 method inventory (app/api/connections/[id]/route.ts) ===");
  const connIdRoute = await import("fs/promises").then((fs) =>
    fs.readFile("app/api/connections/[id]/route.ts", "utf8"),
  );
  record("PATCH exported and gated", /export async function PATCH/.test(connIdRoute) && connIdRoute.includes("requireInternalSecret"));
  record("DELETE exported and gated", /export async function DELETE/.test(connIdRoute) && connIdRoute.includes("requireInternalSecret"));
  record(
    "GET not present — not gated (no handler in this file)",
    !/export async function GET/.test(connIdRoute),
  );
  console.log(
    "Note: GET /api/connections (list) lives in app/api/connections/route.ts — out of SEC-01 X-03 scope per task.",
  );

  console.log("\n=== Untouched: Telegram + structure execute ===");
  const telegramWebhook = await import("fs/promises").then((fs) =>
    fs.readFile("app/api/telegram/webhook/route.ts", "utf8"),
  );
  const structureExecute = await import("fs/promises").then((fs) =>
    fs.readFile("app/api/tech-department/structure/execute/route.ts", "utf8"),
  );
  record(
    "telegram webhook unchanged (no requireInternalSecret import)",
    !telegramWebhook.includes("requireInternalSecret"),
  );
  record(
    "structure execute unchanged (no requireInternalSecret import)",
    !structureExecute.includes("requireInternalSecret"),
  );
  record(
    "telegram webhook still uses Telegram webhook secret gate",
    telegramWebhook.includes("getTelegramWebhookSecret") &&
      telegramWebhook.includes("verifyTelegramSecret"),
  );

  process.env.NODE_ENV = savedNodeEnv;
  if (savedSecret === undefined) {
    delete process.env.INTERNAL_API_SECRET;
  } else {
    process.env.INTERNAL_API_SECRET = savedSecret;
  }

  void responseSnapshot;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
