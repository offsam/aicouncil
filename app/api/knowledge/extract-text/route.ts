import { NextRequest, NextResponse } from "next/server";
import {
  extractDocumentText,
  isExtractableDocumentFilename,
} from "@/lib/knowledge/extract-document-text";
import { MAX_DOCUMENT_FILE_BYTES } from "@/lib/knowledge/knowledge-media-types";

export const runtime = "nodejs";

const MAX_FILE_BYTES = MAX_DOCUMENT_FILE_BYTES;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file обязателен" }, { status: 400 });
    }

    if (!isExtractableDocumentFilename(file.name)) {
      return NextResponse.json(
        { error: "Поддерживаются только PDF, DOC и DOCX" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: "Файл слишком большой (макс. 256 KB)" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const text = await extractDocumentText(buffer, file.name);

    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
