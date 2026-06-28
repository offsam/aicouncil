"use client";

import type { ComponentType } from "react";
import {
  Bot,
  BotMessageSquare,
  BrainCircuit,
  Cpu,
  Ghost,
  ScanSearch,
  Sparkles,
} from "lucide-react";
import type { SimpleIcon } from "simple-icons";
import {
  siAnthropic,
  siDeepseek,
  siGoogle,
  siMeta,
  siMistralai,
  siNvidia,
  siOpenrouter,
  siQwen,
} from "simple-icons";
import {
  defaultAgentIconId,
  isAgentIconId,
  originProviderToIconId,
  resolveAgentIconId,
  type AgentIconId,
} from "@/lib/agent-icon-ids";

export type { AgentIconId };
export {
  defaultAgentIconId,
  isAgentIconId,
  originProviderToIconId,
  resolveAgentIconId,
};

type LucideIconComponent = ComponentType<{ className?: string; strokeWidth?: number }>;

type LucideAgentIconOption = {
  id: AgentIconId;
  label: string;
  kind: "lucide";
  icon: LucideIconComponent;
  color?: string;
};

type SimpleAgentIconOption = {
  id: AgentIconId;
  label: string;
  kind: "simple";
  icon: SimpleIcon;
  color: string;
};

export type AgentIconOption = LucideAgentIconOption | SimpleAgentIconOption;

export const AGENT_ICON_OPTIONS: AgentIconOption[] = [
  { id: "bot", label: "Bot", kind: "lucide", icon: Bot, color: "currentColor" },
  { id: "bot-message", label: "Bot chat", kind: "lucide", icon: BotMessageSquare, color: "currentColor" },
  { id: "cpu", label: "CPU", kind: "lucide", icon: Cpu, color: "currentColor" },
  { id: "brain", label: "Brain", kind: "lucide", icon: BrainCircuit, color: "currentColor" },
  { id: "ghost", label: "Ghost", kind: "lucide", icon: Ghost, color: "currentColor" },
  { id: "scan", label: "Scan", kind: "lucide", icon: ScanSearch, color: "currentColor" },
  { id: "spark", label: "Sparkles", kind: "lucide", icon: Sparkles, color: "currentColor" },
  { id: "anthropic", label: "Anthropic", kind: "simple", icon: siAnthropic, color: `#${siAnthropic.hex}` },
  { id: "deepseek", label: "DeepSeek", kind: "simple", icon: siDeepseek, color: `#${siDeepseek.hex}` },
  { id: "google", label: "Google", kind: "simple", icon: siGoogle, color: `#${siGoogle.hex}` },
  { id: "meta", label: "Meta", kind: "simple", icon: siMeta, color: `#${siMeta.hex}` },
  { id: "mistral", label: "Mistral", kind: "simple", icon: siMistralai, color: `#${siMistralai.hex}` },
  { id: "openrouter", label: "OpenRouter", kind: "simple", icon: siOpenrouter, color: `#${siOpenrouter.hex}` },
  { id: "qwen", label: "Qwen", kind: "simple", icon: siQwen, color: `#${siQwen.hex}` },
  { id: "nvidia", label: "NVIDIA", kind: "simple", icon: siNvidia, color: `#${siNvidia.hex}` },
];

export function getAgentIconOption(iconId: string | null | undefined): AgentIconOption {
  return AGENT_ICON_OPTIONS.find((option) => option.id === iconId) ?? AGENT_ICON_OPTIONS[0];
}
