import { NextRequest, NextResponse } from "next/server";
import {
  escalateToCityHall,
  findTechDepartmentCityHallConnection,
  type TechEscalationKind,
} from "@/lib/tech-department-escalation";

const VALID_KINDS = new Set<TechEscalationKind>([
  "provider_failure",
  "fallback_exhausted",
  "connection_help",
]);

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as {
    kind?: TechEscalationKind;
    provider?: string;
    error?: string;
    userMessage?: string;
  };

  const kind = body.kind && VALID_KINDS.has(body.kind) ? body.kind : "connection_help";
  const provider = body.provider?.trim() || "system";
  const error = body.error?.trim();

  if (!error) {
    return NextResponse.json({ error: "error обязателен" }, { status: 400 });
  }

  const connection = await findTechDepartmentCityHallConnection();
  if (!connection) {
    return NextResponse.json(
      {
        ok: false,
        error: "Связь Технический отдел → City Hall не найдена. Примените миграцию.",
      },
      { status: 404 },
    );
  }

  const record = await escalateToCityHall({
    kind,
    provider,
    error,
    userMessage: body.userMessage,
  });

  if (!record) {
    return NextResponse.json({
      ok: false,
      throttled: true,
      connection,
      message: "Эскалация пропущена (cooldown или пустая ошибка)",
    });
  }

  return NextResponse.json({ ok: true, escalation: record, connection });
}
