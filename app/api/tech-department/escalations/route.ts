import { NextRequest, NextResponse } from "next/server";
import {
  acknowledgeEscalation,
  findTechDepartmentCityHallConnection,
  listPendingEscalations,
} from "@/lib/tech-department-escalation";

export async function GET() {
  const connection = await findTechDepartmentCityHallConnection();
  const escalations = listPendingEscalations();

  return NextResponse.json({
    connection,
    escalations,
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { id?: string };
  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "id обязателен" }, { status: 400 });
  }

  const ok = acknowledgeEscalation(id);
  return NextResponse.json({ ok });
}
