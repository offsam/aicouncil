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
  /** Smart mode (UI); backend still uses turbo flag for premium agent selection. */
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
  const [smartEnabled, setSmartEnabledState] = useState(false);

  const setSmartEnabled = useCallback((enabled: boolean) => {
    setSmartEnabledState(enabled);
  }, []);

  const setExecutionMode = useCallback(
    (mode: ExecutionMode) => {
      setExecutionModeState(mode);
      void fetch(`/api/offices/${officeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_meta: { execution_mode: mode } }),
      }).catch(() => {});
    },
    [officeId],
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
