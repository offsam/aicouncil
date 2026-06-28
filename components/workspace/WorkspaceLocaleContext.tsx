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
import {
  WORKSPACE_LOCALE_STORAGE_KEY,
  WORKSPACE_MESSAGES,
  type WorkspaceLocale,
  type WorkspaceMessages,
} from "@/lib/workspace/i18n/messages";

type WorkspaceLocaleContextValue = {
  locale: WorkspaceLocale;
  t: WorkspaceMessages;
  setLocale: (locale: WorkspaceLocale) => void;
};

const WorkspaceLocaleContext = createContext<WorkspaceLocaleContextValue | null>(null);

function readStoredLocale(): WorkspaceLocale {
  if (typeof window === "undefined") return "ru";
  try {
    const raw = localStorage.getItem(WORKSPACE_LOCALE_STORAGE_KEY);
    return raw === "en" ? "en" : "ru";
  } catch {
    return "ru";
  }
}

export function WorkspaceLocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<WorkspaceLocale>("ru");

  useEffect(() => {
    setLocaleState(readStoredLocale());
  }, []);

  const setLocale = useCallback((next: WorkspaceLocale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(WORKSPACE_LOCALE_STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    (): WorkspaceLocaleContextValue => ({
      locale,
      t: WORKSPACE_MESSAGES[locale],
      setLocale,
    }),
    [locale, setLocale],
  );

  return (
    <WorkspaceLocaleContext.Provider value={value}>{children}</WorkspaceLocaleContext.Provider>
  );
}

export function useWorkspaceLocale(): WorkspaceLocaleContextValue {
  const ctx = useContext(WorkspaceLocaleContext);
  if (!ctx) {
    throw new Error("useWorkspaceLocale must be used within WorkspaceLocaleProvider");
  }
  return ctx;
}
