/**
 * Compares old (5 raw + 3000 foldable chars) vs new (35000 fresh char budget)
 * compression split on real chamber_archive rows.
 *
 * Usage: npx tsx scripts/verify_chamber_archive_fresh_threshold.ts [entity_registry_id]
 */
import * as fs from "fs";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

import {
  ARCHIVE_SUMMARIZE_FRESH_RAW_CHARS,
  splitFreshAndFoldableRawRows,
} from "../lib/chamber-archive";
import { getSupabaseAdmin, isSupabaseConfigured } from "../lib/supabase/admin";

const OLD_KEEP_RECENT = 5;
const OLD_FOLDABLE_THRESHOLD = 3000;

type Row = {
  id: string;
  entity_registry_id: string;
  type: "raw" | "summary";
  content: string;
  created_at: string;
  archived_into: string | null;
};

function preview(text: string, max = 72): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 1)}…`;
}

function splitOld(rawRows: Row[]) {
  if (rawRows.length <= OLD_KEEP_RECENT) {
    return {
      freshRows: rawRows,
      foldableRows: [] as Row[],
      foldableChars: 0,
      wouldCompress: false,
    };
  }
  const foldableRows = rawRows.slice(0, rawRows.length - OLD_KEEP_RECENT);
  const foldableChars = foldableRows.reduce((sum, row) => sum + row.content.length, 0);
  return {
    freshRows: rawRows.slice(rawRows.length - OLD_KEEP_RECENT),
    foldableRows,
    foldableChars,
    wouldCompress: foldableChars >= OLD_FOLDABLE_THRESHOLD,
  };
}

function splitNew(rawRows: Row[]) {
  const { freshRows, foldableRows } = splitFreshAndFoldableRawRows(rawRows);
  const freshChars = freshRows.reduce((sum, row) => sum + row.content.length, 0);
  const foldableChars = foldableRows.reduce((sum, row) => sum + row.content.length, 0);
  return {
    freshRows,
    foldableRows,
    freshChars,
    foldableChars,
    wouldCompress: foldableRows.length > 0,
  };
}

function printRowList(label: string, rows: Row[]) {
  console.log(`  ${label} (${rows.length} rows, ${rows.reduce((s, r) => s + r.content.length, 0)} chars):`);
  for (const row of rows) {
    console.log(
      `    - ${row.id.slice(0, 8)}… ${row.content.length} chars · ${row.created_at} · ${preview(row.content)}`,
    );
  }
}

async function analyzeEntity(entityRegistryId: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("chamber_archive")
    .select("id, entity_registry_id, type, content, created_at, archived_into")
    .eq("entity_registry_id", entityRegistryId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  const rawRows = rows.filter((row) => row.type === "raw" && !row.archived_into);
  if (rawRows.length === 0) {
    console.log(`Entity ${entityRegistryId}: no active raw rows`);
    return null;
  }

  const oldSplit = splitOld(rawRows);
  const newSplit = splitNew(rawRows);

  console.log(`\n=== Entity ${entityRegistryId} ===`);
  console.log(`Active raw rows: ${rawRows.length}`);
  console.log(`Total active raw chars: ${rawRows.reduce((s, r) => s + r.content.length, 0)}`);
  console.log(`Fresh budget (new): ${ARCHIVE_SUMMARIZE_FRESH_RAW_CHARS} chars from newest`);

  console.log("\n--- OLD policy (keep last 5 raw, compress when foldable >= 3000 chars) ---");
  printRowList("Would stay raw", oldSplit.freshRows);
  printRowList("Would compress", oldSplit.foldableRows);
  console.log(`  Trigger: foldable ${oldSplit.foldableChars} chars → compress=${oldSplit.wouldCompress}`);

  console.log("\n--- NEW policy (35000-char fresh window from newest) ---");
  printRowList("Stays raw", newSplit.freshRows);
  printRowList("Compress candidates", newSplit.foldableRows);
  console.log(
    `  Fresh window: ${newSplit.freshChars} chars · foldable ${newSplit.foldableChars} chars → compress=${newSplit.wouldCompress}`,
  );

  const keptMore =
    newSplit.freshRows.length > oldSplit.freshRows.length ||
    (oldSplit.wouldCompress && !newSplit.wouldCompress);

  if (keptMore) {
    console.log(
      `\n✓ New policy keeps ${newSplit.freshRows.length - oldSplit.freshRows.length} more raw row(s) than old (${oldSplit.wouldCompress ? "old would compress now" : "old would not compress"})`,
    );
  }

  return { entityRegistryId, rawRows, oldSplit, newSplit, keptMore };
}

async function main() {
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured (.env.local)");
  }

  const targetId = process.argv[2]?.trim();
  const supabase = getSupabaseAdmin();

  if (targetId) {
    await analyzeEntity(targetId);
    return;
  }

  const { data, error } = await supabase
    .from("chamber_archive")
    .select("id, entity_registry_id, type, content, created_at, archived_into")
    .eq("type", "raw")
    .is("archived_into", null)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);

  const byEntity = new Map<string, Row[]>();
  for (const row of (data ?? []) as Row[]) {
    const list = byEntity.get(row.entity_registry_id) ?? [];
    list.push(row);
    byEntity.set(row.entity_registry_id, list);
  }

  console.log(`Scanned ${byEntity.size} entities with active raw archive rows.`);

  const candidates = [...byEntity.entries()]
    .map(([entityRegistryId, rawRows]) => {
      const oldSplit = splitOld(rawRows);
      const newSplit = splitNew(rawRows);
      return { entityRegistryId, rawRows, oldSplit, newSplit };
    })
    .filter(({ oldSplit, newSplit }) => oldSplit.wouldCompress && newSplit.freshRows.length > oldSplit.freshRows.length)
    .sort(
      (a, b) =>
        b.newSplit.freshRows.length -
        b.oldSplit.freshRows.length -
        (a.newSplit.freshRows.length - a.oldSplit.freshRows.length),
    );

  if (candidates.length === 0) {
    console.log("No entity where old policy compresses but new keeps more rows. Showing top entities by raw count:\n");
    const top = [...byEntity.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 3);
    for (const [entityId] of top) {
      await analyzeEntity(entityId);
    }
    return;
  }

  console.log(`Found ${candidates.length} entity(ies) where old compresses but new keeps more fresh rows.\n`);
  for (const { entityRegistryId } of candidates.slice(0, 3)) {
    await analyzeEntity(entityRegistryId);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
