import { NextRequest, NextResponse } from "next/server";
import { prepareKnowledgeUploadFromFile } from "@/lib/knowledge/prepare-knowledge-file-server";
import { resolveEntityRegistryId } from "@/lib/resolve-entity-registry-id";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const entityType = String(formData.get("entity_type") ?? "").trim();
    const entityId = String(formData.get("entity_id") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file обязателен" }, { status: 400 });
    }
    if (!entityType || !entityId || !title) {
      return NextResponse.json(
        { error: "entity_type, entity_id и title обязательны" },
        { status: 400 },
      );
    }

    const prepared = await prepareKnowledgeUploadFromFile(file, description);
    const entityRegistryId = await resolveEntityRegistryId(entityType, entityId);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("knowledge")
      .insert({
        entity_type: entityType,
        entity_id: entityId,
        entity_registry_id: entityRegistryId,
        title,
        content: prepared.content,
        body: prepared.body,
        file_url: prepared.file_url,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entry: data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
