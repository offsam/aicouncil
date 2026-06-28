import type { AgentDefinition } from "@/lib/agents";
import { cn } from "@/lib/utils";

const LOGO_STYLES: Record<string, string> = {
  claude: "from-amber-500/20 to-orange-600/10 text-amber-300",
  gpt: "from-emerald-500/20 to-teal-600/10 text-emerald-300",
  gemini: "from-blue-500/20 via-sky-500/15 to-rose-500/10 text-blue-300",
  deepseek: "from-blue-600/20 to-indigo-600/10 text-blue-300",
  grok: "from-zinc-300/15 to-zinc-500/10 text-zinc-200",
  mistral: "from-orange-500/20 to-red-500/10 text-orange-300",
  or_qwen: "from-cyan-500/20 to-teal-600/10 text-cyan-300",
  or_llama: "from-blue-500/20 to-indigo-600/10 text-blue-300",
  or_deepseek: "from-indigo-500/20 to-teal-600/10 text-indigo-300",
  or_gemma: "from-emerald-500/20 to-green-600/10 text-emerald-300",
  or_mistral: "from-orange-400/20 to-amber-600/10 text-orange-300",
};

export function AgentLogo({
  agent,
  size = "md",
}: {
  agent: AgentDefinition;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-14 w-14 text-lg",
  };

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl bg-gradient-to-br font-semibold ring-1 ring-white/10",
        sizes[size],
        LOGO_STYLES[agent.id] ?? "from-teal-500/20 to-teal-700/10 text-teal-300",
      )}
    >
      {agent.shortLabel}
    </div>
  );
}
