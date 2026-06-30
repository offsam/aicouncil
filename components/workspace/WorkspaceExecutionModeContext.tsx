"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ExecutionMode } from "@/lib/execution-mode";

type WorkspaceExecutionModeContextValue = {
  executionMode: ExecutionMode;
  setExecutionMode: (mode: ExecutionMode) => void;
  /** Legacy Smart checkbox — derived from executionMode === "turbo"; toggling sets mode. */
  smartEnabled: boolean;
  setSmartEnabled: (enabled: boolean) => void;
};

const WorkspaceExecutionModeContext =
  createContext<WorkspaceExecutionModeContextValue | null>(null);

export function WorkspaceExecutionModeProvider({
  children,
  officeId,
  initialMode = "fast",
}: {
  children: ReactNode;
  officeId: string;
  initialMode?: ExecutionMode;
}) {
  const [executionMode, setExecutionModeState] = useState<ExecutionMode>(initialMode);
  const smartEnabled = executionMode === "turbo";

  const persistExecutionMode = useCallback(
    (mode: ExecutionMode) => {
      void fetch(`/api/offices/${officeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_meta: { execution_mode: mode } }),
      }).catch(() => {});
    },
    [officeId],
  );

  const setExecutionMode = useCallback(
    (mode: ExecutionMode) => {
      setExecutionModeState(mode);
      persistExecutionMode(mode);
    },
    [persistExecutionMode],
  );

  const setSmartEnabled = useCallback(
    (enabled: boolean) => {
      if (enabled) {
        setExecutionMode("turbo");
        return;
      }
      setExecutionModeState((prev) => {
        if (prev === "turbo") {
          persistExecutionMode("fast");
          return "fast";
        }
        return prev;
      });
    },
    [persistExecutionMode, setExecutionMode],
  );

  const value = useMemo(
    () => ({
      executionMode,
      setExecutionMode,
      smartEnabled,
      setSmartEnabled,
    }),
    [executionMode, setExecutionMode, smartEnabled, setSmartEnabled],
  );

  return (
    <WorkspaceExecutionModeContext.Provider value={value}>
      {children}
    </WorkspaceExecutionModeContext.Provider>
  );
}

export function useWorkspaceExecutionMode(): WorkspaceExecutionModeContextValue {
  const ctx = useContext(WorkspaceExecutionModeContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceExecutionMode must be used within WorkspaceExecutionModeProvider",
    );
  }
  return ctx;
}
