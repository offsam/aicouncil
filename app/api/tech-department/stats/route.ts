import { NextResponse } from "next/server";
import { computeTechDepartmentStats } from "@/lib/tech-department-stats";

export async function GET() {
  const stats = await computeTechDepartmentStats();
  return NextResponse.json(stats);
}
