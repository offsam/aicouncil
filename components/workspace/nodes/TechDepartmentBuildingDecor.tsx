"use client";

function ServerRack({ side, live }: { side: "left" | "right"; live: boolean }) {
  return (
    <div className={`workspace-tech-dept-rack workspace-tech-dept-rack--${side}`} aria-hidden>
      {Array.from({ length: live ? 5 : 3 }, (_, i) => (
        <div
          key={i}
          className="workspace-tech-dept-rack-unit"
          style={live ? { animationDelay: `${i * 0.28}s` } : undefined}
        >
          <span className="workspace-tech-dept-rack-slot" />
          {live ? (
            <>
              <span className="workspace-tech-dept-rack-led workspace-tech-dept-rack-led--a" />
              <span className="workspace-tech-dept-rack-led workspace-tech-dept-rack-led--b" />
            </>
          ) : (
            <span className="workspace-tech-dept-rack-led workspace-tech-dept-rack-led--static" />
          )}
        </div>
      ))}
    </div>
  );
}

function StaticNocIcon() {
  return (
    <div className="workspace-tech-dept-static-icon" aria-hidden>
      <svg viewBox="0 0 64 64" className="workspace-tech-dept-static-svg">
        <rect x="8" y="14" width="48" height="36" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M16 42h32M20 26h24M20 34h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <circle cx="44" cy="22" r="3" fill="currentColor" opacity="0.7" />
      </svg>
    </div>
  );
}

type TechDepartmentBuildingDecorProps = {
  /** Animated NOC decor only when building is selected/active. */
  live?: boolean;
};

/** Decorative NOC layers — idle by default (static), live when selected. */
export function TechDepartmentBuildingDecor({ live = false }: TechDepartmentBuildingDecorProps) {
  if (!live) {
    return (
      <div className="workspace-tech-dept-decor workspace-tech-dept-decor--idle" aria-hidden>
        <StaticNocIcon />
      </div>
    );
  }

  return (
    <div className="workspace-tech-dept-decor workspace-tech-dept-decor--live" aria-hidden>
      <div className="workspace-tech-dept-antenna">
        <span className="workspace-tech-dept-antenna-mast" />
        <span className="workspace-tech-dept-antenna-dish" />
        <span className="workspace-tech-dept-antenna-pulse workspace-tech-dept-antenna-pulse--1" />
        <span className="workspace-tech-dept-antenna-pulse workspace-tech-dept-antenna-pulse--2" />
      </div>
      <div className="workspace-tech-dept-grid" />
      <div className="workspace-tech-dept-circuit">
        <svg viewBox="0 0 120 80" preserveAspectRatio="none" className="workspace-tech-dept-circuit-svg">
          <path d="M0 40 H28 M92 40 H120 M60 0 V18 M60 62 V80" />
          <path d="M28 40 L44 24 M28 40 L44 56 M92 40 L76 24 M92 40 L76 56" />
          <circle cx="60" cy="40" r="6" />
        </svg>
      </div>
      <ServerRack side="left" live />
      <ServerRack side="right" live />
      <div className="workspace-tech-dept-radar">
        <span className="workspace-tech-dept-radar-ring" />
        <span className="workspace-tech-dept-radar-sweep" />
        <span className="workspace-tech-dept-radar-blip workspace-tech-dept-radar-blip--a" />
        <span className="workspace-tech-dept-radar-blip workspace-tech-dept-radar-blip--b" />
      </div>
      <div className="workspace-tech-dept-fiber">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
