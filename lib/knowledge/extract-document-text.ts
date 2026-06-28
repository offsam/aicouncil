import mammoth from "mammoth";
import WordExtractor from "word-extractor";

const EXTRACTABLE_EXTENSIONS = new Set(["pdf", "doc", "docx"]);

export function isExtractableDocumentFilename(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return EXTRACTABLE_EXTENSIONS.has(ext);
}

export async function extractDocumentText(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return (result.text || "").trim();
    } finally {
      await parser.destroy();
    }
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return (result.value || "").trim();
  }

  if (ext === "doc") {
    const extractor = new WordExtractor();
    const doc = await extractor.extract(buffer);
    return (doc.getBody() || "").trim();
  }

  throw new Error(`Формат не поддерживается для извлечения текста: .${ext || "?"}`);
}
