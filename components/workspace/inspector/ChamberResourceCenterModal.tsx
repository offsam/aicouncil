"use client";

import { useEffect, useId, type ReactNode } from "react";

type ChamberResourceCenterModalProps = {
  open: boolean;
  testId: string;
  title: string;
  subtitle?: string;
  wide?: boolean;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
};

export function ChamberResourceCenterModal({
  open,
  testId,
  title,
  subtitle,
  wide = false,
  onClose,
  footer,
  children,
}: ChamberResourceCenterModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="workspace-bubble-overlay workspace-shell"
      data-testid={`${testId}-backdrop`}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className={`workspace-bubble-sheet workspace-bubble-sheet--resource${
          wide ? " workspace-bubble-sheet--wide" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="workspace-bubble-sheet__header">
          <div className="min-w-0">
            <h3 id={titleId} className="workspace-bubble-sheet__title">
              {title}
            </h3>
            {subtitle ? (
              <p className="workspace-bubble-sheet__subtitle">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="workspace-bubble-sheet__close"
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>

        <div className="workspace-bubble-sheet__body workspace-chamber-resource-modal__body">
          {children}
        </div>

        {footer ? (
          <div className="workspace-chamber-resource-modal__footer">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
