"use client";

import { useCallback, useEffect, useState } from "react";
import type { BuiltContext, ContextLayer } from "@/lib/office-types";
import { workspaceAgentContextUrl } from "@/lib/workspace/workspace-bff-paths";
import { useWorkspaceSelection } from "./WorkspaceSelectionContext";

function layerSourceLabel(layer: ContextLayer): string {
  switch (layer.entityType) {
    case "city":
      return "Inherited from City";
    case "building":
      return "Inherited from Building";
    case "chamber":
      return "Local Chamber";
    case "agent":
      return "Agent";
    default:
      return layer.entityName;
  }
}

type ContextPreviewSectionProps = {
  officeId: string;
  agentId: string;
  chamberRegistryId: string;
};

export function ContextPreviewSection({
  officeId,
  agentId,
  chamberRegistryId,
}: ContextPreviewSectionProps) {
  const { lastParticipationExecution } = useWorkspaceSelection();
  const [open, setOpen] = useState(false);
  const [contextData, setContextData] = useState<BuiltContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFullPrompt, setShowFullPrompt] = useState(false);

  const fromLastRun =
    lastParticipationExecution != null &&
    lastParticipationExecution.agentRegistryIds.includes(agentId);

  const effectiveChamberId = fromLastRun
    ? lastParticipationExecution.chamberRegistryId
    : chamberRegistryId;

  const loadContext = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(workspaceAgentContextUrl(officeId, agentId, effectiveChamberId));
      const data = (await res.json()) as BuiltContext & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load context");
      setContextData(data);
    } catch (err) {
      setContextData(null);
      setError(err instanceof Error ? err.message : "Failed to load context");
    } finally {
      setLoading(false);
    }
  }, [officeId, agentId, effectiveChamberId]);

  useEffect(() => {
    setOpen(false);
    setContextData(null);
    setShowFullPrompt(false);
    setError(null);
  }, [agentId, effectiveChamberId]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && !contextData && !loading) {
      void loadContext();
    }
  }

  return (
    <section
      className="workspace-inspector-section border-b border-stone-800"
      data-testid="workspace-context-preview"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-stone-400 hover:bg-stone-800/50"
        onClick={toggleOpen}
        aria-expanded={open}
      >
        <span>Context Preview</span>
        <span aria-hidden>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-3">
          {fromLastRun && (
            <p
              className="text-xs text-amber-400/90"
              data-testid="workspace-context-preview-last-run"
            >
              From last {lastParticipationExecution.mode} run · chamber pinned ·{" "}
              {lastParticipationExecution.taskText.slice(0, 60)}
              {lastParticipationExecution.taskText.length > 60 ? "…" : ""}
            </p>
          )}
          {loading && <p className="text-xs text-stone-500">Loading context…</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
          {contextData && (
            <>
              <div className="space-y-2">
                {contextData.layers.length === 0 && (
                  <p className="text-xs text-stone-500">No context layers.</p>
                )}
                {contextData.layers.map((layer) => (
                  <div
                    key={layer.entityRegistryId}
                    className="rounded border border-stone-800 bg-stone-950/60 p-2"
                    data-testid={`workspace-context-layer-${layer.entityType}`}
                  >
                    <div className="text-xs font-medium text-amber-400/90">
                      {layerSourceLabel(layer)} · {layer.entityName}
                    </div>
                    <div className="mt-1 space-y-0.5 text-xs text-stone-400">
                      <p>Rules: {layer.rules.filter((r) => !r.includes("[+ еще")).length}</p>
                      <p>Knowledge: {layer.knowledge.length}</p>
                      {layer.knowledge.length > 0 && (
                        <ul className="mt-1 space-y-0.5 pl-2 text-stone-500">
                          {layer.knowledge.slice(0, 5).map((k) => (
                            <li key={k.id} className="truncate">
                              {k.title}
                            </li>
                          ))}
                          {layer.knowledge.length > 5 && (
                            <li>+{layer.knowledge.length - 5} more</li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-dashed border-stone-800 pt-2 text-xs">
                <span className="text-stone-500">Estimated tokens</span>
                <span
                  className="font-mono text-emerald-500/90"
                  data-testid="workspace-context-token-estimate"
                >
                  {contextData.tokenEstimate}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowFullPrompt((v) => !v)}
                className="w-full rounded border border-stone-700 py-1 text-[10px] font-semibold text-stone-400 hover:bg-stone-800/60"
              >
                {showFullPrompt ? "Hide full prompt" : "Show full prompt"}
              </button>
              {showFullPrompt && (
                <pre
                  className="max-h-40 overflow-y-auto rounded border border-stone-800 bg-stone-950 p-2 text-[10px] text-stone-300"
                  data-testid="workspace-context-full-prompt"
                >
                  {contextData.flattenedPrompt || "[empty]"}
                </pre>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
