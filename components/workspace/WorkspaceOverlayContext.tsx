"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type { Edge, Node } from "@xyflow/react";

type SetNodes = (payload: Node[] | ((nodes: Node[]) => Node[])) => void;
type SetEdges = (payload: Edge[] | ((edges: Edge[]) => Edge[])) => void;

type WorkspaceOverlayContextValue = {
  overlayCount: number;
  pushOverlay: (ownerId: string) => void;
  popOverlay: (ownerId: string) => void;
};

const WorkspaceOverlayContext = createContext<WorkspaceOverlayContextValue | null>(null);

const OVERLAY_FRONT = "workspace-overlay-front";
const OVERLAY_BACK = "workspace-overlay-back";

function stripOverlayClasses(className?: string): string | undefined {
  if (!className) return undefined;
  const next = className
    .replace(/\bworkspace-overlay-front\b/g, "")
    .replace(/\bworkspace-overlay-back\b/g, "")
    .trim();
  return next || undefined;
}

function withOverlayClass(existing: string | undefined, role: "front" | "back" | null): string | undefined {
  const base = stripOverlayClasses(existing);
  if (!role) return base;
  const tag = role === "front" ? OVERLAY_FRONT : OVERLAY_BACK;
  return base ? `${base} ${tag}` : tag;
}

function isEdgeOwner(ownerId: string): boolean {
  return ownerId.startsWith("connection-");
}

export function useWorkspaceOverlayLayer(ownerId: string | undefined, active: boolean) {
  const ctx = useContext(WorkspaceOverlayContext);

  useEffect(() => {
    if (!ctx || !ownerId || !active) return;
    ctx.pushOverlay(ownerId);
    return () => ctx.popOverlay(ownerId);
  }, [ctx, ownerId, active]);
}

export function WorkspaceOverlayProvider({
  nodesRef,
  setNodes,
  setEdges,
  onStackChange,
  children,
}: {
  nodesRef: RefObject<Node[]>;
  setNodes: SetNodes;
  setEdges: SetEdges;
  onStackChange?: (count: number) => void;
  children: ReactNode;
}) {
  const stackRef = useRef<string[]>([]);
  const [overlayCount, setOverlayCount] = useState(0);

  const resolveRootNodeId = useCallback(
    (ownerId: string): string => {
      if (isEdgeOwner(ownerId)) return ownerId;
      const nodes = nodesRef.current;
      let id = ownerId;
      let node = nodes.find((n) => n.id === id);
      while (node?.parentId) {
        id = node.parentId;
        node = nodes.find((n) => n.id === id);
      }
      return id;
    },
    [nodesRef],
  );

  const applyStack = useCallback(() => {
    const stack = stackRef.current;
    const top = stack[stack.length - 1];
    const active = stack.length > 0;
    setOverlayCount(stack.length);
    onStackChange?.(stack.length);

    const frontNodeId =
      top && !isEdgeOwner(top) ? resolveRootNodeId(top) : null;
    const frontEdgeId = top && isEdgeOwner(top) ? top : null;

    setNodes((nds) =>
      nds.map((n) => {
        if (!active) {
          return { ...n, className: stripOverlayClasses(n.className) };
        }
        const role =
          frontNodeId && n.id === frontNodeId
            ? "front"
            : "back";
        return {
          ...n,
          className: withOverlayClass(n.className, role),
        };
      }),
    );

    setEdges((eds) =>
      eds.map((e) => {
        if (!active) {
          return { ...e, className: stripOverlayClasses(e.className) };
        }
        const role = frontEdgeId && e.id === frontEdgeId ? "front" : "back";
        return {
          ...e,
          className: withOverlayClass(e.className, role),
        };
      }),
    );
  }, [onStackChange, resolveRootNodeId, setEdges, setNodes]);

  const pushOverlay = useCallback(
    (ownerId: string) => {
      stackRef.current = stackRef.current.filter((id) => id !== ownerId).concat(ownerId);
      applyStack();
    },
    [applyStack],
  );

  const popOverlay = useCallback(
    (ownerId: string) => {
      stackRef.current = stackRef.current.filter((id) => id !== ownerId);
      applyStack();
    },
    [applyStack],
  );

  const value = useMemo(
    () => ({
      overlayCount,
      pushOverlay,
      popOverlay,
    }),
    [overlayCount, pushOverlay, popOverlay],
  );

  return (
    <WorkspaceOverlayContext.Provider value={value}>{children}</WorkspaceOverlayContext.Provider>
  );
}

export function useWorkspaceOverlay() {
  return useContext(WorkspaceOverlayContext);
}
