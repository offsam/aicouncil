"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChamberRow, UniversalKnowledgeRow, RuleRow, AgentAssignmentRow, AgentRow } from "@/lib/office-types";
import {
  loadLocalKnowledge,
  saveLocalKnowledge,
  loadLocalRules,
  saveLocalRules,
} from "@/lib/entity-registry";

type Tab = "rules" | "knowledge" | "agents";

interface ChamberPanelProps {
  officeId: string;
  chamber: ChamberRow | null;
  supabaseConfigured: boolean;
  open: boolean;
  onClose: () => void;
  onBackToBuilding: () => void;
  onStartCabling?: () => void;
}

export function ChamberPanel({
  officeId,
  chamber,
  supabaseConfigured,
  open,
  onClose,
  onBackToBuilding,
  onStartCabling,
}: ChamberPanelProps) {
  const [tab, setTab] = useState<Tab>("rules");
  const [knowledge, setKnowledge] = useState<UniversalKnowledgeRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New rule/knowledge form state
  const [newRuleText, setNewRuleText] = useState("");
  const [newKnowledgeTitle, setNewKnowledgeTitle] = useState("");
  const [newKnowledgeContent, setNewKnowledgeContent] = useState("");
  const [assignments, setAssignments] = useState<AgentAssignmentRow[]>([]);
  const [officeAgents, setOfficeAgents] = useState<AgentRow[]>([]);
  const [selectedAgentToAssign, setSelectedAgentToAssign] = useState("");

  const loadData = useCallback(async () => {
    if (!open || !chamber) return;
    setLoading(true);
    setError(null);

    // chamber's entity registry id is its entity_id for knowledge/rules
    const entityId = chamber.entity_registry_id;

    try {
      if (supabaseConfigured) {
        // Fetch rules
        const resRules = await fetch(`/api/rules?entity_type=chamber&entity_id=${entityId}`);
        const dataRules = (await resRules.json()) as { rules?: RuleRow[]; error?: string };
        if (!resRules.ok) throw new Error(dataRules.error ?? "Не удалось загрузить правила");
        setRules(dataRules.rules ?? []);

        // Fetch knowledge
        const resKnow = await fetch(`/api/knowledge?entity_type=chamber&entity_id=${entityId}`);
        const dataKnow = (await resKnow.json()) as { entries?: UniversalKnowledgeRow[]; error?: string };
        if (!resKnow.ok) throw new Error(dataKnow.error ?? "Не удалось загрузить знания");
        setKnowledge(dataKnow.entries ?? []);

        const resAssign = await fetch(`/api/chambers/${chamber.id}/assignments`);
        const dataAssign = (await resAssign.json()) as { assignments?: AgentAssignmentRow[]; error?: string };
        if (!resAssign.ok) throw new Error(dataAssign.error ?? "Не удалось загрузить назначения");
        setAssignments(dataAssign.assignments ?? []);

        const resOffice = await fetch(`/api/offices/${officeId}`);
        const dataOffice = (await resOffice.json()) as { agents?: AgentRow[]; error?: string };
        if (!resOffice.ok) throw new Error(dataOffice.error ?? "Не удалось загрузить агентов");
        setOfficeAgents(dataOffice.agents ?? []);
      } else {
        // Local Storage fallback
        const localRules = loadLocalRules().filter((r) => r.entity_type === "chamber" && r.entity_id === entityId);
        setRules(localRules);

        const localKnow = loadLocalKnowledge().filter((k) => k.entity_type === "chamber" && k.entity_id === entityId);
        setKnowledge(localKnow);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  }, [chamber, open, supabaseConfigured, officeId]);

  useEffect(() => {
    if (open) {
      void loadData();
    }
  }, [open, loadData]);

  // Handle Rules CRUD
  async function handleAddRule() {
    if (!chamber || !newRuleText.trim()) return;
    setError(null);
    const entityId = chamber.entity_registry_id;

    try {
      if (supabaseConfigured) {
        const res = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: "chamber",
            entity_id: entityId,
            rule_text: newRuleText.trim(),
          }),
        });
        const data = (await res.json()) as { rule?: RuleRow; error?: string };
        if (!res.ok || !data.rule) throw new Error(data.error ?? "Не удалось добавить правило");
        setRules((prev) => [...prev, data.rule!]);
      } else {
        const rulesList = loadLocalRules();
        const newRule: RuleRow = {
          id: `local-rule-${Date.now()}`,
          entity_type: "chamber",
          entity_id: entityId,
          object_id: null,
          rule_text: newRuleText.trim(),
          created_at: new Date().toISOString(),
        };
        rulesList.push(newRule);
        saveLocalRules(rulesList);
        setRules((prev) => [...prev, newRule]);
      }
      setNewRuleText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка добавления правила");
    }
  }

  async function handleDeleteRule(ruleId: string) {
    setError(null);
    try {
      if (supabaseConfigured) {
        const res = await fetch(`/api/rules/${ruleId}`, { method: "DELETE" });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Не удалось удалить");
      } else {
        const rulesList = loadLocalRules();
        saveLocalRules(rulesList.filter((r) => r.id !== ruleId));
      }
      setRules((prev) => prev.filter((r) => r.id !== ruleId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления");
    }
  }

  // Handle Knowledge CRUD
  async function handleAddKnowledge() {
    if (!chamber || !newKnowledgeTitle.trim()) return;
    setError(null);
    const entityId = chamber.entity_registry_id;

    try {
      if (supabaseConfigured) {
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: "chamber",
            entity_id: entityId,
            title: newKnowledgeTitle.trim(),
            content: newKnowledgeContent.trim(),
          }),
        });
        const data = (await res.json()) as { entry?: UniversalKnowledgeRow; error?: string };
        if (!res.ok || !data.entry) throw new Error(data.error ?? "Не удалось добавить запись");
        setKnowledge((prev) => [data.entry!, ...prev]);
      } else {
        const knowList = loadLocalKnowledge();
        const newKnow: UniversalKnowledgeRow = {
          id: `local-know-${Date.now()}`,
          entity_type: "chamber",
          entity_id: entityId,
          object_id: null,
          title: newKnowledgeTitle.trim(),
          content: newKnowledgeContent.trim() || null,
          file_url: null,
          created_at: new Date().toISOString(),
        };
        knowList.unshift(newKnow);
        saveLocalKnowledge(knowList);
        setKnowledge((prev) => [newKnow, ...prev]);
      }
      setNewKnowledgeTitle("");
      setNewKnowledgeContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка добавления записи");
    }
  }

  async function handleDeleteKnowledge(entryId: string) {
    setError(null);
    try {
      if (supabaseConfigured) {
        const res = await fetch(`/api/knowledge/${entryId}`, { method: "DELETE" });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Не удалось удалить");
      } else {
        const knowList = loadLocalKnowledge();
        saveLocalKnowledge(knowList.filter((k) => k.id !== entryId));
      }
      setKnowledge((prev) => prev.filter((k) => k.id !== entryId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления");
    }
  }

  async function handleAssignAgent() {
    if (!chamber || !selectedAgentToAssign) return;
    setError(null);
    try {
      const res = await fetch(`/api/chambers/${chamber.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: selectedAgentToAssign }),
      });
      const data = (await res.json()) as { assignment?: AgentAssignmentRow; error?: string };
      if (!res.ok || !data.assignment) throw new Error(data.error ?? "Не удалось назначить агента");
      setAssignments((prev) => [...prev, data.assignment!]);
      setSelectedAgentToAssign("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка назначения агента");
    }
  }

  async function handleRemoveAssignment(assignmentId: string) {
    if (!chamber) return;
    setError(null);
    try {
      const res = await fetch(`/api/chambers/${chamber.id}/assignments/${assignmentId}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Не удалось снять назначение");
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка снятия назначения");
    }
  }

  const assignedAgentIds = new Set(assignments.map((a) => a.agent_id));
  const availableAgents = officeAgents.filter((a) => !assignedAgentIds.has(a.id));

  if (!open || !chamber) return null;

  return (
    <div className="theme-panel-solid absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
        <div>
          <button
            type="button"
            onClick={onBackToBuilding}
            className="mb-1 text-xs text-teal-600 hover:underline dark:text-teal-400"
          >
            ← К зданию
          </button>
          <h2 className="text-lg font-semibold text-theme-primary">
            {chamber.name}
          </h2>
          {supabaseConfigured && onStartCabling && (
            <button
              type="button"
              onClick={onStartCabling}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 transition shadow-sm"
            >
              🔗 Соединить кабелем
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm text-theme-muted hover:text-theme-secondary dark:border-white/10"
        >
          Закрыть
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-200 px-4 py-2 dark:border-white/10">
        <button
          type="button"
          onClick={() => setTab("rules")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            tab === "rules"
              ? "bg-stone-600/15 text-stone-700 dark:bg-stone-500/25 dark:text-stone-200"
              : "text-theme-muted hover:text-theme-secondary"
          }`}
        >
          Правила отдела
        </button>
        <button
          type="button"
          onClick={() => setTab("knowledge")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            tab === "knowledge"
              ? "bg-stone-600/15 text-stone-700 dark:bg-stone-500/25 dark:text-stone-200"
              : "text-theme-muted hover:text-theme-secondary"
          }`}
        >
          База знаний отдела
        </button>
        <button
          type="button"
          onClick={() => setTab("agents")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            tab === "agents"
              ? "bg-stone-600/15 text-stone-700 dark:bg-stone-500/25 dark:text-stone-200"
              : "text-theme-muted hover:text-theme-secondary"
          }`}
        >
          Агенты
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <p className="mb-3 rounded-lg border border-red-500/30 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        {loading && <p className="text-sm text-theme-muted">Загрузка...</p>}

        {!loading && tab === "rules" && (
          <div className="space-y-4">
            {/* Add Rule Form */}
            <div className="rounded-xl border border-zinc-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <textarea
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                placeholder="Введите текст нового правила для отдела"
                rows={3}
                className="mb-2 w-full resize-y rounded-lg border border-zinc-200 bg-white/90 px-3 py-2 text-sm text-theme-secondary outline-none dark:border-white/10 dark:bg-black/40 dark:text-zinc-200"
              />
              <button
                type="button"
                onClick={() => void handleAddRule()}
                className="rounded-lg bg-stone-700 px-4 py-2 text-sm text-white hover:bg-stone-600 dark:bg-stone-600 dark:hover:bg-stone-500"
              >
                Добавить правило
              </button>
            </div>

            {/* Rules List */}
            <ul className="space-y-2">
              {rules.length === 0 && (
                <li className="text-sm text-theme-muted">Правила не заданы</li>
              )}
              {rules.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-zinc-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-theme-secondary leading-relaxed">{r.rule_text}</p>
                    <button
                      type="button"
                      onClick={() => void handleDeleteRule(r.id)}
                      className="shrink-0 text-[10px] text-red-400 hover:text-red-300"
                    >
                      Удалить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && tab === "knowledge" && (
          <div className="space-y-4">
            {/* Add Knowledge Form */}
            <div className="rounded-xl border border-zinc-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <input
                value={newKnowledgeTitle}
                onChange={(e) => setNewKnowledgeTitle(e.target.value)}
                placeholder="Заголовок"
                className="mb-2 w-full rounded-lg border border-zinc-200 bg-white/90 px-3 py-2 text-sm text-theme-secondary outline-none dark:border-white/10 dark:bg-black/40 dark:text-zinc-200"
              />
              <textarea
                value={newKnowledgeContent}
                onChange={(e) => setNewKnowledgeContent(e.target.value)}
                placeholder="Содержание"
                rows={3}
                className="mb-2 w-full resize-y rounded-lg border border-zinc-200 bg-white/90 px-3 py-2 text-sm text-theme-secondary outline-none dark:border-white/10 dark:bg-black/40 dark:text-zinc-200"
              />
              <button
                type="button"
                onClick={() => void handleAddKnowledge()}
                className="rounded-lg bg-stone-700 px-4 py-2 text-sm text-white hover:bg-stone-600 dark:bg-stone-600 dark:hover:bg-stone-500"
              >
                Добавить запись
              </button>
            </div>

            {/* Knowledge List */}
            <ul className="space-y-3">
              {knowledge.length === 0 && (
                <li className="text-sm text-theme-muted">База знаний отдела пуста</li>
              )}
              {knowledge.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-xl border border-zinc-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-semibold text-theme-secondary">{entry.title}</h4>
                    <button
                      type="button"
                      onClick={() => void handleDeleteKnowledge(entry.id)}
                      className="shrink-0 text-[10px] text-red-400 hover:text-red-300"
                    >
                      Удалить
                    </button>
                  </div>
                  {entry.content && (
                    <p className="mt-1 whitespace-pre-wrap text-[11px] text-theme-muted">
                      {entry.content}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && tab === "agents" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="mb-2 text-xs text-theme-muted">
                Назначьте агента в этот отдел. Один агент может работать в нескольких отделах.
              </p>
              <div className="flex gap-2">
                <select
                  value={selectedAgentToAssign}
                  onChange={(e) => setSelectedAgentToAssign(e.target.value)}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white/90 px-3 py-2 text-sm text-theme-secondary outline-none dark:border-white/10 dark:bg-black/40 dark:text-zinc-200"
                >
                  <option value="">Выберите агента…</option>
                  {availableAgents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void handleAssignAgent()}
                  disabled={!selectedAgentToAssign}
                  className="shrink-0 rounded-lg bg-stone-700 px-4 py-2 text-sm text-white hover:bg-stone-600 disabled:opacity-40 dark:bg-stone-600 dark:hover:bg-stone-500"
                >
                  Добавить
                </button>
              </div>
            </div>

            <ul className="space-y-2">
              {assignments.length === 0 && (
                <li className="text-sm text-theme-muted">Агенты не назначены</li>
              )}
              {assignments.map((assignment) => {
                const agent = assignment.agents ?? officeAgents.find((a) => a.id === assignment.agent_id);
                return (
                  <li
                    key={assignment.id}
                    className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white/60 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]"
                  >
                    <span className="text-sm text-theme-secondary">{agent?.name ?? assignment.agent_id}</span>
                    <button
                      type="button"
                      onClick={() => void handleRemoveAssignment(assignment.id)}
                      className="text-[10px] text-red-400 hover:text-red-300"
                    >
                      Убрать
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
