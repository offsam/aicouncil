"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { ExecutionMode } from "@/lib/execution-mode";

type WorkspaceExecutionModeContextValue = {
  executionMode: ExecutionMode;
  setExecutionMode: (mode: ExecutionMode) => void;
};

const WorkspaceExecutionModeContext =
  createContext<WorkspaceExecutionModeContextValue | null>(null);

export function WorkspaceExecutionModeProvider({ children }: { children: ReactNode }) {
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("fast");

  const value = useMemo(
    () => ({
      executionMode,
      setExecutionMode,
    }),
    [executionMode],
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
