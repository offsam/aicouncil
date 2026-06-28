import Link from "next/link";

type CityViewModeToggleProps = {
  /** Current view — button navigates to the opposite mode. */
  current: "2d" | "3d";
  className?: string;
};

const TARGET = {
  "2d": { href: "/floor", label: "3D", testId: "city-view-toggle-3d" },
  "3d": { href: "/workspace", label: "2D", testId: "city-view-toggle-2d" },
} as const;

export function CityViewModeToggle({ current, className }: CityViewModeToggleProps) {
  if (current === "2d") {
    return null;
  }
  const { href, label, testId } = TARGET[current];

  return (
    <Link
      href={href}
      data-testid={testId}
      title="Открыть 2D-редактор"
      className={
        className ??
        "rounded-lg border border-[var(--ws-panel-border)] bg-[var(--ws-panel-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--ws-text-secondary)] transition hover:bg-white/5 hover:text-[var(--ws-text-main)]"
      }
    >
      {label}
    </Link>
  );
}
