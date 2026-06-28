/**
 * Verify knowledge catalog + selective body injection in agent context.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import { buildContext } from "../lib/entity-registry";
import { extractDocumentText } from "../lib/knowledge/extract-document-text";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const CHAMBER_REGISTRY_ID = "a1000000-0000-4000-8000-000000000002";
const AGENT_REGISTRY_ID = "a100000b-0000-4000-8000-00000000000b";

const PDF_BODY =
  "KNOWLEDGE_VERIFY_PDF_SECRET: Sheriff meeting scheduled for March 15 2026 at 14:00 in Moscow office.";
const TXT_BODY =
  "KNOWLEDGE_VERIFY_TXT_SECRET: witness list exceeds two hundred characters in this markdown body.";

function buildMinimalPdf(text: string): Buffer {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj",
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream endobj`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += `${obj}\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf, "utf8");
}

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const pdfBuffer = buildMinimalPdf(PDF_BODY);
  const extractedPdfText = await extractDocumentText(pdfBuffer, "knowledge-verify-test.pdf");
  if (!extractedPdfText.includes("Sheriff meeting scheduled")) {
    throw new Error("PDF text was not extracted");
  }

  const tag = `verify-${Date.now()}`;
  const pdfTitle = `[${tag}] PDF knowledge test`;
  const txtTitle = `[${tag}] TXT knowledge test`;

  const { data: pdfRow, error: pdfErr } = await supabase
    .from("knowledge")
    .insert({
      entity_type: "chamber",
      entity_id: CHAMBER_REGISTRY_ID,
      entity_registry_id: CHAMBER_REGISTRY_ID,
      title: pdfTitle,
      content: "Описание: встреча шерифа и расписание",
      body: extractedPdfText,
      file_url: null,
    })
    .select("id, title, content, body")
    .single();
  if (pdfErr) throw pdfErr;

  const { data: txtRow, error: txtErr } = await supabase
    .from("knowledge")
    .insert({
      entity_type: "chamber",
      entity_id: CHAMBER_REGISTRY_ID,
      entity_registry_id: CHAMBER_REGISTRY_ID,
      title: txtTitle,
      content: "Описание: список свидетелей",
      body: TXT_BODY,
      file_url: null,
    })
    .select("id, title, content, body")
    .single();
  if (txtErr) throw txtErr;

  const ctxMatch = await buildContext(AGENT_REGISTRY_ID, {
    chamberRegistryId: CHAMBER_REGISTRY_ID,
    taskText: "когда встреча sheriff meeting",
  });

  const ctxSkip = await buildContext(AGENT_REGISTRY_ID, {
    chamberRegistryId: CHAMBER_REGISTRY_ID,
    taskText: "промты для видео",
  });

  const chamberLayer = ctxMatch.layers.find((l) => l.entityRegistryId === CHAMBER_REGISTRY_ID);
  const pdfRef = chamberLayer?.knowledge.find((k) => k.id === pdfRow.id);
  const txtRef = chamberLayer?.knowledge.find((k) => k.id === txtRow.id);

  console.log("PDF opened for sheriff task:", pdfRef?.opened);
  console.log("TXT opened for sheriff task:", txtRef?.opened);
  console.log("Prompt has PDF secret when matched:", ctxMatch.flattenedPrompt.includes("Sheriff meeting scheduled"));
  console.log("Prompt has TXT secret when matched:", ctxMatch.flattenedPrompt.includes("witness list exceeds"));
  console.log("Prompt has catalog only label:", ctxMatch.flattenedPrompt.includes("Library catalog"));
  console.log(
    "Unrelated task hides PDF secret:",
    !ctxSkip.flattenedPrompt.includes("Sheriff meeting scheduled"),
  );
  console.log(
    "Unrelated task hides TXT secret:",
    !ctxSkip.flattenedPrompt.includes("witness list exceeds"),
  );

  const ok =
    pdfRef?.opened === true &&
    txtRef?.opened === false &&
    ctxMatch.flattenedPrompt.includes("Sheriff meeting scheduled") &&
    !ctxMatch.flattenedPrompt.includes("witness list exceeds") &&
    !ctxSkip.flattenedPrompt.includes("Sheriff meeting scheduled");

  await supabase.from("knowledge").delete().in("id", [pdfRow.id, txtRow.id]);

  if (!ok) {
    throw new Error("Verification failed — see logs above");
  }

  console.log("\n✓ Verification passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
