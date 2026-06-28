"use client";

import { Move } from "lucide-react";
import { useWorkspaceLocale } from "@/components/workspace/WorkspaceLocaleContext";

type WorkspaceNodeDragHandleProps = {
  label: string;
  size?: "sm" | "md";
};

export function WorkspaceNodeDragHandle({ label, size = "md" }: WorkspaceNodeDragHandleProps) {
  const { t } = useWorkspaceLocale();
  const iconClass =
    size === "sm" ? "workspace-node-drag-handle__icon--sm" : "workspace-node-drag-handle__icon--md";

  return (
    <span
      className="workspace-node-drag-handle"
      title={t.nodeDragTitle}
      aria-label={t.nodeDragAria(label)}
    >
      <Move className={`workspace-node-drag-handle__icon ${iconClass}`} aria-hidden />
    </span>
  );
}
