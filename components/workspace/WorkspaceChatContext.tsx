"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_MAYOR_CHAT_TARGET,
  type WorkspaceChatTarget,
} from "@/lib/workspace/workspace-chat-target";

type WorkspaceChatContextValue = {
  dockOpen: boolean;
  expanded: boolean;
  target: WorkspaceChatTarget;
  openDock: (target?: WorkspaceChatTarget) => void;
  closeDock: () => void;
  toggleDock: () => void;
  setExpanded: (value: boolean) => void;
  toggleExpanded: () => void;
  setTarget: (target: WorkspaceChatTarget) => void;
};

const WorkspaceChatContext = createContext<WorkspaceChatContextValue | null>(null);

export function WorkspaceChatProvider({ children }: { children: ReactNode }) {
  const [dockOpen, setDockOpen] = useState(false);
  const [expanded, setExpandedState] = useState(false);
  const [target, setTargetState] = useState<WorkspaceChatTarget>(DEFAULT_MAYOR_CHAT_TARGET);

  const openDock = useCallback((nextTarget?: WorkspaceChatTarget) => {
    setTargetState(nextTarget ?? DEFAULT_MAYOR_CHAT_TARGET);
    setDockOpen(true);
  }, []);

  const closeDock = useCallback(() => {
    setDockOpen(false);
    setExpandedState(false);
    setTargetState(DEFAULT_MAYOR_CHAT_TARGET);
  }, []);

  const toggleDock = useCallback(() => {
    setDockOpen((v) => {
      if (v) setExpandedState(false);
      return !v;
    });
  }, []);

  const setExpanded = useCallback((value: boolean) => {
    setExpandedState(value);
  }, []);

  const toggleExpanded = useCallback(() => {
    setExpandedState((v) => !v);
  }, []);

  const setTarget = useCallback((next: WorkspaceChatTarget) => {
    setTargetState(next);
  }, []);

  const value = useMemo(
    () => ({
      dockOpen,
      expanded,
      target,
      openDock,
      closeDock,
      toggleDock,
      setExpanded,
      toggleExpanded,
      setTarget,
    }),
    [
      dockOpen,
      expanded,
      target,
      openDock,
      closeDock,
      toggleDock,
      setExpanded,
      toggleExpanded,
      setTarget,
    ],
  );

  return (
    <WorkspaceChatContext.Provider value={value}>{children}</WorkspaceChatContext.Provider>
  );
}

export function useWorkspaceChat(): WorkspaceChatContextValue {
  const ctx = useContext(WorkspaceChatContext);
  if (!ctx) {
    throw new Error("useWorkspaceChat must be used within WorkspaceChatProvider");
  }
  return ctx;
}
