"use client";

import { createContext, useContext } from "react";
import type { ConnectionDragFollowState } from "@/lib/workspace/connection-drag-follow";

const ConnectionDragFollowContext = createContext<ConnectionDragFollowState>(null);

export function ConnectionDragFollowProvider({
  value,
  children,
}: {
  value: ConnectionDragFollowState;
  children: React.ReactNode;
}) {
  return (
    <ConnectionDragFollowContext.Provider value={value}>
      {children}
    </ConnectionDragFollowContext.Provider>
  );
}

export function useConnectionDragFollow(): ConnectionDragFollowState {
  return useContext(ConnectionDragFollowContext);
}
