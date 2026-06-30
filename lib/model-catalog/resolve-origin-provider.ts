const ORIGIN_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  deepseek: "DeepSeek",
  groq: "Groq",
  qwen: "Qwen",
  "meta-llama": "Meta",
  meta: "Meta",
  mistralai: "Mistral",
  mistral: "Mistral",
  cohere: "Cohere",
  nvidia: "NVIDIA",
  perplexity: "Perplexity",
  amazon: "Amazon",
  microsoft: "Microsoft",
  xai: "xAI",
  moonshotai: "Moonshot",
  zhipu: "Zhipu",
  "z-ai": "Z.AI",
  minimax: "MiniMax",
  liquid: "Liquid",
  poolside: "Poolside",
  canopylabs: "Canopy Labs",
  alibaba: "Alibaba",
  sdaia: "SDAIA",
  openrouter: "OpenRouter",
};

export function formatCatalogGatewayLabel(gateway: string): string {
  const slug = normalizeOriginSlug(gateway);
  return ORIGIN_LABELS[slug] ?? titleCaseSlug(slug);
}

export function normalizeOriginSlug(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, "-");
}

export function resolveOriginFromModelId(
  modelId: string,
  gateway: string,
  ownedBy?: string | null,
): { slug: string; label: string } {
  const normalizedGateway = normalizeOriginSlug(gateway);
  const id = modelId.trim();

  if (id.includes("/")) {
    const prefix = normalizeOriginSlug(id.split("/")[0] ?? "");
    if (prefix && prefix !== "openrouter") {
      return { slug: prefix, label: ORIGIN_LABELS[prefix] ?? titleCaseSlug(prefix) };
    }
  }

  if (ownedBy) {
    const owned = normalizeOriginSlug(ownedBy);
    const mapped = mapOwnedByToOrigin(owned);
    if (mapped) return mapped;
  }

  const fromName = inferOriginFromName(id);
  if (fromName) return fromName;

  if (normalizedGateway !== "openrouter" && normalizedGateway !== "groq") {
    const slug = normalizedGateway;
    return { slug, label: ORIGIN_LABELS[slug] ?? titleCaseSlug(slug) };
  }

  return { slug: "unknown", label: "Unknown" };
}

function mapOwnedByToOrigin(owned: string): { slug: string; label: string } | null {
  const map: Record<string, string> = {
    "meta": "meta-llama",
    "alibaba cloud": "qwen",
    openai: "openai",
    "canopy labs": "canopylabs",
    sdaia: "sdaia",
    groq: "groq",
  };
  const slug = map[owned] ?? owned.replace(/\s+/g, "");
  if (!slug) return null;
  const normalized = normalizeOriginSlug(slug);
  return { slug: normalized, label: ORIGIN_LABELS[normalized] ?? titleCaseSlug(normalized) };
}

function inferOriginFromName(modelId: string): { slug: string; label: string } | null {
  const lower = modelId.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/^claude|anthropic/, "anthropic"],
    [/^gpt-|^chatgpt|^o[0-9]/, "openai"],
    [/^gemini|^imagen/, "google"],
    [/^deepseek/, "deepseek"],
    [/^llama|meta-llama/, "meta-llama"],
    [/^qwen/, "qwen"],
    [/^mistral|^codestral|^devstral/, "mistralai"],
    [/^command|^cohere/, "cohere"],
    [/^grok/, "xai"],
    [/^phi-/, "microsoft"],
  ];
  for (const [pattern, slug] of rules) {
    if (pattern.test(lower)) {
      return { slug, label: ORIGIN_LABELS[slug] ?? titleCaseSlug(slug) };
    }
  }
  return null;
}

function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function shortModelDisplayName(modelId: string, fallbackName?: string): string {
  if (fallbackName?.trim()) {
    return fallbackName.trim();
  }
  const tail = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
  return tail.replace(/^models\//, "");
}

export function buildCatalogKey(gateway: string, modelId: string): string {
  return `${normalizeOriginSlug(gateway)}:${modelId}`;
}
