export interface EmbeddingProvider {
  model: string;
  dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

export const DEFAULT_EMBED_BATCH_SIZE = 50;

const MODEL = "text-embedding-3-small";
const DIMENSION = 1536;

export function createOpenAIEmbeddingProvider(): EmbeddingProvider {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY missing");
  }

  async function embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    let delayMs = 1000;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const response = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          input: texts,
          dimensions: DIMENSION,
        }),
      });

      if (response.status === 429 && attempt < 5) {
        await sleep(delayMs);
        delayMs *= 2;
        continue;
      }

      const bodyText = await response.text();
      let body: {
        data?: Array<{ embedding?: number[]; index?: number }>;
        error?: { message?: string };
      } = {};
      try {
        body = JSON.parse(bodyText) as typeof body;
      } catch {
        /* ignore */
      }

      if (!response.ok) {
        const message = body.error?.message?.trim() || bodyText.slice(0, 200) || response.statusText;
        throw new Error(`OpenAI embeddings API error (${response.status}): ${message}`);
      }

      const rows = body.data ?? [];
      if (rows.length !== texts.length) {
        throw new Error(
          `OpenAI embeddings API returned ${rows.length} vectors for ${texts.length} inputs`,
        );
      }

      return rows
        .slice()
        .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
        .map((row) => {
          const vector = row.embedding;
          if (!vector || vector.length !== DIMENSION) {
            throw new Error("OpenAI embeddings API returned invalid vector dimension");
          }
          return vector;
        });
    }

    throw new Error("OpenAI embeddings API rate limit exceeded after 5 attempts");
  }

  return { model: MODEL, dimension: DIMENSION, embed };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
