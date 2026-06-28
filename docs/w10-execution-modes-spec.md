# W10A — Execution Modes Specification

**Дата:** 2025-06-23  
**Тип:** продуктовая спецификация (W10A)  
**Ограничения:** без кода, без миграций, без изменений API или существующих файлов  

**Контекст:** проект завершил W1–W9 (Workspace: Foundation → Multi-Select / Keyboard / Polish). Архитектурный аудит подтвердил: иерархия City → Building → Chamber → Agent жизнеспособна; Routing Engine и Workflow Engine не требуют переписывания. **Mayor не является сущностью БД** — это **System Orchestrator** (слой координации поверх routing, workflow и multi-agent execution).

**Связанные документы:** [`post-w8-strategic-review.md`](post-w8-strategic-review.md), [`fast-team-council-design-review.md`](fast-team-council-design-review.md)

---

## 0. Продуктовая рамка

### Что продаётся пользователю

Пользователь покупает **уровень обработки задачи**, а не «Mayor», не «City View», не «количество агентов»:

| Режим | Обещание |
|---|---|
| **Fast** | Быстрый ответ, минимальная стоимость |
| **Team** | Несколько экспертов, координация, синтез |
| **Council** | Полное обсуждение, консенсус, максимальное качество |

В UI **никогда не показывается** «1 / 3 / 11 агентов». Это внутренняя реализация (маппится на `estimateAgentCount()` и `resolveAgentIdsForTarget()`). Пользователь видит только **Fast · Team · Council** и понятные метрики: время, уровень качества, относительная «стоимость» (tier), не технические детали.

### Роль Mayor (System Orchestrator)

Mayor — **не персонаж в базе**, а продуктовая метафора и UI-ярлык для оркестратора:

```
Пользователь → Mayor (Chat sidebar)
                 ↓
         System Orchestrator
           ├─ Routing (куда направить задачу)
           ├─ Execution Mode (Fast / Team / Council)
           ├─ Workflow (если задача многошаговая между chambers)
           └─ Canvas feedback (подсветка пути и участников)
```

City Hall на canvas — **визуальная точка входа**, не отдельная executable entity.

### Главный gap (после W9)

| Слой | Состояние |
|---|---|
| **Mission Control** (`/`) | Multi-agent parallel, fan-out, aggregation, report — **работает** |
| **Workspace Chat** (`/workspace`) | Всегда single-agent (или workflow) — **игнорирует** multi-agent инфраструктуру |
| **Heuristic** | `estimateAgentCount()` уже выбирает масштаб 1/3/11 — **автоматически**, без UI |
| **Consensus** | `/api/consensus` — **существует** |
| **Cost signal** | `agents.cost_tier` — **существует** |

**Вывод:** Fast / Team / Council уже почти заложены в архитектуре. Их нет в **пользовательском интерфейсе Workspace Chat** — это задача W10B.

### Два ортогональных измерения

| Измерение | Что видит пользователь | Что под капотом |
|---|---|---|
| **Execution Mode** | Fast / Team / Council | Parallel advisors в **одном** target chamber |
| **Workflow** | «Задача прошла через несколько отделов» | Sequential chamber → chamber |

Workflow ≠ Council. Пользователь может выбрать Council, но если задача многошаговая между chambers — срабатывает **Workflow**, и это объясняется отдельным сообщением в UI.

---

## 1. Fast

### 1.1 Что такое Fast (продукт)

**Fast** — режим по умолчанию: один вопрос → один ответ от лучшего доступного советника в нужном отделе (chamber). Минимальное время ожидания и минимальная «стоимость» выполнения.

**Метафора для пользователя:** «Спросить одного эксперта».

### 1.2 Пользовательская ценность

- Ответ за секунды на рутинные задачи (текст, перевод, уточнение, черновик).
- Предсказуемый расход — подходит для Free / Starter tier.
- Минимум шума: один ответ, один маршрут на canvas.
- Низкий порог входа — не нужно думать о «глубине» обработки.

### 1.3 Execution flow

```
[User] выбирает Fast → вводит задачу → Send
         ↓
[System Orchestrator]
  1. Проверка: нужен ли Workflow (несколько chambers)?
     → ДА: Workflow path (см. §6), режим Fast не применяется к шагам
     → НЕТ: продолжаем
  2. Routing: resolveRoute() → target chamber
  3. Execution Mode = Fast → один advisor (внутренне: min-cost assignment)
  4. invokeAgent + buildContext
  5. Ответ в sidebar + подсветка маршрута на canvas (W4)
```

### 1.4 Explainability

| Что показываем пользователю | Fast |
|---|---|
| Куда ушла задача | «Citizly → Instagram» (route meta, уже есть в W4) |
| Кто ответил | Имя модели / advisor (без технического slug) |
| Почему этот отдел | Кратко: «по правилам маршрутизации» / «по описанию отдела» |
| Что advisor «видел» | **Не в W10B** (Context Preview — W10C) |
| История routing | **Не в W10B** (`routing_logs` UI — W10C) |

### 1.5 UI поведение

| Зона | Поведение |
|---|---|
| Mode Selector | **Fast** selected by default |
| Pre-send hint | «~5 сек · экономичный режим» |
| Loading | «Маршрутизация…» → «Готовим ответ…» |
| Sidebar | Один bubble с ответом + строка meta (маршрут · модель · метод routing) |
| Canvas | W4: City Hall → Building → Chamber → один advisor node |
| Inspector | Клик на advisor → полный W8 Inspector (post-hoc) |

### 1.6 Ожидаемая стоимость (продуктовая, не USD)

| Метрика | Fast |
|---|---|
| Уровень | **Низкий** (иконка «экономично») |
| Tier mix | Преимущественно free / cheap advisors |
| Synthesis | Нет |
| Относительный вес | **1×** (базовая единица) |

*Точный биллинг в USD — post-commercial; `cost_tier` уже на agents.*

### 1.7 Ожидаемое время выполнения

| Этап | Fast |
|---|---|
| Routing | ~0.5–2 с |
| Ответ advisor | ~2–8 с |
| **Итого (typical)** | **~3–10 с** |
| Canvas animation | W4 hold ~4 с → fade |

---

## 2. Team

### 2.1 Что такое Team (продукт)

**Team** — «малый комитет»: одна задача направляется в отдел, **несколько экспертов** работают параллельно, система даёт **сводку и сравнение** перспектив.

**Метафора:** «Собрать трёх экспертов и услышать разные точки зрения».

### 2.2 Пользовательская ценность

- Меньше риска «галлюцинации одной модели» vs Fast.
- Подходит для planning, review, черновиков стратегии, сравнения подходов.
- Natural upsell: Pro tier («Team mode included»).
- Баланс качества и стоимости — между Fast и Council.

### 2.3 Execution flow

```
[User] выбирает Team → Send
         ↓
[System Orchestrator]
  1. Workflow check → если multi-chamber → Workflow (§6)
  2. Routing → target chamber
  3. Execution Mode = Team → parallel advisors (внутренне: до 3; **рабочий диапазон 2–3** по roster chamber)
     → если roster = 3: три параллельных вызова
     → если roster = 2: **graceful degradation** — два параллельных вызова (обещание «несколько точек зрения» сохраняется)
     → если roster **<2 (0 или 1)**: Team **disabled** до send (§5.3), не fallback на Fast
  4. Promise.all(invoke) — параллельно
  5. Если ≥2 успешных ответа → краткий synthesis (через /api/consensus, сжатый формат)
  6. Sidebar: сводка + раскрываемые ответы экспертов
  7. Canvas: несколько advisor nodes активны одновременно
```

**Нижняя граница Team:** режим имеет смысл только при **≥2 advisors** в target chamber. При 2 — деградация до двух участников; при 0–1 — сегмент Team недоступен (symmetric minimum с требованием synthesis: `/api/consensus` нужен ≥2 ответа).

**Почему Team деградирует, а Council блокируется:** Team продаёт качественное обещание («несколько точек зрения») — оно сохраняется даже при двух экспертах вместо трёх, поэтому graceful degradation оправдан. Council продаёт количественное обещание («полный состав отдела», premium-цена, confirmation gate) — если деградировать состав Council до уровня Team, пользователь платит premium-цену за продукт, идентичный более дешёвому режиму; это подрывает доверие сильнее, чем понятный disabled-tooltip. Поэтому Council **блокируется** при недостаточном roster, а не деградирует.

### 2.4 Explainability

| Что показываем | Team |
|---|---|
| Сколько участвовало | «3 эксперта» (не «3 agents» — продуктовый copy) |
| Кто участвовал | Имена / модели в accordion |
| Сводка | 1 абзац «общий вывод» |
| Расхождения | Краткий блок «где мнения разошлись» (optional в MVP) |
| Partial failure | «2 из 3 экспертов ответили; сводка по доступным» |

### 2.5 UI поведение

| Зона | Поведение |
|---|---|
| Mode Selector | Вкладка **Team** |
| Pre-send hint | «~15 сек · несколько экспертов · средняя стоимость» |
| Loading | Progress: «Эксперт 2 из 3 готов…» |
| Sidebar | **TeamAnswersPanel**: сводка сверху + accordion по экспертам |
| Canvas | Несколько advisor nodes pulsing; маршрут тот же (W4 extended) |
| Inspector | Multi-select summary (W9) при выборе участников post-hoc |

### 2.6 Ожидаемая стоимость

| Метрика | Team |
|---|---|
| Уровень | **Средний** |
| Roster | **2–3** advisors; при 2 — деградация (не блок); при **0–1** — режим недоступен |
| Tier mix | Mixed (free + cheap + возможно 1 expensive) |
| Synthesis | Опционально 1 вызов analyzer |
| Относительный вес | **~3–5×** vs Fast |

### 2.7 Ожидаемое время выполнения

| Этап | Team |
|---|---|
| Routing | ~0.5–2 с |
| Parallel advisors | ~5–15 с (max latency, не сумма) |
| Synthesis | +3–8 с |
| **Итого (typical)** | **~10–25 с** |

---

## 3. Council

### 3.1 Что такое Council (продукт)

**Council** — «полное заседание совета»: максимальная глубина, **все доступные advisors** в отделе, обязательный **structured report** с консенсусом, расхождениями и итоговой рекомендацией.

**Метафора:** «Созвать весь совет по стратегическому вопросу».

### 3.2 Пользовательская ценность

- Максимальное качество для high-stakes решений.
- Structured output — не просто текст, а **отчёт совета**.
- Дифференциация продукта vs single-model chat.
- Enterprise / premium tier hook.

### 3.3 Execution flow

```
[User] выбирает Council → Council Confirmation Gate (§7) → Confirm → Send
         ↓
[System Orchestrator]
  1. Workflow check
  2. Routing → target chamber
  3. Execution Mode = Council → parallel advisors (внутренне: up to 11, capped by roster)
  4. Promise.all(invoke)
  5. POST /api/consensus — обязательно при ≥2 ответах
  6. Sidebar: Council Report (§9)
  7. Canvas: Council session visualization (§8)
```

### 3.4 Explainability

| Что показываем | Council |
|---|---|
| Масштаб | «Полный совет» / «расширенное заседание» — **не** число 11 |
| Roster | Список участвовавших экспертов с tier badge |
| Report | 4 блока: Consensus · Differences · Best Answer · Final Verdict |
| Partial | «8 экспертов ответили; отчёт по доступным данным» |
| Duration | «Заседание заняло 52 сек» |

### 3.5 UI поведение

| Зона | Поведение |
|---|---|
| Mode Selector | **Council** + badge «Премиум» / «$$$» |
| Pre-send | Warning strip + **Confirmation Gate** (§7) |
| Loading | Фазы: «Сбор мнений…» → «Синтез отчёта…» → «Готово» |
| Sidebar | **Council Report** (§9) |
| Canvas | Council session viz (§8) |
| Inspector | Roster + duration post-hoc |

### 3.6 Ожидаемая стоимость

| Метрика | Council |
|---|---|
| Уровень | **Высокий** |
| Tier mix | Full roster including expensive models |
| Synthesis | Обязательно (Claude Sonnet via `/api/consensus`) |
| Относительный вес | **~10–20×** vs Fast |

### 3.7 Ожидаемое время выполнения

| Этап | Council |
|---|---|
| Routing | ~0.5–2 с |
| Parallel advisors | ~15–40 с |
| Synthesis | ~5–15 с |
| **Итого (typical)** | **~30–60 с** |

---

## 4. Переиспользование существующего кода

### 4.1 По режимам

| Компонент | Fast | Team | Council |
|---|---|---|---|
| `resolveRoute()` | ✅ target chamber | ✅ | ✅ |
| `selectAgentForChamberEntity()` | ✅ primary path | — | — |
| `resolveAgentIdsForTarget()` | ✅ (N=1) | ✅ (N=3) | ✅ (N=11) |
| `estimateAgentCount()` | mapping reference | mapping reference | mapping reference |
| `invokeAgentForWorkflow()` | ✅ ×1 | ✅ ×N parallel | ✅ ×N parallel |
| `buildContext()` | ✅ | ✅ per advisor | ✅ per advisor |
| `/api/consensus` | — | optional | **required** |
| Mission Control fan-out pattern | reference | **port server-side** | **port server-side** |
| `AnalysisReportPanel` | — | subset | ✅ full reuse |
| `ModelCard` / `AnalyzerHub` | — | adapt | ✅ adapt |
| `lib/tokens.ts` | optional footer | footer | footer |
| W4 route highlight | ✅ | ✅ extended | ✅ extended |
| W7 workflow replay | if workflow | if workflow | if workflow |
| `processTask()` / Workflow Engine | gate only | gate only | gate only |

### 4.2 Mission Control — что переиспользуем

| Артефакт | Переиспользование |
|---|---|
| Parallel fan-out orchestration | **Паттерн** → перенос в server-side orchestrator (не browser fan-out) |
| `ModelCard` | Status cards во время Team/Council execution |
| `AnalyzerHub` | Progress phases для Council |
| `AnalysisReportPanel` | Council Report в sidebar |
| `fetchReport()` → `/api/consensus` | Team (optional) + Council (required) |
| Token aggregation | Post-flight footer |

Mission Control остаётся **reference UI**; Workspace становится primary product surface.

### 4.3 Workflow Engine — что переиспользуем (без изменений)

| Артефакт | Роль в Execution Modes |
|---|---|
| `processTask()` | **Первый gate:** multi-chamber → Workflow, mode не применяется |
| `planWorkflow()` | Без изменений |
| `executeWorkflow()` | Без изменений |
| `invokeAgentForWorkflow()` | **Ядро** вызова advisor для всех режимов |
| W7 `startWorkflowReplay()` | Без изменений |

### 4.4 Workspace (после W9) — что уже есть

| Арtefact | Готовность |
|---|---|
| `WorkspaceChatSidebar` | Chat entry — нужен Mode Selector |
| `WorkspaceRouteContext` | W4 + W7 highlight infrastructure |
| `AgentNode` cost badge | Tier visual ($, $$$) |
| W8 Inspector | Post-hoc advisor detail |
| W9 multi-select | Post-hoc roster inspection |

---

## 5. Mode Selector — конкретный вариант реализации

### 5.1 Выбранный паттерн: **Segmented control в chat sidebar**

Три сегмента в одной строке над полем ввода. Не dropdown — пользователь должен **видеть trade-off** до отправки.

```
┌─────────────────────────────────────────────────┐
│ Chat with Mayor                                  │
│ System Orchestrator · route + execution mode     │
├─────────────────────────────────────────────────┤
│  [ ⚡ Fast ]  [ 👥 Team ]  [ 🏛 Council ]        │
│   ~5 сек       ~15 сек       ~45 сек             │
│   экономично   сбалансир.    максимум качества   │
├─────────────────────────────────────────────────┤
│  ⓘ Fast · ~5 сек · экономичный режим              │
├─────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐ [→]  │
│  │ Задача для Citizly…                   │      │
│  └───────────────────────────────────────┘      │
└─────────────────────────────────────────────────┘
```

### 5.2 Почему segmented control, а не dropdown / auto-only

| Альтернатива | Почему отвергнуто |
|---|---|
| Dropdown | Скрывает trade-off; пользователь не «покупает» режим осознанно |
| Auto-only (`estimateAgentCount`) | Нет product control; нельзя monetize tiers; неожиданный Council |
| Radio в settings | Слишком далеко от moment of send |

### 5.3 Правила поведения

| Правило | Деталь |
|---|---|
| Default | **Fast** при каждой новой сессии |
| Persistence | Session-local state; без DB в W10B |
| Team disabled | Если в target chamber **<2 advisors** (0 или 1) — tooltip «Недостаточно экспертов для Team (нужно минимум 2)» |
| Council disabled | Если в target chamber **<3 advisors** — tooltip «Недостаточно экспертов для Council» |
| Auto-suggest | Длинный текст / keywords «консенсус», «стратегия» → badge «Рекомендуем Council» на сегменте, **без auto-select** |
| Copy | Только Fast / Team / Council + время + уровень стоимости — **без чисел advisors** |
| Workflow override | Если ответ = workflow → показать workflow UI; copy: «Задача требует нескольких отделов — запущен Workflow» |

### 5.4 Dynamic estimate bar

Строка под сегментами обновляется при смене режима и (optionally) при blur input:

- Fast: `Fast · ~5 сек · экономичный режим`
- Team: `Team · ~15 сек · несколько экспертов`
- Council: `Council · ~45 сек · премиум · потребует подтверждения`

---

## 6. Council Confirmation Gate — выбранная интерпретация

### 6.1 Решение: **(а) UX-подтверждение пользователя перед дорогим запросом**

**Council Confirmation Gate** в W10B — это **не** технический voting-механизм между агентами и **не** server-side authorization gate.

Это **продуктовый friction point**: модальное окно, которое останавливает пользователя перед запуском дорогого и долгого Council run.

### 6.2 Почему (а), а не (б) или (в)

| Интерпретация | Вердикт | Обоснование |
|---|---|---|
| **(а) UX-подтверждение** | ✅ **Выбрано** | Council — premium mode с ~10–20× cost vs Fast. Пользователь должен **осознанно** согласиться. Паттерн знаком (AWS destroy confirm, Stripe large payment). Реализуется чисто на UI без новых backend primitives. |
| **(б) Technical consensus gate между агентами** | ❌ | Это уже делает `/api/consensus` **после** сбора ответов. Дублирование создаёт путаницу: «gate» звучит как pre-execution, а consensus — post-execution. Voting rounds / debate — post-W10B, не MVP. |
| **(в) Server-side budget/rate gate** | ⏸ Defer W12 | Нужен auth + billing. Не блокирует MVP; добавляется при commercial launch. |

### 6.3 Конкретная реализация (W10B)

**Trigger:** пользователь нажал Send при selected mode = Council **ИЛИ** переключился на Council и нажал Send.

**Modal:**

```
┌─ Заседание совета ──────────────────────────────┐
│                                                  │
│  Council — режим максимального качества.         │
│  Будет привлечён полный состав экспертов         │
│  отдела и подготовлен структурированный отчёт.   │
│                                                  │
│  ⏱ ~45 сек    💰 премиум-уровень                 │
│  📍 Отдел: Instagram                             │
│                                                  │
│         [ Отмена ]    [ Начать Council ]         │
└──────────────────────────────────────────────────┘
```

**Правила:**

- Team и Fast — **без** modal
- «Don't ask again» — **не в W10B** (каждый Council run подтверждается)
- Cancel → остаёмся в Council mode, input не очищается
- Confirm → обычный send flow

**Что НЕ входит в Gate:**

- Pre-flight проверка API keys (server error handling — отдельно)
- Agent-to-agent voting до начала execution
- Billing hold / credit reservation

---

## 7. Team / Council Canvas Visualization — конкретный вариант

### 7.1 Принцип: **reuse W4 dimming + extend agent node states**

Не строить отдельный canvas mode. Расширить существующий `WorkspaceRouteContext` новым highlight type: `executionHighlight`.

### 7.2 Состояния (единые для Team и Council)

| Visual state | CSS / class | Когда |
|---|---|---|
| `idle` | default | До send |
| `routing` | W4 path glow начинается | После routing |
| `executing` | advisor node amber pulse | Advisor invoked, ждём ответ |
| `complete` | brief green flash → hold | Ответ получен |
| `error` | red ring | Advisor failed |
| `dimmed` | opacity 40–60% | Non-participating nodes |

### 7.3 Различие Team vs Council на canvas

| Signal | Team | Council |
|---|---|---|
| Active advisors | 2–3 nodes pulsing | Many nodes pulsing (roster-dependent) |
| City Hall | Static or small «Team» chip | **Pulsing ring** + label «Council in session» |
| Dim strength | 50% non-participants | 40% — stronger focus |
| Sidebar sync | «2 из 3 готовы» | «7 экспертов готовы · синтез…» |
| Duration feel | ~15s — короткие pulses | ~45s — sustained animation |

### 7.4 City Hall «Council in session»

Overlay на `CityHallNode` (не новая entity):

- Amber outer ring animation (CSS `@keyframes`)
- Text badge: «Council» (не число участников)
- Auto-remove через 4s после report delivery (same as W4 hold)

### 7.5 Post-execution

- Все participating advisors: hold highlight 4s → fade (reuse W4 timer pattern)
- User может кликнуть advisor → W8 Inspector
- Workflow replay (W7) — **не затрагивается**, orthogonal path

---

## 8. Council Report Format — конкретный вариант

### 8.1 Schema: reuse existing `AnalysisReport`

```typescript
// lib/api-types.ts — без изменений
{
  consensus: string;
  differences: string;
  bestAnswer: string;
  finalVerdict: string;
  bestModel?: string;
}
```

Produced by `/api/consensus` (Claude Sonnet). **Новая schema не нужна.**

### 8.2 Presentation: reuse `AnalysisReportPanel` с workspace theme

**Layout в sidebar** (scrollable, dark theme):

```
┌─ Council Report ────────────────────────────────┐
│ Заседание завершено · 52 сек · премиум         │
├─────────────────────────────────────────────────┤
│ ▾ Consensus                                      │
│   «Эксперты согласны, что…»                      │
├─────────────────────────────────────────────────┤
│ ▸ Differences                                    │
├─────────────────────────────────────────────────┤
│ ▸ Best Answer                                    │
├─────────────────────────────────────────────────┤
│ ▾ Final Verdict  ★                               │
│   «Рекомендуется…»                               │
├─────────────────────────────────────────────────┤
│ Участники: Claude, GPT, Mistral, … (expand)     │
└─────────────────────────────────────────────────┘
```

### 8.3 Team mode report (subset)

| Element | Team |
|---|---|
| Summary | 1 paragraph (consensus + verdict condensed) |
| Per-expert | Accordion «Эксперт A / B / C» |
| Full 4-block report | Hidden behind «Показать полный анализ» (optional W10B) |

### 8.4 Product copy rules

- Заголовок: **«Council Report»** / **«Отчёт совета»** — не «AnalysisReport» / «Consensus API result»
- Footer: время + уровень стоимости — **не** raw token counts в primary view (tokens — expand «Детали»)
- `bestModel` → «Лучший ответ: Claude» (human name)

---

## 9. W10B MVP — scope

### 9.1 ✅ Входит

| # | Deliverable |
|---|---|
| 1 | **Mode Selector** (segmented control, Fast default) — §5 |
| 2 | **Dynamic estimate bar** (время + уровень стоимости, без чисел advisors) |
| 3 | **Council Confirmation Gate** — UX modal (а) — §6 |
| 4 | Server-side parallel execution для Team и Council (port Mission Control pattern) |
| 5 | Fast = explicit single-advisor path (текущее поведение + mode label) |
| 6 | `/api/consensus` для Council (required) и Team (optional, ≥2 answers) |
| 7 | **TeamAnswersPanel** в sidebar |
| 8 | **Council Report** via `AnalysisReportPanel` reuse — §8 |
| 9 | **Canvas execution highlight** — §7 |
| 10 | Post-flight footer: время + tier level (не USD) |
| 11 | Workflow path **без изменений** + explicit UI copy при override |
| 12 | Team disabled + tooltip если roster <2; Council disabled + tooltip если roster <3 |
| 13 | Evidence: `docs/evidence/w10b/` + regression W4–W9 |

### 9.2 ❌ Не входит

| # | Deferred |
|---|---|
| 1 | Context Preview / explainability panel (W10C) |
| 2 | `routing_logs` / `connection_logs` UI |
| 3 | Async chat / job queue / SSE streaming |
| 4 | Auto-mode без explicit selector (`estimateAgentCount` silent) |
| 5 | Workflow step × Team/Council (parallel per step) |
| 6 | Agent debate rounds / voting protocol |
| 7 | Server-side budget gate (в) — W12 commercial |
| 8 | Token persistence in DB / USD billing |
| 9 | Mode persistence per user / org |
| 10 | Mission Control ↔ Workspace canvas link |
| 11 | City View execution visualization |
| 12 | Mayor as DB entity |

---

## 10. Финальный вопрос: MVP без миграций и без рефакторинга Workflow Engine?

### Ответ: **Да.**

### Обоснование

**Схема БД — изменения не требуются**

| Потребность | Существующее |
|---|---|
| Какой режим был | `routing_logs.agent_count` (1/3/11) + client `executionMode` in memory |
| Кто участвовал | N rows в `request_logs` |
| Tier | `agents.cost_tier` |
| Report | Response payload; `AnalysisReport` in JSON |
| Workflow | `workflows` + `workflow_steps` — untouched |

**Workflow Engine — рефакторинг не требуется**

Добавляется **новая ветка** в orchestration layer (`executeChatTask` или extracted helper), не модификация planner/executor:

```
processTask()
  ├─ needsWorkflow? → executeWorkflow()     ← БЕЗ ИЗМЕНЕНИЙ
  └─ single chamber task
        ├─ mode=fast    → 1 advisor
        ├─ mode=team    → parallel + optional consensus
        └─ mode=council → parallel + required consensus
```

`planWorkflow()`, `executeWorkflow()`, `workflow-planner.ts`, `workflow-executor.ts` — **не трогаем**.

**Что потребуется в W10B (код, не spec)**

- UI components (§5, §6, §7, §8) — ~400–600 LOC
- Server parallel orchestration — ~100–200 LOC (pattern from Mission Control)
- Extended response types — type union only
- Canvas highlight extension — ~80–120 LOC

**Estimated effort:** 2–3 dev-weeks (M).

**Risks**

| Risk | Mitigation |
|---|---|
| `/api/chat` timeout ~60s on Council | Increase server timeout in W10B; async in W10C |
| Partial advisor failures | Report from ≥2 answers; show roster with errors |
| User confusion Mode vs Workflow | Explicit copy (§5.3) |

---

## Связанные документы

- [`docs/post-w8-strategic-review.md`](post-w8-strategic-review.md)
- [`docs/fast-team-council-design-review.md`](fast-team-council-design-review.md)
- [`docs/evidence/w9/report.json`](evidence/w9/report.json)

---

*W10A — продуктовая спецификация. Реализация — W10B после approval.*
