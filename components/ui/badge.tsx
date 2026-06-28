import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "muted";
}

export function Badge({
  className,
  variant = "default",
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
        variant === "default" &&
          "bg-teal-500/18 text-teal-800 ring-1 ring-teal-500/30 dark:text-teal-200 dark:ring-teal-400/25",
        variant === "success" &&
          "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300 dark:ring-emerald-500/20",
        variant === "warning" &&
          "bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/25 dark:text-amber-300 dark:ring-amber-500/20",
        variant === "muted" &&
          "bg-zinc-500/10 text-zinc-600 ring-1 ring-zinc-500/20 dark:bg-white/5 dark:text-zinc-500 dark:ring-white/10",
        className,
      )}
      {...props}
    />
  );
}
