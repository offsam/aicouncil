/**
 * Verify knowledge file upload stores title, description (content), and body/file_url.
 */
import * as fs from "fs";
import { createClient } from "@supabase/supabase-js";
import { prepareKnowledgeUploadFromFile } from "../lib/knowledge/prepare-knowledge-file-server";
import {
  entryHasAttachedFile,
  entryIsMissingFileAttachment,
  getKnowledgeEntryFileText,
} from "../lib/knowledge/knowledge-library-utils";

for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const i = line.indexOf("=");
  if (i > 0) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
}

const CHAMBER_ID = "f92ec76a-a991-4a9c-a067-ab3ac86ef394";

async function main() {
  const fileText = "# Конспект\n\nРеальное содержимое файла для просмотра и скачивания.";
  const description = "Описание для каталога — когда агенту нужен этот кейс";
  const buffer = Buffer.from(fileText, "utf8");
  const file = new File([buffer], "konspiekt.md", { type: "text/markdown" });

  const prepared = await prepareKnowledgeUploadFromFile(file, description);
  console.log("prepare:", {
    content: prepared.content,
    bodyLen: prepared.body?.length ?? 0,
    fileUrlLen: prepared.file_url.length,
  });

  if (prepared.content !== description) throw new Error("content must be description");
  if (!prepared.body?.includes("Реальное содержимое")) throw new Error("body must hold file text");
  if (!prepared.file_url.startsWith("data:")) throw new Error("file_url must be data URL");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: inserted, error } = await supabase
    .from("knowledge")
    .insert({
      entity_type: "chamber",
      entity_id: CHAMBER_ID,
      entity_registry_id: CHAMBER_ID,
      title: "__verify_upload__",
      content: prepared.content,
      body: prepared.body,
      file_url: prepared.file_url,
    })
    .select("*")
    .single();

  if (error || !inserted) throw new Error(error?.message ?? "insert failed");

  const entry = {
    id: inserted.id,
    title: inserted.title,
    content: inserted.content,
    body: inserted.body,
    file_url: inserted.file_url,
  };

  if (!entryHasAttachedFile(entry)) throw new Error("entry should have attached file");
  if (entryIsMissingFileAttachment(entry)) throw new Error("entry should not be missing file");
  const viewText = getKnowledgeEntryFileText(entry);
  if (!viewText?.includes("Реальное содержимое")) {
    throw new Error("viewer text must come from body, not description");
  }

  await supabase.from("knowledge").delete().eq("id", inserted.id);

  const { data: broken } = await supabase
    .from("knowledge")
    .select("id,title,content,body,file_url")
    .eq("id", "59414bfd-529b-4ca4-a27f-c535b915d79a")
    .maybeSingle();

  if (broken) {
    console.log("\nExisting broken entry:", broken.title);
    console.log("  missing file:", entryIsMissingFileAttachment(broken));
    console.log("  view text:", getKnowledgeEntryFileText(broken)?.slice(0, 40) ?? "(none)");
  }

  console.log("\nPASS: three-layer upload (title / description / body+file_url)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
