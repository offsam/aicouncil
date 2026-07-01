import { NextResponse } from "next/server";
import { createOpenAIEmbeddingProvider } from "@/lib/github-rag/embedding-provider";
import { embedChunks, resolveRepositoryId } from "@/lib/github-rag/embed";
import { resolveSyncDefaults, syncRepository } from "@/lib/github-rag/sync";

export async function POST(req: Request) {
  let body: {
    owner?: string;
    repo?: string;
    branch?: string;
    force?: boolean;
    embed?: boolean;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const { owner, repo, branch } = resolveSyncDefaults(body);

  if (!owner || !repo) {
    return NextResponse.json(
      {
        sync: {
          status: "failed",
          filesIndexed: 0,
          chunksCreated: 0,
          filesSkipped: 0,
          error:
            "owner and repo are required (body or GITHUB_DEFAULT_OWNER/GITHUB_DEFAULT_REPO/GITHUB_REPO env)",
        },
      },
      { status: 400 },
    );
  }

  const sync = await syncRepository({
    owner,
    repo,
    branch,
    force: body.force ?? false,
  });

  const response: {
    sync: typeof sync;
    embed?: Awaited<ReturnType<typeof embedChunks>>;
  } = { sync };

  if (body.embed) {
    if (sync.status === "failed") {
      response.embed = {
        status: "failed",
        chunksEmbedded: 0,
        chunksSkipped: 0,
        batchFailures: 0,
        durationMs: 0,
        error: "Skipped embedding because sync failed",
      };
    } else {
      const repositoryId = await resolveRepositoryId({ owner, repo, branch });
      if (!repositoryId) {
        response.embed = {
          status: "failed",
          chunksEmbedded: 0,
          chunksSkipped: 0,
          batchFailures: 0,
          durationMs: 0,
          error: `Repository row not found for ${owner}/${repo}@${branch}`,
        };
      } else {
        response.embed = await embedChunks({
          repositoryId,
          provider: createOpenAIEmbeddingProvider(),
        });
      }
    }
  }

  const statusCode =
    sync.status === "failed" || response.embed?.status === "failed" ? 500 : 200;
  return NextResponse.json(response, { status: statusCode });
}
