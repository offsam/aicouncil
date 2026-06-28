"use client";

import { useEffect, useRef, useState } from "react";
import type { RuleRow } from "@/lib/office-types";
import { KNOWLEDGE_FILE_ACCEPT } from "@/lib/knowledge/prepare-knowledge-file";
import {
  attachKnowledgeFile,
  uploadKnowledgeFile,
} from "@/lib/knowledge/upload-knowledge-file-client";
import type { ArchiveGroup, ArchiveRow, KnowledgeEntry } from "@/lib/workspace/load-inspector-data";
import { ChamberResourceCenterModal } from "./ChamberResourceCenterModal";
import { KnowledgeLibraryBrowse } from "./KnowledgeLibraryBrowse";

type ChamberResourceTab = "rules" | "archive" | "library";

function formatArchiveDate(value: string | null): string {
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
  return rows.filter((row) => row.type === "raw").slice(-10).reverse();
}

type ChamberInspectorResourceTabsProps = {
  buildingId: string;
  chamberId: string;
  registryId: string;
  rules: RuleRow[];
  archiveGroups: ArchiveGroup[];
  libraryEntries: KnowledgeEntry[];
  onReload: () => Promise<void>;
};

export function ChamberInspectorResourceTabs({
  buildingId,
  chamberId,
  registryId,
  rules,
  archiveGroups,
  libraryEntries,
  onReload,
}: ChamberInspectorResourceTabsProps) {
  const [openModal, setOpenModal] = useState<ChamberResourceTab | null>(null);

  const [rulesDraft, setRulesDraft] = useState<RuleRow[]>([]);
  const [newRuleText, setNewRuleText] = useState("");
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [deletedRuleIds, setDeletedRuleIds] = useState<string[]>([]);

  const [libraryComment, setLibraryComment] = useState("");
  const [libraryTitle, setLibraryTitle] = useState("");
  const [libraryFile, setLibraryFile] = useState<File | null>(null);
  const [librarySaving, setLibrarySaving] = useState(false);
  const [libraryAttaching, setLibraryAttaching] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const libraryFileRef = useRef<HTMLInputElement>(null);

  const [selectedArchiveId, setSelectedArchiveId] = useState<string | null>(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const archiveRows = archiveGroups[0]?.rows ?? [];

  const tabs: Array<{ id: ChamberResourceTab; label: string; count: number }> = [
    { id: "rules", label: "Правила", count: rules.length },
    { id: "archive", label: "Архив", count: archiveRows.length },
    { id: "library", label: "Библиотека", count: libraryEntries.length },
  ];

  useEffect(() => {
    if (openModal !== "rules") return;
    setRulesDraft(rules);
    setNewRuleText("");
    setDeletedRuleIds([]);
    setRulesError(null);
  }, [openModal, rules]);

  useEffect(() => {
    if (openModal !== "library") return;
    setLibraryComment("");
    setLibraryTitle("");
    setLibraryFile(null);
    setLibraryError(null);
    if (libraryFileRef.current) libraryFileRef.current.value = "";
  }, [openModal]);

  useEffect(() => {
    if (openModal !== "archive") return;
    setSelectedArchiveId(null);
    setArchiveError(null);
  }, [openModal]);

  useEffect(() => {
    if (!selectedArchiveId) return;
    if (!archiveRows.some((row) => row.id === selectedArchiveId)) {
      setSelectedArchiveId(null);
    }
  }, [archiveRows, selectedArchiveId]);

  async function saveRulesModal() {
    setRulesSaving(true);
    setRulesError(null);
    try {
      for (const ruleId of deletedRuleIds) {
        const res = await fetch(`/api/rules/${ruleId}`, { method: "DELETE" });
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? "Не удалось удалить правило");
        }
      }

      const trimmedNewRule = newRuleText.trim();
      if (trimmedNewRule) {
        const res = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: "chamber",
            entity_id: registryId,
            rule_text: trimmedNewRule,
          }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Не удалось добавить правило");
      }

      await onReload();
      setOpenModal(null);
    } catch (err) {
      setRulesError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setRulesSaving(false);
    }
  }

  async function saveLibraryModal() {
    if (!libraryFile) {
      if (!libraryComment.trim() && !libraryTitle.trim()) {
        setOpenModal(null);
      } else {
        setLibraryError("Выберите файл — без него загрузка не сохранится.");
      }
      return;
    }

    setLibrarySaving(true);
    setLibraryError(null);
    try {
      const title =
        libraryTitle.trim() ||
        libraryFile.name.replace(/\.[^.]+$/, "") ||
        libraryFile.name;

      await uploadKnowledgeFile({
        file: libraryFile,
        entityType: "chamber",
        entityId: registryId,
        title,
        description: libraryComment.trim() || undefined,
      });

      setLibraryTitle("");
      setLibraryComment("");
      setLibraryFile(null);
      if (libraryFileRef.current) libraryFileRef.current.value = "";
      await onReload();
      setOpenModal(null);
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setLibrarySaving(false);
    }
  }

  async function attachLibraryFile(entryId: string, file: File) {
    setLibraryAttaching(true);
    setLibraryError(null);
    try {
      await attachKnowledgeFile(entryId, file);
      await onReload();
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "Не удалось прикрепить файл");
    } finally {
      setLibraryAttaching(false);
    }
  }

  async function deleteLibraryEntry(entryId: string) {
    setLibrarySaving(true);
    setLibraryError(null);
    try {
      const res = await fetch(`/api/knowledge/${entryId}`, { method: "DELETE" });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Не удалось удалить файл");
      await onReload();
    } catch (err) {
      setLibraryError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setLibrarySaving(false);
    }
  }

  async function deleteSelectedArchiveEntry() {
    if (!selectedArchiveId) return;
    if (!window.confirm("Удалить выбранную запись из архива?")) return;

    setArchiveSaving(true);
    setArchiveError(null);
    try {
      const res = await fetch(`/api/chambers/${chamberId}/archive/${selectedArchiveId}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Не удалось удалить запись");
      setSelectedArchiveId(null);
      await onReload();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setArchiveSaving(false);
    }
  }

  function renderArchiveEntry(
    row: (typeof archiveRows)[number],
    chipLabel: string,
    testId: string,
  ) {
    const selected = selectedArchiveId === row.id;
    return (
      <li key={row.id} className="workspace-inspector-card text-xs">
        <button
          type="button"
          data-testid={testId}
          onClick={() => setSelectedArchiveId((current) => (current === row.id ? null : row.id))}
          className={`w-full rounded-md border px-2 py-2 text-left transition ${
            selected
              ? "border-[var(--ws-accent)] bg-[color-mix(in_srgb,var(--ws-accent)_10%,var(--ws-card-bg))]"
              : "border-transparent hover:border-[var(--ws-border)]"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--ws-text-faint)]">
            <span>{formatArchiveDate(row.created_at)}</span>
            <span className="workspace-bubble-chip">{chipLabel}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap leading-relaxed text-[var(--ws-text-secondary)]">
            {row.content}
          </p>
        </button>
      </li>
    );
  }

  const rulesFooter = (
    <div className="workspace-bubble-actions">
      <button
        type="button"
        disabled={rulesSaving}
        onClick={() => setOpenModal(null)}
        className="workspace-bubble-btn workspace-bubble-btn--ghost"
      >
        Отмена
      </button>
      <button
        type="button"
        disabled={rulesSaving}
        data-testid="workspace-chamber-rules-modal-save"
        onClick={() => void saveRulesModal()}
        className="workspace-bubble-btn workspace-bubble-btn--primary"
      >
        {rulesSaving ? "…" : "Сохранить"}
      </button>
    </div>
  );

  const libraryFooter = (
    <div className="workspace-bubble-actions">
      <button
        type="button"
        disabled={librarySaving}
        onClick={() => setOpenModal(null)}
        className="workspace-bubble-btn workspace-bubble-btn--ghost"
      >
        Отмена
      </button>
      <button
        type="button"
        disabled={librarySaving || !libraryFile}
        data-testid="workspace-chamber-library-modal-save"
        onClick={() => void saveLibraryModal()}
        className="workspace-bubble-btn workspace-bubble-btn--primary"
      >
        {librarySaving ? "…" : "Сохранить"}
      </button>
    </div>
  );

  const summary = pickLatestSummary(archiveRows);
  const rawRows = pickRecentRaw(archiveRows);

  const archiveFooter = (
    <div className="workspace-bubble-actions">
      <button
        type="button"
        disabled={archiveSaving}
        onClick={() => setOpenModal(null)}
        className="workspace-bubble-btn workspace-bubble-btn--ghost"
      >
        Закрыть
      </button>
      <button
        type="button"
        disabled={archiveSaving || !selectedArchiveId}
        data-testid="workspace-chamber-archive-delete-selected"
        onClick={() => void deleteSelectedArchiveEntry()}
        className="workspace-inspector-btn-danger"
      >
        {archiveSaving ? "…" : "Удалить выбранную"}
      </button>
    </div>
  );

  return (
    <>
      <div className="workspace-inspector-label mb-1.5 font-medium">Материалы отдела</div>
      <div data-testid="workspace-chamber-resource-tabs">
        <div
          className="workspace-inspector-resource-chips grid grid-cols-1 gap-2 sm:grid-cols-3"
          role="tablist"
          aria-label="Материалы отдела"
        >
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              data-testid={`workspace-chamber-tab-${item.id}`}
              onClick={() => setOpenModal(item.id)}
              className="workspace-inspector-resource-chip"
            >
              <span className="workspace-inspector-resource-chip__label">{item.label}</span>
              <span className="workspace-inspector-resource-chip__count">{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <ChamberResourceCenterModal
        open={openModal === "rules"}
        testId="workspace-chamber-rules-modal"
        title="Правила"
        subtitle="Отдельные правила для ответов агентов в этом отделе"
        onClose={() => setOpenModal(null)}
        footer={rulesFooter}
      >
        {rulesError && (
          <p className="workspace-bubble-sheet__error mb-2" role="alert">
            {rulesError}
          </p>
        )}

        <div>
          <div className="workspace-inspector-label mb-1.5">Правила</div>
          {rulesDraft.length === 0 ? (
            <p className="workspace-inspector-hint">Правил пока нет.</p>
          ) : (
            <ul className="space-y-1.5">
              {rulesDraft
                .filter((rule) => !deletedRuleIds.includes(rule.id))
                .map((rule, index) => (
                  <li
                    key={rule.id}
                    className="workspace-inspector-card flex items-start justify-between gap-2 text-xs leading-relaxed"
                  >
                    <span className="min-w-0 whitespace-pre-wrap text-[var(--ws-text-main)]">
                      <span className="mr-1.5 text-[var(--ws-text-faint)]">{index + 1}.</span>
                      {rule.rule_text}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeletedRuleIds((prev) => [...prev, rule.id])}
                      className="shrink-0 text-[10px] text-red-400 hover:text-red-300"
                    >
                      Удалить
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>

        <label className="workspace-inspector-label mt-3">
          Новое правило
          <textarea
            value={newRuleText}
            onChange={(e) => setNewRuleText(e.target.value)}
            rows={2}
            placeholder="Добавьте правило для этого отдела…"
            className="workspace-bubble-textarea mt-1"
          />
        </label>
      </ChamberResourceCenterModal>

      <ChamberResourceCenterModal
        open={openModal === "archive"}
        testId="workspace-chamber-archive-modal"
        title="Архив отдела"
        subtitle="Выберите запись и удалите при необходимости"
        wide
        onClose={() => setOpenModal(null)}
        footer={archiveFooter}
      >
        {archiveError && (
          <p className="workspace-bubble-sheet__error mb-2" role="alert">
            {archiveError}
          </p>
        )}

        {archiveRows.length === 0 ? (
          <p className="workspace-inspector-hint">
            Архивных записей для этого отдела пока нет. Записи появляются после ответов агентов в
            чате.
          </p>
        ) : (
          <div className="workspace-chamber-archive-modal">
            {summary ? (
              <section className="workspace-inspector-card workspace-chamber-archive-modal__summary">
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--ws-text-muted)]">
                  <span className="font-semibold uppercase tracking-wide">Последняя summary</span>
                  <span>{formatArchiveDate(summary.created_at)}</span>
                </div>
                <button
                  type="button"
                  data-testid={`workspace-chamber-archive-select-${summary.id}`}
                  onClick={() =>
                    setSelectedArchiveId((current) => (current === summary.id ? null : summary.id))
                  }
                  className={`mt-2 w-full rounded-md border px-2 py-2 text-left transition ${
                    selectedArchiveId === summary.id
                      ? "border-[var(--ws-accent)] bg-[color-mix(in_srgb,var(--ws-accent)_10%,var(--ws-card-bg))]"
                      : "border-transparent hover:border-[var(--ws-border)]"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--ws-text-main)]">
                    {summary.content}
                  </p>
                </button>
              </section>
            ) : (
              <p className="workspace-inspector-hint">Summary пока нет.</p>
            )}

            <div className="mt-3">
              <div className="workspace-inspector-label mb-1.5">Последние записи</div>
              {rawRows.length === 0 ? (
                <p className="workspace-inspector-hint">Raw-записей пока нет.</p>
              ) : (
                <ul className="space-y-2">
                  {rawRows.map((row) =>
                    renderArchiveEntry(row, "raw", `workspace-chamber-archive-select-${row.id}`),
                  )}
                </ul>
              )}
            </div>
          </div>
        )}
      </ChamberResourceCenterModal>

      <ChamberResourceCenterModal
        open={openModal === "library"}
        testId="workspace-chamber-library-modal"
        title="Библиотека отдела"
        subtitle="Просмотр, скачивание и загрузка материалов отдела"
        wide
        onClose={() => setOpenModal(null)}
        footer={libraryFooter}
      >
        {libraryError && (
          <p className="workspace-bubble-sheet__error mb-2" role="alert">
            {libraryError}
          </p>
        )}

        <div className="mt-3">
          <div className="workspace-inspector-label mb-1.5">
            Загружено ({libraryEntries.length})
          </div>
          <KnowledgeLibraryBrowse
            entries={libraryEntries}
            deleting={librarySaving}
            attaching={libraryAttaching}
            onAttachFile={(entryId, file) => attachLibraryFile(entryId, file)}
            onDelete={(entryId) => void deleteLibraryEntry(entryId)}
          />
        </div>

        <div className="workspace-inspector-divider mt-4" />

        <div className="workspace-inspector-card mt-3">
          <div className="workspace-inspector-label mb-1.5">Добавить файл</div>
          <input
            value={libraryTitle}
            onChange={(e) => setLibraryTitle(e.target.value)}
            placeholder="Название (необязательно)"
            className="workspace-bubble-input mb-2"
          />
          <textarea
            value={libraryComment}
            onChange={(e) => setLibraryComment(e.target.value)}
            rows={3}
            placeholder="Описание для поиска: когда агенту нужен этот файл…"
            className="workspace-bubble-textarea mb-2"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={librarySaving}
              onClick={() => libraryFileRef.current?.click()}
              className="workspace-bubble-btn workspace-bubble-btn--ghost"
            >
              {libraryFile ? libraryFile.name : "Выбрать файл"}
            </button>
            {libraryFile && (
              <button
                type="button"
                disabled={librarySaving}
                onClick={() => {
                  setLibraryFile(null);
                  if (libraryFileRef.current) libraryFileRef.current.value = "";
                }}
                className="workspace-bubble-btn workspace-bubble-btn--ghost"
              >
                Убрать
              </button>
            )}
          </div>
          <input
            ref={libraryFileRef}
            type="file"
            accept={KNOWLEDGE_FILE_ACCEPT}
            className="hidden"
            onChange={(e) => setLibraryFile(e.target.files?.[0] ?? null)}
          />
          <p className="workspace-inspector-hint mt-2">
            Описание помогает агенту найти файл в каталоге; полный текст хранится отдельно и
            подставляется только при совпадении с запросом. TXT/MD до 512 KB, PDF/DOC до 256 KB.
          </p>
        </div>
      </ChamberResourceCenterModal>
    </>
  );
}
