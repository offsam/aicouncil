import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/admin";
import { requireWorkspaceOfficeId } from "@/lib/workspace/resolve-workspace-office-id";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const officeId = await requireWorkspaceOfficeId();
    return NextResponse.json({ officeId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Office not resolved";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
