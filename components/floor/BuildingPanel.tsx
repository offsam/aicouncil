"use client";

import { useCallback, useEffect, useState } from "react";
import type { OfficeObjectRow, ChamberRow, UniversalKnowledgeRow, RuleRow } from "@/lib/office-types";
import {
  loadLocalChambers,
  saveLocalChambers,
  loadLocalRegistry,
  saveLocalRegistry,
  loadLocalKnowledge,
  saveLocalKnowledge,
  loadLocalRules,
  saveLocalRules,
} from "@/lib/entity-registry";

type Tab = "departments" | "rules" | "knowledge";

interface BuildingPanelProps {
  officeId: string;
  buildingId: string;
  building: OfficeObjectRow | null;
  supabaseConfigured: boolean;
  open: boolean;
  onClose: () => void;
  onOpenChamber: (chamber: ChamberRow) => void;
  cablingSourceChamber?: ChamberRow | null;
  onSelectTargetChamber?: (target: ChamberRow) => void;
  onEnterBuilding?: () => void;
}

export function BuildingPanel({
  officeId,
  buildingId,
  building,
  supabaseConfigured,
  open,
  onClose,
  onOpenChamber,
  cablingSourceChamber = null,
  onSelectTargetChamber,
  onEnterBuilding,
}: BuildingPanelProps) {
  const [tab, setTab] = useState<Tab>("departments");
  const [chambers, setChambers] = useState<ChamberRow[]>([]);
  const [knowledge, setKnowledge] = useState<UniversalKnowledgeRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New chamber form state
  const [newChamberName, setNewChamberName] = useState("");
  const [newChamberDescription, setNewChamberDescription] = useState("");
  const [newChamberX, setNewChamberX] = useState(0);
  const [newChamberZ, setNewChamberZ] = useState(0);
  const [newChamberW, setNewChamberW] = useState(2);
  const [newChamberD, setNewChamberD] = useState(2);

  // New rule/knowledge form state
  const [newRuleText, setNewRuleText] = useState("");
  const [newKnowledgeTitle, setNewKnowledgeTitle] = useState("");
  const [newKnowledgeContent, setNewKnowledgeContent] = useState("");

  const loadData = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setError(null);

    try {
      if (supabaseConfigured) {
        // Fetch chambers
        const resChamb = await fetch(`/api/offices/${officeId}/buildings/${buildingId}/chambers`);
        const dataChamb = (await resChamb.json()) as { chambers?: ChamberRow[]; error?: string };
        if (!resChamb.ok) throw new Error(dataChamb.error ?? "Не удалось загрузить отделы");
        setChambers(dataChamb.chambers ?? []);

        // Fetch rules
        const resRules = await fetch(`/api/rules?entity_type=building&entity_id=${buildingId}`);
        const dataRules = (await resRules.json()) as { rules?: RuleRow[]; error?: string };
        if (!resRules.ok) throw new Error(dataRules.error ?? "Не удалось загрузить правила");
        setRules(dataRules.rules ?? []);

        // Fetch knowledge
        const resKnow = await fetch(`/api/knowledge?entity_type=building&entity_id=${buildingId}`);
        const dataKnow = (await resKnow.json()) as { entries?: UniversalKnowledgeRow[]; error?: string };
        if (!resKnow.ok) throw new Error(dataKnow.error ?? "Не удалось загрузить знания");
        setKnowledge(dataKnow.entries ?? []);
      } else {
        // Local Storage fallback
        const localChamb = loadLocalChambers().filter((c) => c.building_object_id === buildingId);
        setChambers(localChamb);

        const localRules = loadLocalRules().filter((r) => r.entity_type === "building" && r.entity_id === buildingId);
        setRules(localRules);

        const localKnow = loadLocalKnowledge().filter((k) => k.entity_type === "building" && k.entity_id === buildingId);
        setKnowledge(localKnow);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки данных");
    } finally {
      setLoading(false);
    }
  }, [buildingId, officeId, open, supabaseConfigured]);

  useEffect(() => {
    if (open) {
      void loadData();
    }
  }, [open, loadData]);

  // Handle Chamber CRUD
  async function handleAddChamber() {
    if (!newChamberName.trim()) {
      setError("Для отдела нужно название");
      return;
    }
    setError(null);

    try {
      if (supabaseConfigured) {
        const res = await fetch(`/api/offices/${officeId}/buildings/${buildingId}/chambers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: newChamberName.trim(),
            routing_description: newChamberDescription.trim(),
            x: Number(newChamberX),
            z: Number(newChamberZ),
            width: Number(newChamberW),
            depth: Number(newChamberD),
          }),
        });
        const data = (await res.json()) as { chamber?: ChamberRow; error?: string };
        if (!res.ok || !data.chamber) throw new Error(data.error ?? "Не удалось создать отдел");
        setChambers((prev) => [...prev, data.chamber!]);
      } else {
        // Local storage creation
        const chamberId = `local-chamber-${Date.now()}`;
        const registryId = `local-reg-${Date.now()}`;
        
        // 1. Update local registry
        const currentReg = loadLocalRegistry();
        currentReg.push({
          id: registryId,
          entity_type: "chamber",
          name: newChamberName.trim(),
          slug: newChamberName.trim().toLowerCase().replace(/[^a-zA-Z0-9]+/g, "-"),
          parent_entity_id: buildingId,
          routing_description: newChamberDescription.trim(),
          created_at: new Date().toISOString(),
        });
        saveLocalRegistry(currentReg);

        // 2. Update local chambers
        const currentChamb = loadLocalChambers();
        const newChamber: ChamberRow = {
          id: chamberId,
          entity_registry_id: registryId,
          building_entity_id: buildingId,
          building_object_id: buildingId,
          manager_agent_id: null,
          name: newChamberName.trim(),
          x: Number(newChamberX),
          z: Number(newChamberZ),
          width: Number(newChamberW),
          depth: Number(newChamberD),
          created_at: new Date().toISOString(),
        };
        currentChamb.push(newChamber);
        saveLocalChambers(currentChamb);

        setChambers((prev) => [...prev, newChamber]);
      }
      setNewChamberName("");
      setNewChamberDescription("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания отдела");
    }
  }

  async function handleDeleteChamber(chamberId: string) {
    if (!window.confirm("Удалить этот отдел?")) return;
    setError(null);

    try {
      if (supabaseConfigured) {
        const res = await fetch(`/api/offices/${officeId}/buildings/${buildingId}/chambers/${chamberId}`, {
          method: "DELETE",
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Не удалось удалить отдел");
      } else {
        const chambersList = loadLocalChambers();
        const registryList = loadLocalRegistry();
        
        const target = chambersList.find((c) => c.id === chamberId);
        if (target) {
          saveLocalChambers(chambersList.filter((c) => c.id !== chamberId));
          saveLocalRegistry(registryList.filter((r) => r.id !== target.entity_registry_id));
        }
      }
      setChambers((prev) => prev.filter((c) => c.id !== chamberId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка удаления отдела");
    }
  }

  // Handle Rules CRUD
  async function handleAddRule() {
    if (!newRuleText.trim()) return;
    setError(null);

    try {
      if (supabaseConfigured) {
        const res = await fetch("/api/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: "building",
            entity_id: buildingId,
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
          entity_type: "building",
          entity_id: buildingId,
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
    if (!newKnowledgeTitle.trim()) return;
    setError(null);

    try {
      if (supabaseConfigured) {
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity_type: "building",
            entity_id: buildingId,
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
          entity_type: "building",
          entity_id: buildingId,
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

  if (!open) return null;

  return (
    <div className="theme-panel-solid absolute inset-y-0 right-0 z-30 flex w-full max-w-md flex-col border-l shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-white/10">
        <div>
          <p className="text-xs uppercase tracking-widest text-accent-label-muted">Здание (Building)</p>
          <h2 className="text-lg font-semibold text-theme-primary">
            {building?.label?.trim() || `Building ${buildingId.substring(0, 8)}`}
          </h2>
          {onEnterBuilding && (
            <button
              type="button"
              onClick={onEnterBuilding}
              className="mt-2 flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-500 transition shadow-sm"
            >
              🚪 Войти в здание
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
          onClick={() => setTab("departments")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            tab === "departments"
              ? "bg-stone-600/15 text-stone-700 dark:bg-stone-500/25 dark:text-stone-200"
              : "text-theme-muted hover:text-theme-secondary"
          }`}
        >
          Отделы (Departments)
        </button>
        <button
          type="button"
          onClick={() => setTab("rules")}
          className={`rounded-lg px-3 py-1.5 text-sm transition ${
            tab === "rules"
              ? "bg-stone-600/15 text-stone-700 dark:bg-stone-500/25 dark:text-stone-200"
              : "text-theme-muted hover:text-theme-secondary"
          }`}
        >
          Правила
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
          База знаний
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

        {!loading && tab === "departments" && (
          <div className="space-y-4">
            {/* Create Chamber Form */}
            <div className="rounded-xl border border-zinc-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-theme-secondary">
                Создать новый отдел (Department)
              </h3>
              <input
                value={newChamberName}
                onChange={(e) => setNewChamberName(e.target.value)}
                placeholder="Название отдела (например, Marketing)"
                className="mb-2 w-full rounded-lg border border-zinc-200 bg-white/90 px-3 py-2 text-sm text-theme-secondary outline-none dark:border-white/10 dark:bg-black/40 dark:text-zinc-200"
              />
              <textarea
                value={newChamberDescription}
                onChange={(e) => setNewChamberDescription(e.target.value)}
                placeholder="Чем занимается этот отдел? Краткое описание для маршрутизации"
                rows={3}
                className="mb-2 w-full resize-y rounded-lg border border-zinc-200 bg-white/90 px-3 py-2 text-sm text-theme-secondary outline-none dark:border-white/10 dark:bg-black/40 dark:text-zinc-200"
              />
              <div className="mb-3 grid grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-theme-muted">X</label>
                  <input
                    type="number"
                    value={newChamberX}
                    onChange={(e) => setNewChamberX(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-200 bg-white/90 px-2 py-1 text-xs outline-none dark:border-white/10 dark:bg-black/40"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-theme-muted">Z</label>
                  <input
                    type="number"
                    value={newChamberZ}
                    onChange={(e) => setNewChamberZ(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-200 bg-white/90 px-2 py-1 text-xs outline-none dark:border-white/10 dark:bg-black/40"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-theme-muted">Ширина</label>
                  <input
                    type="number"
                    value={newChamberW}
                    onChange={(e) => setNewChamberW(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-200 bg-white/90 px-2 py-1 text-xs outline-none dark:border-white/10 dark:bg-black/40"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-theme-muted">Глубина</label>
                  <input
                    type="number"
                    value={newChamberD}
                    onChange={(e) => setNewChamberD(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-200 bg-white/90 px-2 py-1 text-xs outline-none dark:border-white/10 dark:bg-black/40"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => void handleAddChamber()}
                disabled={!newChamberName.trim()}
                className="rounded-lg bg-stone-700 px-4 py-2 text-sm text-white hover:bg-stone-600 dark:bg-stone-600 dark:hover:bg-stone-500"
              >
                Добавить отдел
              </button>
            </div>

            {/* Chambers List */}
            <ul className="space-y-2">
              {chambers.length === 0 && (
                <li className="text-sm text-theme-muted">Внутри здания нет отделов.</li>
              )}
              {chambers.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 bg-white/60 p-3 hover:bg-stone-100/30 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]"
                >
                  {cablingSourceChamber ? (
                    <div className="flex-1 text-left text-sm font-medium text-theme-primary">
                      {c.name}
                      <span className="ml-2 text-[10px] text-theme-muted">
                        ({c.width}x{c.depth} в [{c.x}, {c.z}])
                      </span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenChamber(c)}
                      className="flex-1 text-left text-sm font-medium text-teal-600 hover:underline dark:text-teal-400"
                    >
                      {c.name}
                      <span className="ml-2 text-[10px] text-theme-muted">
                        ({c.width}x{c.depth} в [{c.x}, {c.z}])
                      </span>
                    </button>
                  )}

                  {cablingSourceChamber ? (
                    cablingSourceChamber.id === c.id ? (
                      <span className="text-xs text-theme-muted font-medium italic">Источник</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectTargetChamber?.(c)}
                        className="rounded-lg bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 text-xs font-semibold transition shadow-sm"
                      >
                        Выбрать как цель
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleDeleteChamber(c.id)}
                      className="text-xs text-red-400 hover:text-red-300 ml-2 animate-hover"
                    >
                      Удалить
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loading && tab === "rules" && (
          <div className="space-y-4">
            {/* Add Rule Form */}
            <div className="rounded-xl border border-zinc-200 bg-white/60 p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <textarea
                value={newRuleText}
                onChange={(e) => setNewRuleText(e.target.value)}
                placeholder="Введите текст нового правила для здания"
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
                <li className="text-sm text-theme-muted">База знаний здания пуста</li>
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
      </div>
    </div>
  );
}
