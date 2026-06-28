import * as fs from "fs";
import { getSupabaseAdmin } from "./lib/supabase/admin";
import { buildContext } from "./lib/entity-registry";
import { resolveRoute } from "./lib/routing";

// Load environment variables manually from .env.local
const envPath = "./.env.local";
const envContent = fs.readFileSync(envPath, "utf8");
for (const line of envContent.split("\n")) {
  const parts = line.split("=");
  if (parts.length >= 2) {
    process.env[parts[0].trim()] = parts.slice(1).join("=").trim();
  }
}

const CITY_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

async function runSprint4Tests() {
  console.log("=== ЗАПУСК ПРОВЕРОЧНЫХ ТЕСТОВ SPRINT 4 ===\n");
  const supabase = getSupabaseAdmin();

  // Test registry IDs
  const chambARegId = "aaaa0000-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const chambBRegId = "bbbb0000-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  
  const ruleAId = "aaaa1111-1111-1111-1111-111111111111";
  const ruleBId = "bbbb1111-1111-1111-1111-111111111111";
  const knowAId = "aaaa2222-2222-2222-2222-222222222222";
  const knowBId = "bbbb2222-2222-2222-2222-222222222222";

  console.log("1. Очистка старых тестовых данных...");
  // Cleanup connections and test chambers
  await supabase.from("connections").delete().in("source_entity_id", [chambARegId, chambBRegId]);
  await supabase.from("connections").delete().in("target_entity_id", [chambARegId, chambBRegId]);
  await supabase.from("rules").delete().in("id", [ruleAId, ruleBId]);
  await supabase.from("knowledge").delete().in("id", [knowAId, knowBId]);
  await supabase.from("entity_registry").delete().in("id", [chambARegId, chambBRegId]);
  console.log("Очистка завершена.\n");

  console.log("2. Создание тестовых отделов A и B...");
  await supabase.from("entity_registry").insert([
    {
      id: chambARegId,
      entity_type: "chamber",
      name: "Test Chamber A (PR)",
      slug: "test-chamber-a",
      parent_entity_id: CITY_ID,
      routing_description: "Handles PR and public outreach"
    },
    {
      id: chambBRegId,
      entity_type: "chamber",
      name: "Test Chamber B (Content)",
      slug: "test-chamber-b",
      parent_entity_id: CITY_ID,
      routing_description: "Creates text, visual and media content"
    }
  ]);

  // Insert rules and knowledge
  await supabase.from("rules").insert([
    {
      id: ruleAId,
      entity_type: "chamber",
      entity_id: chambARegId,
      entity_registry_id: chambARegId,
      rule_text: "Rule from Chamber A: Always use green brand color."
    },
    {
      id: ruleBId,
      entity_type: "chamber",
      entity_id: chambBRegId,
      entity_registry_id: chambBRegId,
      rule_text: "Rule from Chamber B: Tone of voice should be warm."
    }
  ]);

  await supabase.from("knowledge").insert([
    {
      id: knowAId,
      entity_type: "chamber",
      entity_id: chambARegId,
      entity_registry_id: chambARegId,
      title: "Chamber A Branding",
      content: "Here is Chamber A brand knowledge content."
    },
    {
      id: knowBId,
      entity_type: "chamber",
      entity_id: chambBRegId,
      entity_registry_id: chambBRegId,
      title: "Chamber B Guidelines",
      content: "Here is Chamber B content guidelines."
    }
  ]);
  console.log("Отделы созданы.\n");

  // ==========================================
  console.log("=== ТЕСТ 1: Горизонтальный контекст (buildContext) ===");
  // Create connection: A -> B (B reads A's knowledge, but not rules)
  const { data: conn1, error: conn1Err } = await supabase.from("connections").insert({
    source_entity_id: chambARegId,
    target_entity_id: chambBRegId,
    priority: 0,
    is_active: true
  }).select("id").single();

  if (conn1Err || !conn1) {
    throw new Error(`Failed to create test connection: ${conn1Err?.message}`);
  }

  await supabase.from("connection_permissions").insert({
    connection_id: conn1.id,
    read_knowledge: true,
    read_rules: false,
    read_results: false,
    send_tasks: false
  });

  console.log("Создан кабель Test Chamber A -> Test Chamber B: read_knowledge = true");
  
  let contextB = await buildContext(chambBRegId);
  console.log("Сгенерированный flattenedPrompt для B:");
  console.log("------------------------");
  console.log(contextB.flattenedPrompt);
  console.log("------------------------");

  const hasAInContext = contextB.flattenedPrompt.includes("Connected: Test Chamber A (PR) (via cable)");
  const hasAKnowledge = contextB.flattenedPrompt.includes("Chamber A Branding");
  const hasARules = contextB.flattenedPrompt.includes("Always use green brand color.");

  if (hasAInContext && hasAKnowledge && !hasARules) {
    console.log("Результат Теста 1: УСПЕШНО (знания есть, правил нет)");
  } else {
    console.error("Результат Теста 1: ОШИБКА!", { hasAInContext, hasAKnowledge, hasARules });
  }
  console.log("\n");

  // ==========================================
  console.log("=== ТЕСТ 2: Маршрутизация задач (resolveRoute с send_tasks: false) ===");
  // Set up routing rules so A wants to route to B
  const ruleRouteId = "cccc3333-3333-3333-3333-333333333333";
  await supabase.from("routing_rules").insert({
    id: ruleRouteId,
    condition_type: "keyword",
    condition_value: "generate text",
    target_entity_registry_id: chambBRegId,
    priority: 10
  });

  // ResolveRoute from A
  let routeRes = await resolveRoute("Please generate text", undefined, chambARegId);
  console.log("Targets candidates when send_tasks = false:", JSON.stringify(routeRes.targets));
  let hasBTarget = routeRes.targets.some(t => t.entityRegistryId === chambBRegId);

  if (!hasBTarget) {
    console.log("Результат Теста 2: УСПЕШНО (B заблокирован, так как send_tasks = false)");
  } else {
    console.error("Результат Теста 2: ОШИБКА (B ошибочно разрешен)");
  }
  console.log("\n");

  // ==========================================
  console.log("=== ТЕСТ 3: Маршрутизация задач (resolveRoute с send_tasks: true) ===");
  // Update permissions
  await supabase.from("connection_permissions").update({ send_tasks: true }).eq("connection_id", conn1.id);
  console.log("Кабель обновлен: send_tasks = true");

  routeRes = await resolveRoute("Please generate text", undefined, chambARegId);
  console.log("Targets candidates when send_tasks = true:", JSON.stringify(routeRes.targets));
  hasBTarget = routeRes.targets.some(t => t.entityRegistryId === chambBRegId);

  if (hasBTarget) {
    console.log("Результат Теста 3: УСПЕШНО (B разрешен, так как send_tasks = true)");
  } else {
    console.error("Результат Теста 3: ОШИБКА (B не появился в кандидатах)");
  }
  console.log("\n");

  // ==========================================
  console.log("=== ТЕСТ 4: Деактивация кабеля (is_active = false) ===");
  await supabase.from("connections").update({ is_active: false }).eq("id", conn1.id);
  console.log("Кабель деактивирован: is_active = false");

  contextB = await buildContext(chambBRegId);
  const hasAInContextDisabled = contextB.flattenedPrompt.includes("Connected: Test Chamber A");
  
  if (!hasAInContextDisabled) {
    console.log("Результат Теста 4: УСПЕШНО (кабель неактивен, горизонтальный слой скрыт)");
  } else {
    console.error("Результат Теста 4: ОШИБКА (кабель неактивен, но виден в контексте)");
  }
  console.log("\n");

  // ==========================================
  console.log("=== ТЕСТ 5: Логирование чтений (connection_logs) ===");
  // Re-activate connection
  await supabase.from("connections").update({ is_active: true }).eq("id", conn1.id);
  await buildContext(chambBRegId); // Read knowledge

  const { data: logs } = await supabase
    .from("connection_logs")
    .select("payload_type, summary")
    .eq("connection_id", conn1.id)
    .order("created_at", { ascending: false });

  console.log("Логи для нашего кабеля:", logs);
  const hasKnowledgeLog = logs?.some(l => l.payload_type === "knowledge");

  if (hasKnowledgeLog) {
    console.log("Результат Теста 5: УСПЕШНО (логирование работает)");
  } else {
    console.error("Результат Теста 5: ОШИБКА (логи отсутствуют)");
  }
  console.log("\n");

  // ==========================================
  console.log("=== ТЕСТ 6: Защита от бесконечных циклов (A ↔ B) ===");
  // Create connection B -> A
  const { data: conn2 } = await supabase.from("connections").insert({
    source_entity_id: chambBRegId,
    target_entity_id: chambARegId,
    priority: 0,
    is_active: true
  }).select("id").single();

  if (conn2) {
    await supabase.from("connection_permissions").insert({
      connection_id: conn2.id,
      read_knowledge: true
    });
  }
  console.log("Создана взаимная связь B -> A. Проверка сборки контекстов...");
  
  const tStartA = Date.now();
  const contextA = await buildContext(chambARegId);
  const tEndA = Date.now();
  
  console.log(`Context A собрался за ${tEndA - tStartA}ms (без зависания).`);
  const isRecursionPrevented = !contextA.flattenedPrompt.includes("Connected: Test Chamber B (via cable)\n- Knowledge available: Test Chamber A");
  
  if (isRecursionPrevented && (tEndA - tStartA < 1000)) {
    console.log("Результат Теста 6: УСПЕШНО (рекурсия предотвращена, глубина обхода = 1)");
  } else {
    console.error("Результат Теста 6: ОШИБКА (рекурсивный обход не прерван)");
  }
  console.log("\n");

  // ==========================================
  console.log("=== ТЕСТ 7: Лимит в 10 источников и сортировка по priority ===");
  // Create 12 test chambers and connect them to B
  const extraRegIds: string[] = [];
  const extraConnIds: string[] = [];
  
  console.log("Создание 12 дополнительных отделов C1..C12 и подключение к B...");
  for (let i = 1; i <= 12; i++) {
    const id = `cccc0000-cccc-cccc-cccc-${i.toString().padStart(12, "0")}`;
    extraRegIds.push(id);

    await supabase.from("entity_registry").insert({
      id,
      entity_type: "chamber",
      name: `Extra Chamber C${i}`,
      slug: `extra-chamber-${i}`,
      parent_entity_id: CITY_ID
    });

    await supabase.from("knowledge").insert({
      entity_type: "chamber",
      entity_id: id,
      entity_registry_id: id,
      title: `Knowledge from C${i}`,
      content: `Content of C${i}`
    });

    // C5 and C10 will have priority 5, others 0
    const priority = (i === 5 || i === 10) ? 5 : 0;
    const { data: c } = await supabase.from("connections").insert({
      source_entity_id: id,
      target_entity_id: chambBRegId,
      priority,
      is_active: true
    }).select("id").single();

    if (c) {
      extraConnIds.push(c.id);
      await supabase.from("connection_permissions").insert({
        connection_id: c.id,
        read_knowledge: true
      });
    }
  }

  contextB = await buildContext(chambBRegId);
  const totalConnectedLines = (contextB.flattenedPrompt.match(/Connected: Extra Chamber C\d+/g) || []).length;
  console.log(`Всего подключенных Extra Chamber в контексте: ${totalConnectedLines} (ожидается <= 10)`);
  
  const hasC5 = contextB.flattenedPrompt.includes("Connected: Extra Chamber C5");
  const hasC10 = contextB.flattenedPrompt.includes("Connected: Extra Chamber C10");

  const isLimitCorrect = totalConnectedLines <= 10 && hasC5 && hasC10;

  if (isLimitCorrect) {
    console.log("Результат Теста 7: УСПЕШНО (лимит 10 соблюден, C5 и C10 с высшим приоритетом вошли)");
  } else {
    console.error("Результат Теста 7: ОШИБКА!", { totalConnectedLines, hasC5, hasC10 });
  }

  // ==========================================
  console.log("\n3. Очистка временных данных...");
  await supabase.from("routing_rules").delete().eq("id", ruleRouteId);
  await supabase.from("connections").delete().in("source_entity_id", [chambARegId, chambBRegId, ...extraRegIds]);
  await supabase.from("connections").delete().in("target_entity_id", [chambARegId, chambBRegId, ...extraRegIds]);
  await supabase.from("rules").delete().in("id", [ruleAId, ruleBId]);
  await supabase.from("knowledge").delete().in("id", [knowAId, knowBId]);
  await supabase.from("entity_registry").delete().in("id", [chambARegId, chambBRegId, ...extraRegIds]);
  console.log("Очистка завершена. Тестирование окончено.");
}

runSprint4Tests().catch(console.error);
