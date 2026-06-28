"use client";

import type { ArchiveGroup, ArchiveRow } from "@/lib/workspace/load-inspector-data";

const RAW_VISIBLE_LIMIT = 10;

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function pickLatestSummary(rows: ArchiveRow[]): ArchiveRow | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i]?.type === "summary") return rows[i];
  }
  return null;
}

function pickRecentRaw(rows: ArchiveRow[]): ArchiveRow[] {
  return rows
    .filter((row) => row.type === "raw")
    .slice(-RAW_VISIBLE_LIMIT)
    .reverse();
}

function ArchiveGroupCard({ group }: { group: ArchiveGroup }) {
  const summary = pickLatestSummary(group.rows);
  const rawRows = pickRecentRaw(group.rows);

  return (
    <section className="rounded-lg border border-stone-800 bg-stone-950/40 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-sm font-semibold text-stone-100">{group.name}</h4>
        <div className="text-[11px] text-stone-500">
          {group.rows.length} записей · {rawRows.length} raw
        </div>
      </div>

      {summary ? (
        <div className="mt-3 rounded border border-emerald-900/50 bg-emerald-950/25 p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-emerald-200/80">
            <span>Последняя summary</span>
            <span>{formatDate(summary.created_at)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-emerald-50">
            {summary.content}
          </p>
          <div className="mt-2 grid gap-1 text-[10px] text-emerald-100/70 sm:grid-cols-2">
            <div>
              <span className="text-emerald-200/60">period_start:</span>{" "}
              {formatDate(summary.period_start)}
            </div>
            <div>
              <span className="text-emerald-200/60">period_end:</span>{" "}
              {formatDate(summary.period_end)}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-stone-500">Summary пока нет.</p>
      )}

      <div className="mt-3">
        <div className="mb-1.5 text-[11px] uppercase tracking-wide text-stone-500">
          Последние raw
        </div>
        {rawRows.length === 0 ? (
          <p className="text-xs text-stone-500">Raw-записей пока нет.</p>
        ) : (
          <ul className="space-y-2">
            {rawRows.map((row) => (
              <li key={row.id} className="rounded border border-stone-800 bg-black/20 p-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-stone-500">
                  <span>{formatDate(row.created_at)}</span>
                  <span className="flex flex-wrap gap-1">
                    <span className="rounded bg-stone-900 px-1.5 py-0.5 uppercase text-stone-300">
                      raw
                    </span>
                    {row.archived_into && (
                      <span className="rounded bg-amber-950/60 px-1.5 py-0.5 text-amber-200">
                        archived_into
                      </span>
                    )}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-stone-300">
                  {row.content}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function ArchivePanel({ groups }: { groups: ArchiveGroup[] }) {
  if (groups.length === 0) {
    return (
      <div className="rounded-lg border border-stone-800 bg-stone-950/40 px-3 py-2">
        <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Архив</div>
        <p className="mt-1 text-xs text-stone-500">Архивных записей для этого объекта пока нет.</p>
      </div>
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-stone-800 bg-stone-950/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-stone-500">Архив</div>
          <p className="mt-0.5 text-[11px] text-stone-500">
            Последняя summary и последние raw-записи без пагинации.
          </p>
        </div>
        <div className="text-[11px] text-stone-500">{groups.length} отдел(ов)</div>
      </div>

      <div className="space-y-3">
        {groups.map((group) => (
          <ArchiveGroupCard key={group.registryId} group={group} />
        ))}
      </div>
    </section>
  );
}
