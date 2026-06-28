"use client";

import { ReactFlowProvider } from "@xyflow/react";
import { WorkspaceCanvas } from "@/components/workspace/WorkspaceCanvas";
import { WorkspaceAppearanceProvider } from "@/components/workspace/WorkspaceAppearanceContext";
import { WorkspaceMayorChat } from "@/components/workspace/WorkspaceMayorChat";
import { WorkspaceChatProvider } from "@/components/workspace/WorkspaceChatContext";
import { WorkspaceInspector } from "@/components/workspace/WorkspaceInspector";
import { WorkspaceLocaleProvider } from "@/components/workspace/WorkspaceLocaleContext";
import type { ExecutionMode } from "@/lib/execution-mode";
import { WorkspaceExecutionModeProvider } from "@/components/workspace/WorkspaceExecutionModeContext";
import { WorkspaceRouteProvider } from "@/components/workspace/WorkspaceRouteContext";
import { WorkspaceSelectionProvider } from "@/components/workspace/WorkspaceSelectionContext";
import { WorkspaceTopMissionBar } from "@/components/workspace/WorkspaceTopMissionBar";
import { WorkspaceBottomActivityLog } from "@/components/workspace/WorkspaceBottomActivityLog";
import { WorkspaceTaskToastHost } from "@/components/workspace/WorkspaceTaskToastHost";

function WorkspaceLayout({
  officeId,
  techDepartmentBuildingId,
}: {
  officeId: string;
  techDepartmentBuildingId: string;
}) {
  return (
    <div className="workspace-shell flex h-screen flex-col overflow-hidden bg-[var(--ws-shell-bg)]">
      <WorkspaceTopMissionBar />

      <div className="min-h-0 flex-1">
        <div className="flex h-full min-h-0 min-w-0">
          <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
            <ReactFlowProvider>
              <WorkspaceCanvas
                officeId={officeId}
                techDepartmentBuildingId={techDepartmentBuildingId}
              />
            </ReactFlowProvider>
            <WorkspaceTaskToastHost />
            <WorkspaceMayorChat />
          </main>
          <WorkspaceInspector />
        </div>
      </div>

      <WorkspaceBottomActivityLog />
    </div>
  );
}

export function WorkspaceShell({
  officeId,
  techDepartmentBuildingId,
  initialExecutionMode = "fast",
}: {
  officeId: string;
  techDepartmentBuildingId: string;
  initialExecutionMode?: ExecutionMode;
}) {
  return (
    <WorkspaceLocaleProvider>
      <WorkspaceSelectionProvider>
        <WorkspaceRouteProvider>
          <WorkspaceExecutionModeProvider
            officeId={officeId}
            initialMode={initialExecutionMode}
          >
            <WorkspaceAppearanceProvider>
              <WorkspaceChatProvider>
                <WorkspaceLayout
                  officeId={officeId}
                  techDepartmentBuildingId={techDepartmentBuildingId}
                />
              </WorkspaceChatProvider>
            </WorkspaceAppearanceProvider>
          </WorkspaceExecutionModeProvider>
        </WorkspaceRouteProvider>
      </WorkspaceSelectionProvider>
    </WorkspaceLocaleProvider>
  );
}
