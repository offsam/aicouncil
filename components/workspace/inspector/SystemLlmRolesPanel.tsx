"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SimpleIcon } from "simple-icons";
import {
  COST_TIER_LABEL,
  type CostTier,
} from "@/lib/cost-tier";
import type { CatalogCategoryBlock, CatalogModel, ModelGateway } from "@/lib/model-catalog/types";
import { CostTierBadge } from "@/components/workspace/CostTierBadge";
import {
  getAgentIconOption,
  originProviderToIconId,
  type AgentIconOption,
} from "@/components/workspace/agent-icon-catalog";
import {
  isCatalogModelFeatured,
  splitCatalogModelsByFeatured,
} from "@/lib/model-catalog/popular-models";
import { formatCatalogGatewayLabel } from "@/lib/model-catalog/resolve-origin-provider";
import type { ProviderHealthRow } from "@/lib/provider-failover-status";
import {
  SYSTEM_LLM_ROLE_LABELS,
  type SystemLlmProvider,
  type SystemLlmRole,
  type SystemLlmRoleRecord,
} from "@/lib/system-llm-roles";

const SERVICE_LLM_GATEWAYS: ModelGateway[] = ["anthropic", "openai", "groq", "google"];

type EditTarget = { role: SystemLlmRole; slot: "primary" | "fallback" } | null;

type SystemLlmRolesPanelProps = {
  officeId: string;
};

function renderIcon(option: AgentIconOption, className: string) {
  if (option.kind === "simple") {
    const icon = option.icon as SimpleIcon;
    return (
      <svg className={className} viewBox="0 0 24 24" focusable="false" aria-hidden="true">
        <path d={icon.path} fill="currentColor" />
      </svg>
    );
  }
  const Icon = option.icon;
  return <Icon className={className} strokeWidth={2} />;
}

function ProviderGatewayFilter({
  value,
  onChange,
}: {
  value: ModelGateway | null;
  onChange: (gateway: ModelGateway | null) => void;
}) {
  return (
    <div className="workspace-bubble-chip-row" data-testid="system-llm-roles-provider-filter">
      <button
        type="button"
        className={`workspace-bubble-chip${value === null ? " workspace-bubble-chip--accent" : ""}`}
        onClick={() => onChange(null)}
      >
        Все
      </button>
      {SERVICE_LLM_GATEWAYS.map((gateway) => (
        <button
          key={gateway}
          type="button"
          className={`workspace-bubble-chip${value === gateway ? " workspace-bubble-chip--accent" : ""}`}
          onClick={() => onChange(gateway)}
          data-testid={`system-llm-roles-gateway-${gateway}`}
        >
          {formatCatalogGatewayLabel(gateway)}
        </button>
      ))}
    </div>
  );
}

function CatalogModelTile({
  model,
  disabled,
  featured = false,
  onSelect,
}: {
  model: CatalogModel;
  disabled?: boolean;
  featured?: boolean;
  onSelect: (model: CatalogModel) => void;
}) {
  const iconId = originProviderToIconId(model.originProviderSlug);
  const icon = getAgentIconOption(iconId);
  const color = icon.kind === "simple" ? icon.color : "currentColor";
  const gatewayLabel = formatCatalogGatewayLabel(model.gateway);

  return (
    <button
      type="button"
      disabled={disabled}
      data-testid={`system-llm-role-model-${model.key}`}
      onClick={() => onSelect(model)}
      className={`workspace-bubble-model-tile${featured ? " workspace-bubble-model-tile--featured" : ""}`}
      title={`${model.displayName} (через ${gatewayLabel}) · ${model.originProvider} · ${COST_TIER_LABEL[model.costTier as CostTier]}`}
    >
      <span className="workspace-bubble-model-tile__icon" style={{ color }}>
        {renderIcon(icon, "h-5 w-5")}
      </span>
      <span className="workspace-bubble-model-tile__name">
        {model.displayName}
        <span className="workspace-bubble-model-tile__via"> (через {gatewayLabel})</span>
      </span>
      <span className="workspace-bubble-model-tile__origin">{model.originProvider}</span>
      <CostTierBadge tier={model.costTier} className="workspace-bubble-model-tile__tier" />
    </button>
  );
}

function catalogModelToSystemConfig(
  model: CatalogModel,
): { provider: SystemLlmProvider; model: string } | null {
  if (model.gateway === "google") return { provider: "gemini", model: model.modelId };
  if (model.gateway === "groq") return { provider: "groq", model: model.modelId };
  if (model.gateway === "anthropic") return { provider: "anthropic", model: model.modelId };
  if (model.gateway === "openai") return { provider: "openai", model: model.modelId };
  return null;
}

function formatProviderModel(provider: SystemLlmProvider, model: string): string {
  return `${provider} / ${model}`;
}

function providerHealthLabel(
  providers: ProviderHealthRow[],
  provider: SystemLlmProvider,
  model: string,
): { text: string; tone: "muted" | "ok" | "warn" | "bad" } {
  const row = providers.find((p) => p.providerTag === provider);
  if (!row) {
    return { text: "ещё не вызывался", tone: "muted" };
  }
  const matchesModel = row.primaryModel === model || row.modelUsed === model;
  if (!matchesModel) {
    return { text: "нет данных", tone: "muted" };
  }
  if (row.status === "available") return { text: "доступен", tone: "ok" };
  if (row.status === "on_fallback") {
    return { text: `резерв: ${row.modelUsed ?? "?"}`, tone: "warn" };
  }
  return { text: "недоступен", tone: "bad" };
}

function healthToneClass(tone: "muted" | "ok" | "warn" | "bad"): string {
  if (tone === "ok") return "text-emerald-400";
  if (tone === "warn") return "text-amber-400";
  if (tone === "bad") return "text-red-400";
  return "text-stone-500";
}

function RoleModelPicker({
  officeId,
  role,
  slot,
  onSaved,
  onCancel,
}: {
  officeId: string;
  role: SystemLlmRole;
  slot: "primary" | "fallback";
  onSaved: (record: SystemLlmRoleRecord) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filterGateway, setFilterGateway] = useState<ModelGateway | null>(null);
  const [categories, setCategories] = useState<CatalogCategoryBlock[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ grouped: "1" });
      if (search.trim()) params.set("q", search.trim());
      if (filterGateway) params.set("gateway", filterGateway);
      const res = await fetch(`/api/model-catalog?${params.toString()}`);
      const body = (await res.json()) as {
        categories?: CatalogCategoryBlock[];
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? "Не удалось загрузить каталог");

      const filtered = (body.categories ?? [])
        .map((block) => ({
          ...block,
          models: block.models.filter((m) => catalogModelToSystemConfig(m) !== null),
        }))
        .filter((block) => block.models.length > 0);
      setCategories(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [filterGateway, search]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  async function handleSelect(model: CatalogModel) {
    const mapped = catalogModelToSystemConfig(model);
    if (!mapped) return;

    setSavingKey(model.key);
    setError(null);
    try {
      const patch =
        slot === "primary"
          ? { primaryProvider: mapped.provider, primaryModel: mapped.model }
          : { fallbackProvider: mapped.provider, fallbackModel: mapped.model };

      const res = await fetch(`/api/offices/${officeId}/system-llm-roles/${role}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json()) as { role?: SystemLlmRoleRecord; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Ошибка ${res.status}`);
      if (!body.role) throw new Error("Пустой ответ");
      onSaved(body.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div
      className="mt-2 space-y-2 rounded border border-stone-700 bg-stone-900/50 p-2"
      data-testid={`system-llm-role-picker-${role}-${slot}`}
    >
      <p className="text-xs text-stone-400">
        {slot === "primary" ? "Primary" : "Fallback"} — {SYSTEM_LLM_ROLE_LABELS[role]}
      </p>
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск модели…"
        className="workspace-bubble-input"
      />
      <ProviderGatewayFilter value={filterGateway} onChange={setFilterGateway} />
      {loading && <p className="workspace-bubble-loading text-xs">Загрузка каталога…</p>}
      {!loading && categories.length === 0 && (
        <p className="text-xs text-stone-500">Нет моделей по фильтрам</p>
      )}
      {!loading &&
        categories.map((block) => {
          const { featured, rest } = splitCatalogModelsByFeatured(block.models);
          return (
            <section key={block.id} className="workspace-bubble-category-block">
              <h4 className="workspace-bubble-category-block__title">{block.label}</h4>
              <div className="workspace-bubble-model-sections">
                {featured.length > 0 && (
                  <div className="workspace-bubble-model-grid">
                    {featured.map((m) => (
                      <CatalogModelTile
                        key={m.key}
                        model={m}
                        featured={isCatalogModelFeatured(m)}
                        disabled={savingKey === m.key}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                )}
                {rest.length > 0 && (
                  <div className="workspace-bubble-model-grid">
                    {rest.map((m) => (
                      <CatalogModelTile
                        key={m.key}
                        model={m}
                        disabled={savingKey === m.key}
                        onSelect={handleSelect}
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="workspace-bubble-btn workspace-bubble-btn--ghost text-xs"
      >
        Отмена
      </button>
    </div>
  );
}

function RoleCard({
  record,
  providers,
  editTarget,
  officeId,
  onEdit,
  onCancelEdit,
  onUpdated,
}: {
  record: SystemLlmRoleRecord;
  providers: ProviderHealthRow[];
  editTarget: EditTarget;
  officeId: string;
  onEdit: (slot: "primary" | "fallback") => void;
  onCancelEdit: () => void;
  onUpdated: (record: SystemLlmRoleRecord) => void;
}) {
  const primaryHealth = providerHealthLabel(providers, record.primaryProvider, record.primaryModel);
  const fallbackHealth = providerHealthLabel(
    providers,
    record.fallbackProvider,
    record.fallbackModel,
  );

  const editingPrimary = editTarget?.role === record.role && editTarget.slot === "primary";
  const editingFallback = editTarget?.role === record.role && editTarget.slot === "fallback";

  return (
    <div
      className="rounded border border-stone-800 px-2 py-2"
      data-testid={`system-llm-role-card-${record.role}`}
    >
      <p className="text-sm font-medium text-stone-200">{SYSTEM_LLM_ROLE_LABELS[record.role]}</p>

      <div className="mt-2 space-y-1 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-stone-400">Primary</span>
          <span className="text-stone-300">
            {formatProviderModel(record.primaryProvider, record.primaryModel)}
          </span>
          <span className={healthToneClass(primaryHealth.tone)}>{primaryHealth.text}</span>
          {!editingPrimary && (
            <button
              type="button"
              className="rounded border border-stone-600 px-1.5 py-0.5 text-[11px] text-stone-300 hover:bg-stone-800"
              onClick={() => onEdit("primary")}
              data-testid={`system-llm-role-edit-primary-${record.role}`}
            >
              Сменить
            </button>
          )}
        </div>
        {editingPrimary && (
          <RoleModelPicker
            officeId={officeId}
            role={record.role}
            slot="primary"
            onSaved={onUpdated}
            onCancel={onCancelEdit}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-stone-400">Fallback</span>
          <span className="text-stone-300">
            {formatProviderModel(record.fallbackProvider, record.fallbackModel)}
          </span>
          <span className={healthToneClass(fallbackHealth.tone)}>{fallbackHealth.text}</span>
          {!editingFallback && (
            <button
              type="button"
              className="rounded border border-stone-600 px-1.5 py-0.5 text-[11px] text-stone-300 hover:bg-stone-800"
              onClick={() => onEdit("fallback")}
              data-testid={`system-llm-role-edit-fallback-${record.role}`}
            >
              Сменить
            </button>
          )}
        </div>
        {editingFallback && (
          <RoleModelPicker
            officeId={officeId}
            role={record.role}
            slot="fallback"
            onSaved={onUpdated}
            onCancel={onCancelEdit}
          />
        )}
      </div>
    </div>
  );
}

export function SystemLlmRolesPanel({ officeId }: SystemLlmRolesPanelProps) {
  const [roles, setRoles] = useState<SystemLlmRoleRecord[]>([]);
  const [providers, setProviders] = useState<ProviderHealthRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rolesRes, healthRes] = await Promise.all([
        fetch(`/api/offices/${officeId}/system-llm-roles`, { cache: "no-store" }),
        fetch("/api/tech-department/provider-health", { cache: "no-store" }),
      ]);
      if (!rolesRes.ok) {
        const body = (await rolesRes.json()) as { error?: string };
        throw new Error(body.error ?? `roles ${rolesRes.status}`);
      }
      const rolesBody = (await rolesRes.json()) as { roles?: SystemLlmRoleRecord[] };
      setRoles(rolesBody.roles ?? []);

      if (healthRes.ok) {
        const healthBody = (await healthRes.json()) as { providers?: ProviderHealthRow[] };
        setProviders(healthBody.providers ?? []);
      } else {
        setProviders([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, [officeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rolesByKey = useMemo(() => new Map(roles.map((r) => [r.role, r])), [roles]);

  function handleUpdated(record: SystemLlmRoleRecord) {
    setRoles((prev) => prev.map((r) => (r.role === record.role ? record : r)));
    setEditTarget(null);
  }

  return (
    <div className="space-y-3" data-testid="system-llm-roles-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">
          Конфигурация служебных LLM для planner, router и summary. Health — из последних вызовов,
          без отдельного ping.
        </p>
        <button
          type="button"
          disabled={loading}
          onClick={() => void refresh()}
          className="shrink-0 rounded border border-stone-600 px-2 py-1 text-xs text-stone-200 hover:bg-stone-800 disabled:opacity-50"
          data-testid="system-llm-roles-refresh"
        >
          {loading ? "…" : "Обновить"}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400" data-testid="system-llm-roles-error">
          {error}
        </p>
      )}

      <div className="space-y-2">
        {(["planner", "router", "summary"] as SystemLlmRole[]).map((role) => {
          const record = rolesByKey.get(role);
          if (!record) return null;
          return (
            <RoleCard
              key={role}
              record={record}
              providers={providers}
              editTarget={editTarget}
              officeId={officeId}
              onEdit={(slot) => setEditTarget({ role, slot })}
              onCancelEdit={() => setEditTarget(null)}
              onUpdated={handleUpdated}
            />
          );
        })}
      </div>
    </div>
  );
}
