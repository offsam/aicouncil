"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { KnowledgeRow, OfficeRow } from "@/lib/office-types";
import { CITY } from "@/lib/city-labels";

type Tab = "rules" | "knowledge";

interface OfficePanelProps {
  officeId: string;
  office: OfficeRow | null;
  open: boolean;
  initialTab?: Tab;
  onClose: () => void;
  onOfficeUpdated: (office: OfficeRow) => void;
}

export function OfficePanel({
  officeId,
  office,
  open,
  initialTab = "rules",
  onClose,
  onOfficeUpdated,
}: OfficePanelProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [entries, setEntries] = useState<KnowledgeRow[]>([]);
  const [rules, setRules] = useState(office?.rules ?? "");
  const [loading, setLoading] = useState(false);
  const [savingRules, setSavingRules] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadTabData = useCallback(async () => {
    if (!open || tab !== "knowledge") return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/offices/${officeId}/knowledge`);
      const data = (await res.json()) as { entries?: KnowledgeRow[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить базу знаний");
      setEntries(data.entries ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [officeId, open, tab]);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    setRules(office?.rules ?? "");
  }, [office]);

  useEffect(() => {
    void loadTabData();
  }, [loadTabData]);

  async function saveRules() {
    setSavingRules(true);
    setError(null);
    try {
      const res = await fetch(`/api/offices/${officeId}/rules`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rules }),
      });
      const data = (await res.json()) as { office?: OfficeRow; error?: string };
      if (!res.ok || !data.office) throw new Error(data.error ?? "Не удалось сохранить");
      onOfficeUpdated(data.office);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setSavingRules(false);
    }
  }

  async function addEntry() {
    if (!newTitle.trim()) return;
    setError(null);
    try {
      const res = await fetch(`/api/offices/${officeId}/knowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), content: newContent }),
      });
      const data = (await res.json()) as { entry?: KnowledgeRow; error?: string };
      if (!res.ok || !data.entry) throw new Error(data.error ?? "Не удалось добавить");
      setEntries((prev) => [data.entry!, ...prev]);
      setNewTitle("");
      setNewContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка добавления");
    }
  }

  async function deleteEntry(entryId: string) {
    setError(null);
    try {
      const res = await fetch(`/api/offices/${officeId}/knowledge/${entryId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось удалить");
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления");
    }
  }

  const tabs = useMemo(
    (): { id: Tab; label: string }[] => [
      { id: "rules", label: "Правила" },
      { id: "knowledge", label: "База знаний" },
    ],
    [],
  );

  if (!open) return null;

  return (
    <div className="theme-panel-solid absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l shadow-2xl">
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent-label-muted">{CITY.panelLabel}</p>
          <h2 className="text-lg font-semibold text-theme-primary">
            {office?.name ?? CITY.defaultName}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-theme-muted hover:text-theme-secondary dark:border-white/10"
        >
          Закрыть
        </button>
      </div>

      <div className="flex gap-1 border-b border-zinc-200 px-4 py-2 dark:border-white/10">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              tab === t.id
                ? "bg-stone-600/15 text-stone-700 dark:bg-stone-500/25 dark:text-stone-200"
                : "text-theme-muted hover:text-theme-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {loading && tab === "knowledge" && (
          <p className="text-sm text-theme-muted">Загрузка…</p>
        )}

        {tab === "rules" && (
          <div className="space-y-3">
            <textarea
              value={rules}
              onChange={(e) => setRules(e.target.value)}
              rows={14}
              className="w-full resize-y rounded-xl border border-zinc-200 bg-white/80 p-3 text-sm text-theme-secondary outline-none focus:border-stone-400/50 dark:border-white/10 dark:bg-black/40 dark:text-zinc-200"
              placeholder={CITY.rulesPlaceholder}
            />
            <button
              type="button"
              disabled={savingRules}
              onClick={() => void saveRules()}
              className="w-full rounded-xl bg-stone-700 py-2.5 text-sm font-medium text-white transition hover:bg-stone-600 disabled:opacity-50 dark:bg-stone-600 dark:hover:bg-stone-500"
            >
              {savingRules ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        )}

        {tab === "knowledge" && !loading && (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Заголовок"
                className="mb-2 w-full rounded-lg border border-zinc-200 bg-white/90 px-3 py-2 text-sm text-theme-secondary outline-none dark:border-white/10 dark:bg-black/40 dark:text-zinc-200"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="Содержание"
                rows={4}
                className="mb-2 w-full resize-y rounded-lg border border-zinc-200 bg-white/90 px-3 py-2 text-sm text-theme-secondary outline-none dark:border-white/10 dark:bg-black/40 dark:text-zinc-200"
              />
              <button
                type="button"
                onClick={() => void addEntry()}
                className="rounded-lg bg-stone-700 px-4 py-2 text-sm text-white hover:bg-stone-600 dark:bg-stone-600 dark:hover:bg-stone-500"
              >
                Добавить запись
              </button>
            </div>

            <ul className="space-y-3">
              {entries.length === 0 && (
                <li className="text-sm text-theme-muted">База знаний пуста</li>
              )}
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-zinc-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium text-theme-secondary">{entry.title}</h3>
                    <button
                      type="button"
                      onClick={() => void deleteEntry(entry.id)}
                      className="shrink-0 text-xs text-red-400 hover:text-red-300"
                    >
                      Удалить
                    </button>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-theme-muted">
                    {entry.content}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
