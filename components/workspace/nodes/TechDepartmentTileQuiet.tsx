"use client";

/** Static NOC tile — no polling, no live counters on canvas. */
export function TechDepartmentTileQuiet() {
  return (
    <div
      className="workspace-tech-dept-quiet nodrag nopan"
      data-testid="workspace-tech-dept-tile"
      title="Откройте Inspector для мониторинга"
    >
      <svg
        className="workspace-tech-dept-quiet-icon"
        viewBox="0 0 32 32"
        aria-hidden
        focusable="false"
      >
        <rect x="4" y="6" width="24" height="18" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 22h16M12 12h8M12 16h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="24" cy="10" r="2" fill="currentColor" opacity="0.85" />
      </svg>
      <span className="workspace-tech-dept-quiet-label">NOC</span>
      <span className="workspace-tech-dept-quiet-hint">Inspector → мониторинг</span>
    </div>
  );
}
