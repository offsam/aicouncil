import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { name?: string; rules?: string };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json({ error: "name обязателен" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || `city-${Date.now()}`;

    const { data: office, error: officeError } = await supabase
      .from("offices")
      .insert({
        name,
        rules: body.rules?.trim() || "",
      })
      .select("*")
      .single();

    if (officeError || !office) {
      return NextResponse.json({ error: officeError?.message || "Failed to create office" }, { status: 500 });
    }

    const { data: registry, error: regError } = await supabase
      .from("entity_registry")
      .insert({
        id: office.id,
        entity_type: "city",
        name,
        slug,
        parent_entity_id: null,
      })
      .select("*")
      .single();

    if (regError || !registry) {
      await supabase.from("offices").delete().eq("id", office.id);
      return NextResponse.json({ error: regError?.message || "Failed to register city" }, { status: 500 });
    }

    return NextResponse.json({ office, registry }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
