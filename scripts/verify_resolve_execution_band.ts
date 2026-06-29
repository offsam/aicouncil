/**
 * Verify resolveExecutionBand — hard assertions + TIER_DEFAULT_PATTERNS discrepancy report.
 * Run: npx tsx scripts/verify_resolve_execution_band.ts
 */
import * as fs from "fs";
import type { CostTier } from "../lib/cost-tier";
import { getModelCatalog } from "../lib/model-catalog/build-catalog";
import {
  classifyCatalogBandWithSource,
  resolveExecutionBand,
  type ResolveExecutionBandResult,
} from "../lib/model-catalog/resolve-execution-band";
import { inferCatalogCostTier } from "../lib/model-catalog/infer-cost-tier";

type Fixture = {
  provider: string;
  modelId: string;
  promptPrice?: number | null;
  completionPrice?: number | null;
  patternHaystackExtra?: string;
  note?: string;
};

/** T-1A baseline catalog discrepancy count (pre T-1A.1). */
const BASELINE_CATALOG_DISCREPANCY_COUNT = 141;

const HARD_ASSERTIONS: Array<{
  label: string;
  provider: string;
  modelId: string;
  expected: CostTier;
  promptPrice?: number | null;
  completionPrice?: number | null;
}> = [
  { label: "openai/gpt-4o → mid", provider: "openai", modelId: "gpt-4o", expected: "mid" },
  { label: "openai/gpt-4.1 → mid", provider: "openai", modelId: "gpt-4.1", expected: "mid" },
  {
    label: "openai/gpt-5-chat-latest → premium",
    provider: "openai",
    modelId: "gpt-5-chat-latest",
    expected: "premium",
  },
  {
    label: "google/gemini-2.0-flash → cheap",
    provider: "google",
    modelId: "gemini-2.0-flash",
    expected: "cheap",
  },
  {
    label: "google/gemini-2.5-pro → premium",
    provider: "google",
    modelId: "gemini-2.5-pro",
    expected: "premium",
  },
  {
    label: "anthropic/claude-opus-* → premium",
    provider: "anthropic",
    modelId: "claude-opus-4-20250514",
    expected: "premium",
  },
  {
    label: "anthropic/claude-sonnet-* → mid",
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    expected: "mid",
  },
  {
    label: "anthropic/claude-haiku-* → cheap",
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    expected: "cheap",
  },
  {
    label: "deepseek/deepseek-chat → mid",
    provider: "deepseek",
    modelId: "deepseek-chat",
    expected: "mid",
  },
  {
    label: "groq/llama-3.3-70b-versatile → free",
    provider: "groq",
    modelId: "llama-3.3-70b-versatile",
    expected: "free",
  },
  {
    label: "openrouter zero-price claude-opus без :free → premium",
    provider: "openrouter",
    modelId: "anthropic/claude-opus-4",
    expected: "premium",
    promptPrice: 0,
    completionPrice: 0,
  },
];

const FIXTURES: Fixture[] = [
  { provider: "groq", modelId: "llama-3.3-70b-versatile", note: "pattern:free + catalog:groq" },
  { provider: "groq", modelId: "compound-mini", note: "pattern:free" },
  { provider: "anthropic", modelId: "claude-haiku-4-5-20251001", note: "pattern:cheap" },
  { provider: "anthropic", modelId: "claude-sonnet-4-6", note: "pattern:mid" },
  { provider: "anthropic", modelId: "claude-opus-4-20250514", note: "pattern:premium" },
  { provider: "openai", modelId: "gpt-4o-mini", note: "pattern:cheap" },
  { provider: "openai", modelId: "gpt-4o", note: "pattern:mid" },
  { provider: "openai", modelId: "gpt-5-chat-latest", note: "pattern:premium" },
  { provider: "openai", modelId: "o3-mini", note: "pattern:premium" },
  { provider: "google", modelId: "gemini-2.5-flash", note: "pattern:cheap+mid overlap" },
  { provider: "google", modelId: "gemini-2.5-pro", note: "pattern:premium" },
  { provider: "deepseek", modelId: "deepseek-chat", note: "pattern:cheap+mid overlap" },
  { provider: "openrouter", modelId: "google/gemma-3-12b-it:free", note: "catalog:free_suffix" },
  {
    provider: "openrouter",
    modelId: "liquid/lfm-2.5-1.2b-thinking:free",
    note: "catalog:free_suffix",
  },
  {
    provider: "openrouter",
    modelId: "anthropic/claude-sonnet-4",
    promptPrice: 0.000003,
    completionPrice: 0.000015,
    note: "catalog:price_threshold",
  },
];

function record(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`, detail ?? "");
  if (!ok) process.exitCode = 1;
}

function formatResult(result: ResolveExecutionBandResult): string {
  const patternTiers = [...new Set(result.patternMatches.map((m) => m.tier))];
  return [
    `band=${result.band}`,
    `source=${result.source}`,
    `patternTiers=[${patternTiers.join(",") || "none"}]`,
    `discrepancy=${result.patternDiscrepancy}`,
    result.patternDiscrepancy ? `detail=${result.patternDiscrepancyDetail}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function explainRemainingDiscrepancy(
  key: string,
  band: CostTier,
  patternTiers: string,
  detail: string,
): string {
  if (detail.includes("ambiguous pattern tiers")) {
    return `${key}: intentional TIER_DEFAULT_PATTERNS overlap — band=${band} agrees with one tier in [${patternTiers}] but patterns span multiple tiers`;
  }
  if (detail.includes("no TIER_DEFAULT_PATTERNS match")) {
    return `${key}: no pattern match — band=${band} from explicit rule or fallback, outside TIER_DEFAULT_PATTERNS coverage`;
  }
  if (detail.startsWith("catalog=")) {
    return `${key}: band=${band} vs pattern tier=${patternTiers} — model outside explicit rule list; ${detail}`;
  }
  return `${key}: ${detail}`;
}

async function main() {
  console.log("=== HARD ASSERTIONS (T-1A.1) ===");
  for (const assertion of HARD_ASSERTIONS) {
    const result = resolveExecutionBand(assertion.provider, assertion.modelId, {
      promptPrice: assertion.promptPrice,
      completionPrice: assertion.completionPrice,
    });
    record(
      assertion.label,
      result.band === assertion.expected,
      { got: result.band, expected: assertion.expected, source: result.source },
    );
  }

  console.log("\n=== Key examples — new band after fix ===");
  const examples = [
    { provider: "openai", modelId: "gpt-4o" },
    { provider: "openai", modelId: "gpt-5-chat-latest" },
    { provider: "google", modelId: "gemini-2.5-pro" },
    { provider: "deepseek", modelId: "deepseek-chat" },
    {
      provider: "openrouter",
      modelId: "anthropic/claude-opus-4",
      promptPrice: 0,
      completionPrice: 0,
    },
  ];
  for (const ex of examples) {
    const result = resolveExecutionBand(ex.provider, ex.modelId, {
      promptPrice: ex.promptPrice,
      completionPrice: ex.completionPrice,
    });
    console.log(
      `${ex.provider}/${ex.modelId} → band=${result.band} source=${result.source}`,
    );
  }

  console.log("\n=== Unit: classifyCatalogBandWithSource matches inferCatalogCostTier ===");
  for (const fixture of FIXTURES) {
    const gateway =
      fixture.provider === "openrouter"
        ? "openrouter"
        : fixture.provider === "groq"
          ? "groq"
          : fixture.provider === "anthropic"
            ? "anthropic"
            : fixture.provider === "openai"
              ? "openai"
              : fixture.provider === "google"
                ? "google"
                : fixture.provider === "deepseek"
                  ? "deepseek"
                  : null;
    if (!gateway) continue;

    const tierInput = {
      modelId: fixture.modelId,
      gateway,
      promptPrice: fixture.promptPrice,
      completionPrice: fixture.completionPrice,
    };
    const inferred = inferCatalogCostTier(tierInput);
    const classified = classifyCatalogBandWithSource(tierInput);
    record(
      `${fixture.provider}/${fixture.modelId}`,
      inferred === classified.band,
      { inferred, classified: classified.band, source: classified.source },
    );
  }

  console.log("\n=== Fixtures: resolveExecutionBand + pattern discrepancy report ===");
  const discrepancies: Array<{ fixture: Fixture; result: ResolveExecutionBandResult }> = [];

  for (const fixture of FIXTURES) {
    const result = resolveExecutionBand(fixture.provider, fixture.modelId, {
      promptPrice: fixture.promptPrice,
      completionPrice: fixture.completionPrice,
      patternHaystackExtra: fixture.patternHaystackExtra,
    });
    console.log(`${fixture.provider}/${fixture.modelId}`);
    console.log(`  note: ${fixture.note ?? "—"}`);
    console.log(`  ${formatResult(result)}`);
    if (result.patternDiscrepancy) {
      discrepancies.push({ fixture, result });
    }
  }

  console.log("\n=== DISCREPANCIES among fixtures (catalog vs TIER_DEFAULT_PATTERNS) ===");
  if (discrepancies.length === 0) {
    console.log("(none among fixtures)");
  } else {
    for (const { fixture, result } of discrepancies) {
      const patternTiers = [...new Set(result.patternMatches.map((m) => m.tier))].join(",");
      console.log(
        explainRemainingDiscrepancy(
          `${fixture.provider}/${fixture.modelId}`,
          result.band,
          patternTiers,
          result.patternDiscrepancyDetail,
        ),
      );
    }
  }

  let catalogLoaded = false;
  let catalogDiscrepancyCount = 0;
  const catalogDiscrepancies: Array<{
    key: string;
    band: CostTier;
    patternTiers: string;
    detail: string;
  }> = [];

  try {
    if (fs.existsSync(".env.local")) {
      for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
        const i = line.indexOf("=");
        if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
    }
    const catalog = await getModelCatalog();
    catalogLoaded = catalog.length > 0;
    const chatModels = catalog.filter((m) =>
      ["text", "general", "code", "analysis"].includes(m.primarySpecialization),
    );

    console.log(`\n=== Catalog scan (${chatModels.length} chat models) ===`);

    for (const model of chatModels) {
      const result = resolveExecutionBand(model.gateway, model.modelId, {
        patternHaystackExtra: `${model.displayName} ${model.originProviderSlug}`,
      });
      if (result.patternDiscrepancy) {
        catalogDiscrepancies.push({
          key: model.key,
          band: result.band,
          patternTiers: [...new Set(result.patternMatches.map((m) => m.tier))].join(",") || "none",
          detail: result.patternDiscrepancyDetail,
        });
      }
    }

    catalogDiscrepancyCount = catalogDiscrepancies.length;
    const resolved = BASELINE_CATALOG_DISCREPANCY_COUNT - catalogDiscrepancyCount;

    console.log(`Baseline catalog discrepancies (T-1A): ${BASELINE_CATALOG_DISCREPANCY_COUNT}`);
    console.log(`Current catalog discrepancies: ${catalogDiscrepancyCount}`);
    console.log(`Resolved by T-1A.1: ${resolved}`);
    console.log(`Remaining: ${catalogDiscrepancyCount}`);

    console.log("\n=== Remaining catalog discrepancies (each explained) ===");
    if (catalogDiscrepancies.length === 0) {
      console.log("(none)");
    } else {
      for (const row of catalogDiscrepancies) {
        console.log(
          explainRemainingDiscrepancy(row.key, row.band, row.patternTiers, row.detail),
        );
      }
    }
  } catch (err) {
    console.warn("\nCatalog scan skipped:", err instanceof Error ? err.message : err);
  }

  record("fixtures processed", FIXTURES.length > 0);
  record("catalog loaded for scan", catalogLoaded || process.env.SKIP_CATALOG_SCAN === "1", {
    catalogLoaded,
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
