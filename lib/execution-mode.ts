export type ExecutionMode = "fast" | "team" | "council";

export const EXECUTION_MODES: ExecutionMode[] = ["fast", "team", "council"];

export function isExecutionMode(value: unknown): value is ExecutionMode {
  return value === "fast" || value === "team" || value === "council";
}

export type ExecutionModeOption = {
  id: ExecutionMode;
  label: string;
  hint: string;
  estimate: string;
  disabledReason?: string;
};

export const EXECUTION_MODE_OPTIONS: ExecutionModeOption[] = [
  {
    id: "fast",
    label: "Fast",
    hint: "Quick answer",
    estimate: "Fast · ~5 сек · экономичный режим",
  },
  {
    id: "team",
    label: "Team",
    hint: "Several experts",
    estimate: "Team · ~15 сек · несколько экспертов",
  },
  {
    id: "council",
    label: "Council",
    hint: "Full council report",
    estimate: "Council · ~45 сек · премиум · потребует подтверждения",
  },
];
