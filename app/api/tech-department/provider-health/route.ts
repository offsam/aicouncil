import { NextResponse } from "next/server";
import { listProviderHealth } from "@/lib/provider-failover-status";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export async function GET() {
  const providers = listProviderHealth();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ providers, agents: [] });
  }

  const supabase = getSupabaseAdmin();
  const { data: agents } = await supabase
    .from("agents")
    .select("id, name, provider, model_id, status, cost_tier")
    .order("name");

  return NextResponse.json({
    providers,
    agents: agents ?? [],
    updatedAt: new Date().toISOString(),
  });
}
