import { costTierDisplayLabel } from "@/lib/cost-tier";

export type WorkspaceNodeStatus = "idle" | "running" | "warning" | "error" | "completed";

export function normalizeWorkspaceNodeStatus(
  value: string | null | undefined,
): WorkspaceNodeStatus | null {
  const status = value?.trim().toLowerCase();
  if (!status) return null;
  if (status === "online" || status === "running" || status === "working") return "running";
  if (status === "warning" || status === "warn") return "warning";
  if (status === "error" || status === "failed") return "error";
  if (status === "completed" || status === "complete" || status === "done") return "completed";
  if (status === "offline" || status === "idle" || status === "pending") return "idle";
  return null;
}

export function workspaceNodeStatusLabel(status: string | null | undefined): string {
  const normalized = normalizeWorkspaceNodeStatus(status);
  if (!normalized) return "—";
  return normalized;
}

export function workspaceNodeStatusTone(status: string | null | undefined): string {
  const normalized = normalizeWorkspaceNodeStatus(status);
  if (!normalized) return "idle";
  return normalized;
}

export function workspaceCostTierLabel(value: string | null | undefined): string {
  if (!value?.trim()) return "—";
  return costTierDisplayLabel(value, "symbol");
}

export function workspaceRouteLitClass(
  lit: boolean | undefined,
  tone?: "active" | "success",
): string {
  if (!lit) return "";
  return tone === "success"
    ? "workspace-route-lit workspace-route-lit--success"
    : "workspace-route-lit workspace-route-lit--active";
}

export function workspaceTronRouteClass(
  pulse: boolean | undefined,
  kind: "building" | "chamber" | "agent",
  tone?: "active" | "success",
  lit?: boolean,
): string {
  void kind;
  if (!pulse) return "";
  if (tone === "success") {
    return lit
      ? "workspace-route-lit workspace-route-lit--success"
      : "workspace-route-lit workspace-route-lit--success";
  }
  return "workspace-route-lit workspace-route-lit--active";
}
