"use client";

import { useEffect, useId, useState } from "react";

type WorkspaceEntityCreateSheetProps = {
  open: boolean;
  testId?: string;
  title: string;
  subtitle: string;
  nameLabel: string;
  descriptionLabel: string;
  namePlaceholder: string;
  descriptionPlaceholder: string;
  submitLabel: string;
  creating: boolean;
  requireDescription?: boolean;
  initialName?: string;
  initialRoutingDescription?: string;
  onCancel: () => void;
  onSubmit: (payload: { name: string; routingDescription: string }) => void;
};

export function WorkspaceEntityCreateSheet({
  open,
  testId = "workspace-entity-create-sheet",
  title,
  subtitle,
  nameLabel,
  descriptionLabel,
  namePlaceholder,
  descriptionPlaceholder,
  submitLabel,
  creating,
  requireDescription = false,
  initialName,
  initialRoutingDescription,
  onCancel,
  onSubmit,
}: WorkspaceEntityCreateSheetProps) {
  const titleId = useId();
  const [name, setName] = useState("");
  const [routingDescription, setRoutingDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initialName ?? "");
    setRoutingDescription(initialRoutingDescription ?? "");
  }, [open, initialName, initialRoutingDescription]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  const trimmedName = name.trim();
  const trimmedDescription = routingDescription.trim();
  const canSubmit = Boolean(
    trimmedName && (!requireDescription || trimmedDescription) && !creating,
  );

  return (
    <div
      className="workspace-bubble-overlay workspace-shell"
      data-testid={`${testId}-backdrop`}
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className="workspace-bubble-sheet workspace-bubble-sheet--form"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="workspace-bubble-sheet__header">
          <div>
            <h3 id={titleId} className="workspace-bubble-sheet__title">
              {title}
            </h3>
            <p className="workspace-bubble-sheet__subtitle">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="workspace-bubble-sheet__close"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <form
          className="workspace-bubble-sheet__body workspace-inspector-stack"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            onSubmit({ name: trimmedName, routingDescription: trimmedDescription });
          }}
        >
          <label className="block">
            <span className="workspace-inspector-label mb-1.5">{nameLabel}</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={namePlaceholder}
              className="workspace-bubble-input"
              data-testid={`${testId}-name`}
            />
          </label>

          <label className="block">
            <span className="workspace-inspector-label mb-1.5">{descriptionLabel}</span>
            <textarea
              value={routingDescription}
              onChange={(e) => setRoutingDescription(e.target.value)}
              placeholder={descriptionPlaceholder}
              rows={4}
              className="workspace-bubble-textarea"
              data-testid={`${testId}-description`}
            />
          </label>

          <div className="workspace-bubble-actions">
            <button
              type="button"
              onClick={onCancel}
              disabled={creating}
              className="workspace-bubble-btn workspace-bubble-btn--ghost"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              data-testid={`${testId}-submit`}
              className="workspace-bubble-btn workspace-bubble-btn--primary"
            >
              {creating ? "…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
