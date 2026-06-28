import { resolveOriginFromModelId } from "@/lib/model-catalog/resolve-origin-provider";

export type AgentIconId =
  | "bot"
  | "bot-message"
  | "cpu"
  | "brain"
  | "ghost"
  | "scan"
  | "spark"
  | "anthropic"
  | "deepseek"
  | "google"
  | "meta"
  | "mistral"
  | "openrouter"
  | "qwen"
  | "nvidia";

const AGENT_ICON_IDS = new Set<string>([
  "bot",
  "bot-message",
  "cpu",
  "brain",
  "ghost",
  "scan",
  "spark",
  "anthropic",
  "deepseek",
  "google",
  "meta",
  "mistral",
  "openrouter",
  "qwen",
  "nvidia",
]);

const ORIGIN_TO_ICON: Record<string, AgentIconId> = {
  anthropic: "anthropic",
  openai: "spark",
  google: "google",
  deepseek: "deepseek",
  meta: "meta",
  "meta-llama": "meta",
  mistral: "mistral",
  mistralai: "mistral",
  qwen: "qwen",
  nvidia: "nvidia",
  cohere: "brain",
  xai: "ghost",
  groq: "cpu",
};

const PROVIDER_TO_ICON: Record<string, AgentIconId> = {
  anthropic: "anthropic",
  claude: "anthropic",
  deepseek: "deepseek",
  google: "google",
  gemini: "google",
  meta: "meta",
  mistral: "mistral",
  mistralai: "mistral",
  openrouter: "openrouter",
  openai: "spark",
  groq: "cpu",
  qwen: "qwen",
  nvidia: "nvidia",
};

export function isAgentIconId(value: string | null | undefined): value is AgentIconId {
  return Boolean(value && AGENT_ICON_IDS.has(value));
}

export function normalizeProvider(provider: string): string {
  return provider.trim().toLowerCase();
}

export function defaultAgentIconId(provider: string): AgentIconId {
  return PROVIDER_TO_ICON[normalizeProvider(provider)] ?? "bot";
}

export function originProviderToIconId(originSlug: string): AgentIconId {
  const slug = originSlug.trim().toLowerCase();
  return ORIGIN_TO_ICON[slug] ?? "bot";
}

/** Same icon logic as catalog picker → canvas (origin first, then gateway). */
export function resolveAgentIconForDisplay(args: {
  color?: string | null;
  provider: string;
  modelId?: string | null;
}): AgentIconId {
  if (isAgentIconId(args.color)) {
    return args.color;
  }

  if (args.modelId?.trim()) {
    const origin = resolveOriginFromModelId(args.modelId, args.provider);
    const fromOrigin = originProviderToIconId(origin.slug);
    if (fromOrigin !== "bot") {
      return fromOrigin;
    }
  }

  return defaultAgentIconId(args.provider);
}

export function resolveAgentIconId(
  explicitIconId: string | null | undefined,
  provider: string,
  modelId?: string | null,
): AgentIconId {
  return resolveAgentIconForDisplay({
    color: explicitIconId,
    provider,
    modelId,
  });
}

export function catalogOriginToAgentIcon(originProviderSlug: string): AgentIconId {
  return originProviderToIconId(originProviderSlug);
}
