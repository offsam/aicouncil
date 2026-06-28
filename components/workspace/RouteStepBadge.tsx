import { routeStepMarker } from "@/lib/workspace/resolve-route-highlight";

type RouteStepBadgeProps = {
  step: number;
  total?: number;
  variant?: "route" | "workflow";
};

export function RouteStepBadge({ step, total, variant = "route" }: RouteStepBadgeProps) {
  const isWorkflow = variant === "workflow" && total != null;
  const label = isWorkflow ? `Step ${step}/${total}` : routeStepMarker(step);

  return (
    <span
      className={`workspace-route-step-badge${isWorkflow ? " workspace-route-step-badge--workflow" : ""}`}
      aria-label={isWorkflow ? `Workflow step ${step} of ${total}` : `Шаг ${step}`}
      data-testid={isWorkflow ? "workspace-workflow-step-badge" : undefined}
    >
      {label}
    </span>
  );
}
