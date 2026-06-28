import { NextRequest, NextResponse } from "next/server";
import { copyKnowledgeEntryToEntity } from "@/lib/chat/chat-attachments-server";
import { resolveEntityRegistryId } from "@/lib/resolve-entity-registry-id";
import { isSupabaseConfigured } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase не настроен" }, { status: 503 });
  }

  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      entity_type?: string;
      entity_id?: string;
    };

    if (!body.entity_type || !body.entity_id) {
      return NextResponse.json(
        { error: "entity_type и entity_id обязательны" },
        { status: 400 },
      );
    }

    const entityRegistryId = await resolveEntityRegistryId(body.entity_type, body.entity_id);
    const attachment = await copyKnowledgeEntryToEntity({
      knowledgeId: id,
      entityType: body.entity_type,
      entityId: body.entity_id,
      entityRegistryId,
    });

    return NextResponse.json({ attachment }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
