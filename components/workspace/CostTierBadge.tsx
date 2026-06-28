import {
  costTierDisplayLabel,
  normalizeCostTier,
} from "@/lib/cost-tier";

type CostTierBadgeProps = {
  tier: string | null | undefined;
  variant?: "full" | "compact";
  className?: string;
  title?: string;
};

export function CostTierBadge({
  tier,
  variant = "full",
  className = "",
  title,
}: CostTierBadgeProps) {
  const normalized = normalizeCostTier(tier);
  const label = costTierDisplayLabel(normalized, "symbol");

  return (
    <span
      className={`workspace-cost-tier-badge workspace-cost-tier-badge--${normalized} workspace-cost-tier-badge--${variant} ${className}`.trim()}
      title={title ?? costTierDisplayLabel(normalized, "ru")}
      aria-label={`Стоимость: ${costTierDisplayLabel(normalized, "ru")}`}
    >
      {label}
    </span>
  );
}
