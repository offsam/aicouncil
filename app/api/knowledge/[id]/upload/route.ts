import { NextRequest, NextResponse } from "next/server";
import { prepareKnowledgeUploadFromFile } from "@/lib/knowledge/prepare-knowledge-file-server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

/** Attach or replace file on an existing library entry (title stays unchanged). */
export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  const { id } = await params;

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const description = String(formData.get("description") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file обязателен" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: existing, error: fetchError } = await supabase
      .from("knowledge")
      .select("id, content")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Запись не найдена" }, { status: 404 });
    }

    const prepared = await prepareKnowledgeUploadFromFile(
      file,
      description || String(existing.content ?? "").trim(),
    );

    const { data, error } = await supabase
      .from("knowledge")
      .update({
        content: prepared.content,
        body: prepared.body,
        file_url: prepared.file_url,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entry: data });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
