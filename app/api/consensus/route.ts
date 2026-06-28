import { NextRequest, NextResponse } from "next/server";
import type { ConsensusRequestBody, ConsensusResponseBody } from "@/lib/api-types";
import { runConsensusAnalysis } from "@/lib/consensus";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ConsensusRequestBody;
    const answers = body.answers?.filter((a) => a.agent && a.answer?.trim()) ?? [];

    if (answers.length < 2) {
      return NextResponse.json<ConsensusResponseBody>(
        { error: "Для сравнения нужно минимум два ответа." },
        { status: 400 },
      );
    }

    const { report, usage } = await runConsensusAnalysis(answers, "council");

    return NextResponse.json<ConsensusResponseBody>({
      report,
      consensus: report.finalVerdict,
      usage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Не удалось связаться с Anthropic API.";
    return NextResponse.json<ConsensusResponseBody>({ error: message }, { status: 500 });
  }
}
