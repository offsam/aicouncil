"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type WorkspaceAppearanceMode = "auto" | "day" | "night";
export type WorkspaceAppearanceTheme = "day" | "night";

type WorkspaceAppearanceContextValue = {
  mode: WorkspaceAppearanceMode;
  effectiveTheme: WorkspaceAppearanceTheme;
  setMode: (mode: WorkspaceAppearanceMode) => void;
};

const STORAGE_KEY = "workspace-appearance-mode";

const WorkspaceAppearanceContext =
  createContext<WorkspaceAppearanceContextValue | null>(null);

function resolveTheme(mode: WorkspaceAppearanceMode): WorkspaceAppearanceTheme {
  if (mode === "day" || mode === "night") return mode;
  const hour = new Date().getHours();
  return hour >= 7 && hour < 19 ? "day" : "night";
}

export function WorkspaceAppearanceProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<WorkspaceAppearanceMode>("auto");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "auto" || stored === "day" || stored === "night") {
      setModeState(stored);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const effectiveTheme = resolveTheme(mode);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.workspaceTheme = effectiveTheme;
    root.style.colorScheme = effectiveTheme === "day" ? "light" : "dark";
  }, [effectiveTheme]);

  const setMode = useCallback((nextMode: WorkspaceAppearanceMode) => {
    setModeState(nextMode);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      effectiveTheme,
      setMode,
    }),
    [mode, effectiveTheme, setMode],
  );

  return (
    <WorkspaceAppearanceContext.Provider value={value}>
      {children}
    </WorkspaceAppearanceContext.Provider>
  );
}

export function useWorkspaceAppearance(): WorkspaceAppearanceContextValue {
  const ctx = useContext(WorkspaceAppearanceContext);
  if (!ctx) {
    throw new Error("useWorkspaceAppearance must be used within WorkspaceAppearanceProvider");
  }
  return ctx;
}
