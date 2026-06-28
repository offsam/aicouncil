# Три точки входа задачи — спецификация для ревью

**Дата:** 2026-06-24  
**Тип:** продуктовая спецификация (без кода, без миграций)  
**Контекст:** Workspace `/workspace` — City → Building → Chamber → Agent. Mayor Chat уже работает как городской вход. Этот документ описывает три способа отправки задачи и что нужно для каждого.

**Связанные документы:** [`w10-execution-modes-spec.md`](w10-execution-modes-spec.md), [`post-w8-strategic-review.md`](post-w8-strategic-review.md)

---

## 0. Три входа — кратко

| Вход | Кто получает текст | Маршрутизация | Контекст агента |
|---|---|---|---|
| **1. Город** | Mayor → `resolveRoute()` | Да (rules + LLM + General Intake fallback) | `buildContext()` для выбранного chamber |
| **2. Здание** | Все агенты здания параллельно | Нет (пользователь уже выбрал здание) | `buildContext()` per agent |
| **3. Агент** | Один выбранный агент | Нет | `buildContext(agentId, { chamberRegistryId })` — минимальный путь |

---

## 1. Городской уровень (уже есть)

### Что уже есть

- `WorkspaceMayorChat` — чат снизу canvas, виден на уровне всего города.
- `executeChatTask()` → `resolveRoute()` → Fast/Team/Council или Workflow.
- Canvas feedback: `WorkspaceRouteContext`, подсветка маршрута, execution progress.
- `routing_logs` — логирование каждого решения маршрутизации.
- General Intake (`c0000000-0000-4000-8000-000000000000`) — fallback, если правила и LLM не дали уверенной цели.

### Что переиспользовать без изменений

- Весь pipeline Mayor → routing → execution modes.
- `mission-workspace-bridge` для переноса pending route между вкладками.

### Стоимость / скорость

- **Fast:** 1 агент, 1× routing (возможен LLM-cheap для маршрута) + 1× invoke — самый дешёвый городской путь.
- **Team / Council:** routing + N параллельных invoke + синтез/consensus — дороже и дольше, как в W10A.
- **Workflow:** routing planner + последовательные шаги — максимальная латентность.

### Риски

- Пересечение с входами 2 и 3: пользователь может не понимать, зачем Mayor, если уже кликнул на здание. Нужны явные UI-подсказки («в городской чат — маршрутизация; на здание — сразу всем»).

---

## 2. Уровень здания (новый UX)

### Продуктовое поведение

Пользователь кликает **на здание снаружи** (не заходя в chamber, не открывая комнату). Текст уходит **всем агентам всех chambers этого здания** как общая задача. Mayor и `resolveRoute()` **не вызываются**.

### Что уже есть в коде

- `executeParallelAgents()` — параллельный fan-out по chamber registry id.
- `selectAgentsForChamberEntity()` — выбор агентов по отделу.
- `BuildingNode` + Inspector/building selection — точка UI для «выбрано здание».
- Team/Council synthesis через `executeChatTask` (можно адаптировать aggregation).

### Что нужно добавить

| Компонент | Описание |
|---|---|
| **UI** | Поле ввода при выборе building (popover или sidebar), не путать с Mayor chat. |
| **API / handler** | Новый путь, например `executeBuildingTask(buildingId, text, mode?)`: собрать все chambers здания → для каждого chamber вызвать parallel или single agent → aggregate ответы. |
| **Canvas feedback** | Подсветка всего здания + всех chambers/agents, без route steps от City Hall. |
| **Стоимость** | Явный warning: «N отделов × M агентов» перед отправкой. |

### Стоимость / скорость

- **Дороже города Fast:** минимум «число chambers × 1 агент», при Team — «chambers × 3» и т.д.
- **Быстрее Council на городе:** нет LLM-маршрутизации, но wall-time = max(latency) по параллельным batch (может быть дольше Fast, если много отделов).
- Рекомендуемый default mode: **Fast per chamber** (1 агент на отдел) + краткий digest, не полный Council на каждый отдел.

### Риски

- Дублирование с Mayor + rule «всегда в это здание» — пользователь может получить два разных поведения.
- Workflow Engine не должен автоматически стартовать при building-level submit (это fan-out, не цепочка chambers).
- Нагрузка на провайдеров при большом здании — нужен cap (например max 11 agents total, как Council).

### Миграции / рефакторинг

**Не требуются.** Достаточно нового UI + server handler, собирающего chamber registry ids из `chambers` / `entity_registry` по `building_id`.

---

## 3. Уровень агента (частично есть)

### Продуктовое поведение

Пользователь заходит в chamber, выбирает агента, задаёт вопрос **напрямую**. Только `buildContext()` для этого агента. Без маршрутизации.

### Что уже есть

- `invokeAgentForWorkflow()` / `invokeChamberAgentWithFreeFallback()` — прямой вызов с контекстом.
- `AgentNode` + Inspector agent view — выбор агента на canvas.
- `app/api/offices/.../agents/.../context` — preview контекста.
- Floor `/floor` — AgentDetailPanel с контекстом (3D режим).
- `executeDirectAgentMode()` в `execute-chat-task.ts` (direct agent path).

### Что нужно добавить

| Компонент | Описание |
|---|---|
| **UI в Workspace** | Chat panel, привязанный к выбранному `AgentNode` (сейчас основной чат — Mayor). Может быть reuse Inspector + «Спросить агента» или отдельная нижняя панель при selection kind=agent. |
| **Wire-up** | Кнопка/поле → `executeDirectAgentMode` без `resolveRoute()`. |

### Стоимость / скорость

- **Минимальная:** 0× routing, 1× invoke, контекст только для одного агента и его иерархии.
- **Free fallback:** при ошибке основного агента — резервный `cost_tier=free` того же chamber (Часть 2 задачи).

### Риски

- Пользователь может не получить cross-chamber workflow, даже если задача это требует — нужна подсказка «для межотдельных задач используйте городской чат».
- Mayor chat остаётся default — agent chat не должен перехватывать фокус без явного выбора.

### Миграции / рефакторинг

**Не требуются.** Разводка существующих функций invoke + UI.

---

## 4. Сводная таблица реализуемости

| Вопрос | Ответ |
|---|---|
| Миграции БД? | **Нет** для всех трёх входов |
| Рефакторинг Routing Engine? | **Нет** — вход 2 и 3 его обходят |
| Рефакторинг Workflow Engine? | **Нет** — building fan-out отдельный handler |
| Новые таблицы? | **Нет** |
| Новый UI? | **Да** — building chat + agent chat (городской уже есть) |
| Новый API? | **Да** — один endpoint/handler для building-level task |

---

## 5. Рекомендуемый порядок внедрения

1. **Agent-level chat** — меньше всего новой логики, reuse `executeDirectAgentMode`.
2. **Building-level fan-out** — новый handler + cap + aggregation UI.
3. **Полировка** — подсказки, cost preview, разведение с Mayor.

---

## 6. Открытые вопросы для ревью

1. Building-level: один digest от «главного» агента здания или таблица ответов по отделам?
2. Нужен ли execution mode selector (Fast/Team) на building/agent входах или только Fast?
3. Должен ли building-level submit логироваться в `routing_logs` с method=`direct-building` (без LLM)?
