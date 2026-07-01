import pg from "pg";
import { DEFAULT_EMBED_BATCH_SIZE, type EmbeddingProvider } from "./embedding-provider";
import { getSupabaseAdmin } from "../supabase/admin";

export type EmbedResult = {
  status: "completed" | "failed";
  chunksEmbedded: number;
  chunksSkipped: number;
  batchFailures: number;
  durationMs: number;
  error?: string;
};

type PendingChunk = {
  id: string;
  chunk_text: string;
};

function vectorToPgLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

async function withPgClient<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const pwd =
    process.env.SUPABASE_DB_PASSWORD?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const ref = url?.match(/https:\/\/([^.]+)/)?.[1];
  if (!ref || !pwd) {
    throw new Error("Database credentials missing for embedding pipeline");
  }

  const client = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(pwd)}@db.${ref}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function loadPendingChunks(repositoryId: string): Promise<{
  pending: PendingChunk[];
  skipped: number;
  total: number;
}> {
  return withPgClient(async (client) => {
    const totalResult = await client.query<{ count: string }>(
      `
        SELECT COUNT(*)::text AS count
        FROM github_chunks c
        JOIN github_files f ON f.id = c.file_id
        WHERE f.repository_id = $1
      `,
      [repositoryId],
    );
    const total = Number(totalResult.rows[0]?.count ?? 0);

    const pendingResult = await client.query<PendingChunk>(
      `
        SELECT c.id, c.chunk_text
        FROM github_chunks c
        JOIN github_files f ON f.id = c.file_id
        WHERE f.repository_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM github_embeddings e WHERE e.chunk_id = c.id
        )
      `,
      [repositoryId],
    );

    const pending = pendingResult.rows;
    return {
      pending,
      skipped: total - pending.length,
      total,
    };
  });
}

export async function resolveRepositoryId(params: {
  owner: string;
  repo: string;
  branch: string;
}): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("github_repositories")
    .select("id")
    .eq("owner", params.owner)
    .eq("repo", params.repo)
    .eq("branch", params.branch)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve github_repositories id: ${error.message}`);
  }

  return (data?.id as string | undefined) ?? null;
}

export async function embedChunks(params: {
  repositoryId: string;
  provider: EmbeddingProvider;
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
}): Promise<EmbedResult> {
  const startTime = Date.now();
  const batchSize = params.batchSize ?? DEFAULT_EMBED_BATCH_SIZE;
  let chunksEmbedded = 0;
  let batchFailures = 0;
  let successfulBatches = 0;

  try {
    const { pending, skipped, total } = await loadPendingChunks(params.repositoryId);
    console.log("[embed] chunks found:", pending.length);
    console.log("[embed] chunks already embedded (skipped):", skipped);

    if (pending.length === 0) {
      const durationMs = Date.now() - startTime;
      console.log("[embed] completed:", {
        chunksEmbedded: 0,
        chunksSkipped: skipped,
        batchFailures: 0,
        durationMs,
      });
      return {
        status: "completed",
        chunksEmbedded: 0,
        chunksSkipped: skipped,
        batchFailures: 0,
        durationMs,
      };
    }

    const supabase = getSupabaseAdmin();
    const totalBatches = Math.ceil(pending.length / batchSize);
    let done = skipped;

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batch = pending.slice(batchIndex * batchSize, (batchIndex + 1) * batchSize);
      try {
        const vectors = await params.provider.embed(batch.map((chunk) => chunk.chunk_text));

        await withPgClient(async (client) => {
          for (let i = 0; i < batch.length; i++) {
            await client.query(
              `
                INSERT INTO github_embeddings (chunk_id, embedding)
                VALUES ($1, $2::vector)
                ON CONFLICT (chunk_id) DO NOTHING
              `,
              [batch[i].id, vectorToPgLiteral(vectors[i])],
            );
          }
        });

        const chunkIds = batch.map((chunk) => chunk.id);
        const { error: updateError } = await supabase
          .from("github_chunks")
          .update({
            embedding_model: params.provider.model,
            embedding_dimension: params.provider.dimension,
          })
          .in("id", chunkIds);

        if (updateError) {
          throw new Error(updateError.message);
        }

        chunksEmbedded += batch.length;
        successfulBatches += 1;
        done += batch.length;
        console.log("[embed] batch progress:", `${done}/${total}`);
        params.onProgress?.(done, total);
      } catch (err) {
        batchFailures += 1;
        const error = err instanceof Error ? err.message : String(err);
        console.error("[embed] batch failure:", { batchIndex, error });
      }
    }

    const durationMs = Date.now() - startTime;
    const status = successfulBatches === 0 ? "failed" : "completed";
    const result: EmbedResult = {
      status,
      chunksEmbedded,
      chunksSkipped: skipped,
      batchFailures,
      durationMs,
      ...(status === "failed"
        ? { error: "All embedding batches failed" }
        : {}),
    };

    console.log("[embed] completed:", {
      chunksEmbedded: result.chunksEmbedded,
      chunksSkipped: result.chunksSkipped,
      batchFailures: result.batchFailures,
      durationMs: result.durationMs,
    });

    return result;
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const error = err instanceof Error ? err.message : String(err);
    console.error("[embed] completed:", {
      chunksEmbedded,
      chunksSkipped: 0,
      batchFailures,
      durationMs,
      error,
    });
    return {
      status: "failed",
      chunksEmbedded,
      chunksSkipped: 0,
      batchFailures,
      durationMs,
      error,
    };
  }
}
