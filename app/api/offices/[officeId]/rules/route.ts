import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";
import { resolveEntityRegistryId } from "@/lib/resolve-entity-registry-id";

type RouteParams = { params: Promise<{ officeId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { officeId } = await params;

  try {
    const body = (await request.json()) as { rules?: string };
    if (typeof body.rules !== "string") {
      return NextResponse.json({ error: "rules обязателен" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    
    // Update old offices table for backward compatibility
    const { data, error } = await supabase
      .from("offices")
      .update({ rules: body.rules })
      .eq("id", officeId)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Sync with the new universal rules table
    // First delete existing rules for this city
    await supabase
      .from("rules")
      .delete()
      .eq("entity_type", "city")
      .eq("entity_id", officeId);

    // Insert new rule row if not empty
    if (body.rules.trim() !== "") {
      const entityRegistryId = await resolveEntityRegistryId("city", officeId);
      await supabase.from("rules").insert({
        entity_type: "city",
        entity_id: officeId,
        entity_registry_id: entityRegistryId,
        rule_text: body.rules,
      });
    }

    return NextResponse.json({ office: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
