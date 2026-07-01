import { NextResponse } from "next/server";
import { resolveSyncDefaults, syncRepository } from "@/lib/github-rag/sync";

export async function POST(req: Request) {
  let body: { owner?: string; repo?: string; branch?: string; force?: boolean } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = {};
  }

  const { owner, repo, branch } = resolveSyncDefaults(body);

  if (!owner || !repo) {
    return NextResponse.json(
      {
        status: "failed",
        filesIndexed: 0,
        chunksCreated: 0,
        filesSkipped: 0,
        error: "owner and repo are required (body or GITHUB_DEFAULT_OWNER/GITHUB_DEFAULT_REPO/GITHUB_REPO env)",
      },
      { status: 400 },
    );
  }

  const result = await syncRepository({
    owner,
    repo,
    branch,
    force: body.force ?? false,
  });

  const statusCode = result.status === "failed" ? 500 : 200;
  return NextResponse.json(result, { status: statusCode });
}
