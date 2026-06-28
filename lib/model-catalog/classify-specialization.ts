import type {
  ExcludedSpecialization,
  ModelSpecialization,
} from "./types";

const SPECIALIZATION_PRIORITY: ModelSpecialization[] = [
  "code",
  "analysis",
  "image",
  "video",
  "audio",
  "text",
  "general",
];

type ClassifyInput = {
  modelId: string;
  name?: string;
  modality?: string | null;
  inputModalities?: string[] | null;
  outputModalities?: string[] | null;
  supportedMethods?: string[] | null;
};

export function classifyModelSpecializations(
  input: ClassifyInput,
): ModelSpecialization[] | ExcludedSpecialization[] {
  if (isExcludedModel(input)) {
    return ["excluded"];
  }

  const tags = new Set<ModelSpecialization>();
  applyStaticRules(input.modelId, input.name, tags);
  applyModalityRules(input, tags);

  if (tags.size === 0) {
    tags.add("general");
  }

  return [...tags];
}

export function pickPrimarySpecialization(
  specializations: ModelSpecialization[],
): ModelSpecialization {
  for (const id of SPECIALIZATION_PRIORITY) {
    if (specializations.includes(id)) return id;
  }
  return "general";
}

function isExcludedModel(input: ClassifyInput): boolean {
  const hay = `${input.modelId} ${input.name ?? ""}`.toLowerCase();
  return (
    /\b(embed|embedding|rerank|moderation|moderated|prompt-guard|guard|safeguard|classifier|similarity|aqa)\b/.test(
      hay,
    ) ||
    /^text-embedding|^davinci-002|^babbage|^tts-|^dall-e-2|^whisper-/.test(
      input.modelId.toLowerCase(),
    )
  );
}

function applyStaticRules(modelId: string, name: string | undefined, tags: Set<ModelSpecialization>) {
  const hay = `${modelId} ${name ?? ""}`.toLowerCase();

  if (
    /\b(code|coder|codestral|devstral|starcoder|deepseek-coder|qwen.*coder|gpt-oss|code-interpreter)\b/.test(
      hay,
    )
  ) {
    tags.add("code");
  }

  if (
    /\b(r1|reasoning|think|thinking|o[13456789]|opus|research|math|logic|nemotron.*reason)\b/.test(
      hay,
    )
  ) {
    tags.add("analysis");
  }

  if (
    /\b(dall-e|flux|stable-diffusion|imagen|image-gen|image-preview|gpt-image|midjourney|photoreal|vision-pro|gemini.*image)\b/.test(
      hay,
    ) &&
    !/\bvision\b.*\btext\b/.test(hay)
  ) {
    tags.add("image");
  }

  if (/\b(video|veo|kling|runway|luma|seedance|sora)\b/.test(hay)) {
    tags.add("video");
  }

  if (/\b(whisper|tts|speech|audio|orpheus|voice|transcribe)\b/.test(hay)) {
    tags.add("audio");
  }

  if (
    /\b(instruct|chat|turbo|sonnet|haiku|llama|qwen|gemini|mistral|gpt|claude|deepseek|grok)\b/.test(
      hay,
    ) &&
    !tags.has("code") &&
    !tags.has("analysis") &&
    !tags.has("image") &&
    !tags.has("video") &&
    !tags.has("audio")
  ) {
    tags.add("text");
  }
}

function applyModalityRules(input: ClassifyInput, tags: Set<ModelSpecialization>) {
  const modality = (input.modality ?? "").toLowerCase();
  const outputs = (input.outputModalities ?? []).map((v) => v.toLowerCase());
  const inputs = (input.inputModalities ?? []).map((v) => v.toLowerCase());
  const methods = (input.supportedMethods ?? []).map((v) => v.toLowerCase());

  if (modality.includes("->image") || outputs.includes("image")) {
    tags.add("image");
  }
  if (modality.includes("->video") || outputs.includes("video")) {
    tags.add("video");
  }
  if (modality.includes("->audio") || outputs.includes("audio")) {
    tags.add("audio");
  }
  if (
    methods.some((m) => m.includes("embed")) ||
    modality.includes("embed")
  ) {
    return;
  }

  const textOut =
    outputs.includes("text") ||
    modality.includes("->text") ||
    methods.includes("generatecontent");

  if (textOut && (tags.has("code") || modality.includes("text"))) {
    if (!tags.has("code") && !tags.has("analysis")) {
      tags.add("text");
    }
  }

  if (inputs.includes("image") && textOut && !tags.has("image")) {
    tags.add("analysis");
  }
}

export function agentCategoryFromSpecialization(
  primary: ModelSpecialization,
): string {
  if (primary === "image") return "photo";
  if (primary === "video") return "video";
  if (primary === "audio") return "text";
  return primary;
}
