"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SimpleIcon } from "simple-icons";
import {
  COST_TIER_LABEL,
  type CostTier,
} from "@/lib/cost-tier";
import type { CatalogCategoryBlock, CatalogModel, ModelGateway } from "@/lib/model-catalog/types";
import { GATEWAY_FILTER_ORDER, SPECIALIZATION_META, SPECIALIZATION_ORDER } from "@/lib/model-catalog/types";
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

type PickerPath = "choose" | "all" | "filter-spec" | "filter-tier" | "filter-results";

type ChamberAgentPickerProps = {
  chamberId: string;
  busy?: boolean;
  onBack: () => void;
  onAssign: (model: CatalogModel) => Promise<void>;
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
    <div className="workspace-bubble-chip-row" data-testid="chamber-agent-picker-provider-filter">
      <button
        type="button"
        className={`workspace-bubble-chip${value === null ? " workspace-bubble-chip--accent" : ""}`}
        onClick={() => onChange(null)}
        data-testid="chamber-agent-picker-gateway-all"
      >
        Все
      </button>
      {GATEWAY_FILTER_ORDER.map((gateway) => (
        <button
          key={gateway}
          type="button"
          className={`workspace-bubble-chip${value === gateway ? " workspace-bubble-chip--accent" : ""}`}
          onClick={() => onChange(gateway)}
          data-testid={`chamber-agent-picker-gateway-${gateway}`}
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
      data-testid={`catalog-model-${model.key}`}
      data-featured={featured ? "true" : undefined}
      onClick={() => onSelect(model)}
      className={`workspace-bubble-model-tile${featured ? " workspace-bubble-model-tile--featured" : ""}`}
      title={`${model.displayName} (через ${gatewayLabel}) · ${model.originProvider} · ${COST_TIER_LABEL[model.costTier]}${featured ? " · популярная" : ""}`}
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

function ModelGridSection({
  models,
  assigningKey,
  featured = false,
  onSelect,
}: {
  models: CatalogModel[];
  assigningKey: string | null;
  featured?: boolean;
  onSelect: (model: CatalogModel) => void;
}) {
  if (models.length === 0) return null;

  return (
    <div className="workspace-bubble-model-grid">
      {models.map((model) => (
        <CatalogModelTile
          key={model.key}
          model={model}
          featured={featured || isCatalogModelFeatured(model)}
          disabled={assigningKey === model.key}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ModelGrid({
  models,
  assigningKey,
  onSelect,
}: {
  models: CatalogModel[];
  assigningKey: string | null;
  onSelect: (model: CatalogModel) => void;
}) {
  if (models.length === 0) {
    return <p className="workspace-bubble-empty">Нет моделей по выбранным фильтрам</p>;
  }

  const { featured, rest } = splitCatalogModelsByFeatured(models);

  return (
    <div className="workspace-bubble-model-sections">
      {featured.length > 0 && (
        <section className="workspace-bubble-model-section">
          <p className="workspace-bubble-model-section__label">Популярные</p>
          <ModelGridSection
            models={featured}
            assigningKey={assigningKey}
            featured
            onSelect={onSelect}
          />
        </section>
      )}
      {rest.length > 0 && (
        <section className="workspace-bubble-model-section">
          {featured.length > 0 && (
            <p className="workspace-bubble-model-section__label">Остальные</p>
          )}
          <ModelGridSection models={rest} assigningKey={assigningKey} onSelect={onSelect} />
        </section>
      )}
    </div>
  );
}

function CategoryBlocks({
  categories,
  assigningKey,
  onSelect,
}: {
  categories: CatalogCategoryBlock[];
  assigningKey: string | null;
  onSelect: (model: CatalogModel) => void;
}) {
  return (
    <div className="workspace-bubble-category-scroll">
      {categories.map((block) => {
        const { featured, rest } = splitCatalogModelsByFeatured(block.models);
        return (
          <section key={block.id} className="workspace-bubble-category-block">
            <h4 className="workspace-bubble-category-block__title">{block.label}</h4>
            <p className="workspace-bubble-category-block__hint">{block.hint}</p>
            <div className="workspace-bubble-model-sections">
              {featured.length > 0 && (
                <div className="workspace-bubble-model-section">
                  <p className="workspace-bubble-model-section__label">Популярные</p>
                  <ModelGridSection
                    models={featured}
                    assigningKey={assigningKey}
                    featured
                    onSelect={onSelect}
                  />
                </div>
              )}
              {rest.length > 0 && (
                <div className="workspace-bubble-model-section">
                  {featured.length > 0 && (
                    <p className="workspace-bubble-model-section__label">Остальные</p>
                  )}
                  <ModelGridSection
                    models={rest}
                    assigningKey={assigningKey}
                    onSelect={onSelect}
                  />
                </div>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function ChamberAgentPicker({
  chamberId,
  busy = false,
  onBack,
  onAssign,
}: ChamberAgentPickerProps) {
  const [path, setPath] = useState<PickerPath>("choose");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<CatalogCategoryBlock[]>([]);
  const [filteredModels, setFilteredModels] = useState<CatalogModel[]>([]);
  const [assignedKeys, setAssignedKeys] = useState<Set<string>>(new Set());
  const [filterSpec, setFilterSpec] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<CostTier | null>(null);
  const [filterGateway, setFilterGateway] = useState<ModelGateway | null>(null);
  const [assigningKey, setAssigningKey] = useState<string | null>(null);

  const loadAssignedKeys = useCallback(async () => {
    const res = await fetch(`/api/chambers/${chamberId}/assignments`);
    const body = (await res.json()) as {
      assignments?: Array<{ agents?: { provider?: string; model_id?: string } | null }>;
    };
    const keys = new Set<string>();
    for (const row of body.assignments ?? []) {
      const provider = row.agents?.provider;
      const modelId = row.agents?.model_id;
      if (provider && modelId) {
        keys.add(`${provider.trim().toLowerCase()}:${modelId}`);
      }
    }
    setAssignedKeys(keys);
  }, [chamberId]);

  const excludeAssigned = useCallback(
    (models: CatalogModel[]) => models.filter((m) => !assignedKeys.has(m.key)),
    [assignedKeys],
  );

  const loadAllGrouped = useCallback(async () => {
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
      const next = (body.categories ?? []).map((block) => ({
        ...block,
        models: excludeAssigned(block.models),
      }));
      setCategories(next.filter((block) => block.models.length > 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [excludeAssigned, filterGateway, search]);

  const loadFiltered = useCallback(async () => {
    if (!filterSpec || !filterTier) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        specialization: filterSpec,
        cost_tier: filterTier,
      });
      if (search.trim()) params.set("q", search.trim());
      if (filterGateway) params.set("gateway", filterGateway);
      const res = await fetch(`/api/model-catalog?${params.toString()}`);
      const body = (await res.json()) as { models?: CatalogModel[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Не удалось загрузить каталог");
      setFilteredModels(excludeAssigned(body.models ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
      setFilteredModels([]);
    } finally {
      setLoading(false);
    }
  }, [excludeAssigned, filterGateway, filterSpec, filterTier, search]);

  useEffect(() => {
    void loadAssignedKeys();
  }, [loadAssignedKeys]);

  useEffect(() => {
    if (path === "all") void loadAllGrouped();
  }, [path, loadAllGrouped]);

  useEffect(() => {
    if (path === "filter-results") void loadFiltered();
  }, [path, loadFiltered]);

  const tierOptions = useMemo(
    () =>
      (["free", "cheap", "mid", "premium"] as CostTier[]).map((tier) => ({
        id: tier,
        label: COST_TIER_LABEL[tier],
      })),
    [],
  );

  async function handleSelect(model: CatalogModel) {
    setAssigningKey(model.key);
    setError(null);
    try {
      await onAssign(model);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось назначить");
    } finally {
      setAssigningKey(null);
    }
  }

  function handleGatewayFilterChange(gateway: ModelGateway | null) {
    setFilterGateway(gateway);
    if (path === "choose") {
      setPath("all");
    }
  }

  function goBackWithinPicker() {
    setError(null);
    if (path === "filter-tier") {
      setPath("filter-spec");
      return;
    }
    if (path === "filter-results") {
      setPath("filter-tier");
      return;
    }
    if (path === "all" || path === "filter-spec") {
      setPath("choose");
      setFilterSpec(null);
      setFilterTier(null);
      setFilterGateway(null);
      return;
    }
    onBack();
  }

  return (
    <div className="space-y-3" data-testid="chamber-agent-picker">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск модели или провайдера…"
        className="workspace-bubble-input"
        data-testid="chamber-agent-picker-search"
      />

      {path !== "filter-spec" && path !== "filter-tier" && (
        <ProviderGatewayFilter value={filterGateway} onChange={handleGatewayFilterChange} />
      )}

      {path === "choose" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setPath("all")}
            className="workspace-bubble-option"
            data-testid="chamber-agent-picker-all"
          >
            <span className="workspace-bubble-option__label">Показать всех</span>
            <span className="workspace-bubble-option__hint">
              Полный каталог: популярные сверху, блоки по специализации. Фильтр провайдера — выше.
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setPath("filter-spec")}
            className="workspace-bubble-option"
            data-testid="chamber-agent-picker-filter"
          >
            <span className="workspace-bubble-option__label">Подобрать по фильтру</span>
            <span className="workspace-bubble-option__hint">
              Сначала специализация, затем cost tier
            </span>
          </button>
        </div>
      )}

      {path === "filter-spec" && (
        <div className="space-y-2">
          <p className="workspace-bubble-step-label">Шаг 1 — специализация</p>
          <div className="workspace-bubble-chip-row">
            {SPECIALIZATION_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setFilterSpec(id);
                  setPath("filter-tier");
                }}
                className="workspace-bubble-chip"
              >
                {SPECIALIZATION_META[id].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {path === "filter-tier" && filterSpec && (
        <div className="space-y-2">
          <p className="workspace-bubble-step-label">
            Шаг 2 — cost tier · {SPECIALIZATION_META[filterSpec as keyof typeof SPECIALIZATION_META].label}
          </p>
          <div className="workspace-bubble-chip-row">
            {tierOptions.map((tier) => (
              <button
                key={tier.id}
                type="button"
                onClick={() => {
                  setFilterTier(tier.id);
                  setPath("filter-results");
                }}
                className="workspace-bubble-chip"
              >
                {tier.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="workspace-bubble-loading">Загрузка каталога…</p>}

      {!loading && path === "all" && (
        <CategoryBlocks categories={categories} assigningKey={assigningKey} onSelect={handleSelect} />
      )}

      {!loading && path === "filter-results" && filterSpec && filterTier && (
        <ModelGrid models={filteredModels} assigningKey={assigningKey} onSelect={handleSelect} />
      )}

      {error && (
        <p className="workspace-bubble-sheet__error" role="alert">
          {error}
        </p>
      )}

      <div className="workspace-bubble-actions">
        <button
          type="button"
          onClick={goBackWithinPicker}
          className="workspace-bubble-btn workspace-bubble-btn--ghost"
        >
          {path === "choose" ? "Назад" : "←"}
        </button>
      </div>
    </div>
  );
}
