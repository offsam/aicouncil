/**
 * Verify resolveExecutionBand — hard assertions + TIER_DEFAULT_PATTERNS discrepancy report.
 * Run: npx tsx scripts/verify_resolve_execution_band.ts
 */
import * as fs from "fs";
import type { CostTier } from "../lib/cost-tier";
import { getModelCatalog } from "../lib/model-catalog/build-catalog";
import { TIER_DEFAULT_PATTERNS } from "../lib/model-catalog/default-chamber-roster-picks";
import {
  assessPatternDiscrepancy,
  buildPatternHaystack,
  classifyCatalogBandWithSource,
  resolveExecutionBand,
  type ResolveExecutionBandResult,
} from "../lib/model-catalog/resolve-execution-band";
import { inferCatalogCostTier } from "../lib/model-catalog/infer-cost-tier";

const TIER_ORDER: CostTier[] = ["free", "cheap", "mid", "premium"];

function findCanonicalPatternMatches(haystack: string) {
  const matches: Array<{ tier: CostTier; patternIndex: number }> = [];
  for (const tier of TIER_ORDER) {
    const patterns = TIER_DEFAULT_PATTERNS[tier];
    for (let i = 0; i < patterns.length; i += 1) {
      if (patterns[i].test(haystack)) {
        matches.push({ tier, patternIndex: i });
        break;
      }
    }
  }
  return matches;
}

function canonicalPatternDiscrepancy(band: CostTier, haystack: string) {
  const patternMatches = findCanonicalPatternMatches(haystack);
  return {
    patternMatches,
    ...assessPatternDiscrepancy(band, patternMatches),
  };
}

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

/** T-1A.1 post-fix catalog discrepancy count. */
const POST_T1A1_CATALOG_DISCREPANCY_COUNT = 50;

/** Post T-1B.1A catalog discrepancy count (before T-1C pattern cleanup). */
const POST_T1B1A_CATALOG_DISCREPANCY_COUNT = 49;
/** After T-1C canonical TIER_DEFAULT_PATTERNS cleanup (unchanged by T-1C.1 wiring). */
const POST_T1C_CATALOG_DISCREPANCY_COUNT = 18;

/** T-1C: each group must match exactly one tier in canonical TIER_DEFAULT_PATTERNS. */
const T1C_SINGLE_TIER_FIXTURES: Array<{
  label: string;
  provider: string;
  modelId: string;
  expectedTier: CostTier;
}> = [
  {
    label: "deepseek-chat → mid only",
    provider: "deepseek",
    modelId: "deepseek-chat",
    expectedTier: "mid",
  },
  {
    label: "gemini-2.5-flash → cheap only",
    provider: "google",
    modelId: "gemini-2.5-flash",
    expectedTier: "cheap",
  },
  {
    label: "llama-3.3-70b-versatile → free only",
    provider: "groq",
    modelId: "llama-3.3-70b-versatile",
    expectedTier: "free",
  },
  {
    label: "qwen3-coder:free → free only",
    provider: "openrouter",
    modelId: "qwen/qwen3-coder:free",
    expectedTier: "free",
  },
  {
    label: "qwen3-coder-30b → cheap only",
    provider: "openrouter",
    modelId: "qwen/qwen3-coder-30b-a3b-instruct",
    expectedTier: "cheap",
  },
  {
    label: "qwen3-coder-flash → cheap only",
    provider: "openrouter",
    modelId: "qwen/qwen3-coder-flash",
    expectedTier: "cheap",
  },
  {
    label: "grok-4.20 → premium only",
    provider: "openrouter",
    modelId: "x-ai/grok-4.20",
    expectedTier: "premium",
  },
];

const T1C_REGRESSION_UNCHANGED: Array<{
  label: string;
  provider: string;
  modelId: string;
  expectedTier: CostTier;
}> = [
  {
    label: "claude-haiku unchanged",
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    expectedTier: "cheap",
  },
  {
    label: "claude-opus unchanged",
    provider: "anthropic",
    modelId: "claude-opus-4-6",
    expectedTier: "premium",
  },
  {
    label: "gpt-5 unchanged",
    provider: "openai",
    modelId: "gpt-5-chat-latest",
    expectedTier: "premium",
  },
  {
    label: "gemini-pro unchanged",
    provider: "google",
    modelId: "gemini-2.5-pro",
    expectedTier: "premium",
  },
];

const T1B1A_ASSERTIONS: Array<{
  label: string;
  provider: string;
  modelId: string;
  expected: CostTier;
  expectedSource: string;
}> = [
  {
    label: "x-ai/grok-4.20 → premium",
    provider: "openrouter",
    modelId: "x-ai/grok-4.20",
    expected: "premium",
    expectedSource: "explicit:grok-4",
  },
  {
    label: "x-ai/grok-4.3 → premium",
    provider: "openrouter",
    modelId: "x-ai/grok-4.3",
    expected: "premium",
    expectedSource: "explicit:grok-4",
  },
  {
    label: "mistralai/mistral-medium-3.1 → mid",
    provider: "openrouter",
    modelId: "mistralai/mistral-medium-3.1",
    expected: "mid",
    expectedSource: "explicit:mistral-medium-3.1",
  },
  {
    label: "mistralai/mistral-small-3.1-24b-instruct → cheap",
    provider: "openrouter",
    modelId: "mistralai/mistral-small-3.1-24b-instruct",
    expected: "cheap",
    expectedSource: "explicit:mistral-small-3.1",
  },
  {
    label: "qwen/qwen3-coder-flash → cheap",
    provider: "openrouter",
    modelId: "qwen/qwen3-coder-flash",
    expected: "cheap",
    expectedSource: "explicit:qwen3-coder-flash",
  },
  {
    label: "openai/gpt-oss-120b → mid",
    provider: "openrouter",
    modelId: "openai/gpt-oss-120b",
    expected: "mid",
    expectedSource: "explicit:gpt-oss-120b",
  },
  {
    label: "~anthropic/claude-fable-latest → premium",
    provider: "openrouter",
    modelId: "~anthropic/claude-fable-latest",
    expected: "premium",
    expectedSource: "explicit:claude-fable-latest",
  },
  {
    label: "openrouter/free (exact modelId) → free",
    provider: "openrouter",
    modelId: "openrouter/free",
    expected: "free",
    expectedSource: "explicit:openrouter-free-router",
  },
];

/** Neighbors that must NOT pick up T-1B.1A rules. */
const T1B1A_NEIGHBOR_REGRESSION: Array<{
  label: string;
  provider: string;
  modelId: string;
  expected: CostTier;
  forbiddenSource?: string;
}> = [
  {
    label: "x-ai/grok-3 (not grok-4) stays default_fallback",
    provider: "openrouter",
    modelId: "x-ai/grok-3",
    expected: "cheap",
    forbiddenSource: "explicit:grok-4",
  },
  {
    label: "openai/gpt-oss-20b (not 120b) stays default_fallback",
    provider: "openrouter",
    modelId: "openai/gpt-oss-20b",
    expected: "cheap",
    forbiddenSource: "explicit:gpt-oss-120b",
  },
  {
    label: "qwen/qwen3-coder-30b-a3b-instruct not qwen3-coder-flash",
    provider: "openrouter",
    modelId: "qwen/qwen3-coder-30b-a3b-instruct",
    expected: "cheap",
    forbiddenSource: "explicit:qwen3-coder-flash",
  },
  {
    label: "qwen/qwen3-coder:free uses :free suffix not flash rule",
    provider: "openrouter",
    modelId: "qwen/qwen3-coder:free",
    expected: "free",
    forbiddenSource: "explicit:qwen3-coder-flash",
  },
  {
    label: "anthropic/claude-sonnet-4.6 unchanged (T-1A.1)",
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    expected: "mid",
    forbiddenSource: "explicit:claude-fable-latest",
  },
  {
    label: "openrouter/anthropic/claude-opus-4 not openrouter/free",
    provider: "openrouter",
    modelId: "anthropic/claude-opus-4",
    expected: "premium",
    forbiddenSource: "explicit:openrouter-free-router",
  },
];

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
  console.log("\n=== T-1C: single-tier pattern match (canonical TIER_DEFAULT_PATTERNS) ===");
  for (const fixture of T1C_SINGLE_TIER_FIXTURES) {
    const haystack = buildPatternHaystack(fixture.provider, fixture.modelId);
    const matches = findCanonicalPatternMatches(haystack);
    const tiers = [...new Set(matches.map((m) => m.tier))];
    record(
      `${fixture.label}`,
      tiers.length === 1 && tiers[0] === fixture.expectedTier,
      { matchedTiers: tiers, expected: fixture.expectedTier },
    );
  }

  console.log("\n=== T-1C: regression — untouched pattern groups ===");
  for (const fixture of T1C_REGRESSION_UNCHANGED) {
    const haystack = buildPatternHaystack(fixture.provider, fixture.modelId);
    const matches = findCanonicalPatternMatches(haystack);
    const tiers = [...new Set(matches.map((m) => m.tier))];
    record(
      fixture.label,
      tiers.length === 1 && tiers[0] === fixture.expectedTier,
      { matchedTiers: tiers, expected: fixture.expectedTier },
    );
  }

  console.log("\n=== HARD ASSERTIONS (T-1B.1A — 7 Class B models) ===");
  for (const assertion of T1B1A_ASSERTIONS) {
    const result = resolveExecutionBand(assertion.provider, assertion.modelId);
    const bandOk = result.band === assertion.expected;
    const sourceOk = result.source === assertion.expectedSource;
    record(
      assertion.label,
      bandOk && sourceOk,
      {
        got: result.band,
        expected: assertion.expected,
        source: result.source,
        expectedSource: assertion.expectedSource,
      },
    );
  }

  console.log("\n=== NEIGHBOR REGRESSION (T-1B.1A must not over-match) ===");
  for (const neighbor of T1B1A_NEIGHBOR_REGRESSION) {
    const result = resolveExecutionBand(neighbor.provider, neighbor.modelId);
    const bandOk = result.band === neighbor.expected;
    const sourceOk = !neighbor.forbiddenSource || result.source !== neighbor.forbiddenSource;
    record(
      neighbor.label,
      bandOk && sourceOk,
      { got: result.band, source: result.source, expected: neighbor.expected },
    );
  }

  console.log("\n=== HARD ASSERTIONS (T-1A.1 regression) ===");
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
  let resolvePatternDiscrepancyCount = 0;
  let canonicalPatternDiscrepancyCount = 0;
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
      const haystack = buildPatternHaystack(
        model.gateway,
        model.modelId,
        `${model.displayName} ${model.originProviderSlug}`,
      );
      const canonical = canonicalPatternDiscrepancy(result.band, haystack);
      if (result.patternDiscrepancy) {
        resolvePatternDiscrepancyCount += 1;
        catalogDiscrepancies.push({
          key: model.key,
          band: result.band,
          patternTiers:
            [...new Set(result.patternMatches.map((m) => m.tier))].join(",") || "none",
          detail: result.patternDiscrepancyDetail,
        });
      }
      if (canonical.patternDiscrepancy) {
        canonicalPatternDiscrepancyCount += 1;
      }
    }

    catalogDiscrepancyCount = resolvePatternDiscrepancyCount;
    record(
      "resolveExecutionBand.patternDiscrepancy vs canonical TIER_DEFAULT_PATTERNS parity",
      resolvePatternDiscrepancyCount === canonicalPatternDiscrepancyCount,
      {
        resolveExecutionBand: resolvePatternDiscrepancyCount,
        canonical: canonicalPatternDiscrepancyCount,
      },
    );
    record(
      "catalog discrepancy count unchanged from T-1C (18)",
      catalogDiscrepancyCount === POST_T1C_CATALOG_DISCREPANCY_COUNT,
      { got: catalogDiscrepancyCount, expected: POST_T1C_CATALOG_DISCREPANCY_COUNT },
    );
    const resolvedFromT1A = BASELINE_CATALOG_DISCREPANCY_COUNT - catalogDiscrepancyCount;
    const resolvedFromT1A1 = POST_T1A1_CATALOG_DISCREPANCY_COUNT - catalogDiscrepancyCount;
    const resolvedFromT1B1A = POST_T1B1A_CATALOG_DISCREPANCY_COUNT - catalogDiscrepancyCount;

    console.log(`Baseline catalog discrepancies (T-1A): ${BASELINE_CATALOG_DISCREPANCY_COUNT}`);
    console.log(`Post T-1A.1 catalog discrepancies: ${POST_T1A1_CATALOG_DISCREPANCY_COUNT}`);
    console.log(`Post T-1B.1A catalog discrepancies: ${POST_T1B1A_CATALOG_DISCREPANCY_COUNT}`);
    console.log(`Post T-1C catalog discrepancies (baseline for T-1C.1): ${POST_T1C_CATALOG_DISCREPANCY_COUNT}`);
    console.log(`Current catalog discrepancies (resolveExecutionBand): ${catalogDiscrepancyCount}`);
    console.log(
      `Pattern source parity: resolveExecutionBand=${resolvePatternDiscrepancyCount} canonical=${canonicalPatternDiscrepancyCount}`,
    );
    console.log(`Resolved since T-1A: ${resolvedFromT1A}`);
    console.log(`Resolved since T-1A.1: ${resolvedFromT1A1}`);
    console.log(`Resolved since T-1B.1A (T-1C): ${resolvedFromT1B1A}`);
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
