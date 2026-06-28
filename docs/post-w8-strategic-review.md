# Post-W8 Strategic Review

**Дата:** 2025-06-23  
**Статус:** после завершения W8 (Inspector / Observability)  
**Основа:** код проекта, миграции Supabase, API routes, evidence W1–W8, архитектурный аудит 2025-06-23

---

## 1. Что уже построено

### Backend и data layer

| Область | Состояние | Источник |
|---|---|---|
| Иерархия City → Building → Chamber → Agent | `entity_registry`, `chambers`, `agent_assignments` | migrations Sprint 1–2 |
| Позиции building (shared 2D/3D) | `office_objects.position_x/z`, `size_w/d` | `20250622160000_office_rooms.sql` |
| Позиции chamber (building-local) | `chambers.x/z/width/depth` | `20250622200000_entity_hierarchy.sql` |
| Позиции agent внутри chamber | `agent_assignments.layout_x/y` | `20250622900000_agent_assignment_layout.sql` |
| Connections + permissions | `connections`, `connection_permissions`, `connection_logs` | Sprint 4 |
| Routing engine | `resolveRoute()` — rule-based → LLM → fallback | `lib/routing.ts` |
| Workflow engine | `planWorkflow()` → `executeWorkflow()` | Sprint 5 |
| Context engine | `buildContext()` — vertical + horizontal context | `lib/entity-registry.ts` |
| Unified chat | `POST /api/chat` → `executeChatTask()` | Phase 0 audit → реализовано |
| Rules / Knowledge CRUD | `/api/rules`, `/api/knowledge` | Sprint 2 |
| Feedback | `routing_outcomes`, feedback tables | Sprint 6 |
| City Hall layout | `offices.workspace_meta` | W1 migration |

**45 API routes** — thin-client архитектура без `/api/workspace/*`.

### Интерфейсы

| Экран | Назначение | Статус |
|---|---|---|
| `/` (Mission Control) | Multi-agent parallel queries, analyzer hub, workflow panel | Production-grade prototype |
| `/floor` (City View 3D) | Use Mode, Edit Mode (Build / Communications), 3D city | Работает, visual modes исправлены |
| `/workspace` | Primary 2D canvas — основной рабочий UX | **W1–W8 завершены** |
| `/control`, `/structure`, `/connections`, `/agents` | Admin / debug CRUD | Сохранены без изменений |

### Workspace Canvas — этапы W1–W8

| Phase | Результат | Evidence |
|---|---|---|
| **W1** | React Flow canvas, pan/zoom, City Hall draggable, load buildings | ✅ |
| **W2** | Building CRUD on canvas (create, rename, resize, delete) | ✅ |
| **W3** | Nested chambers (`parentId`), CRUD inside building | `docs/evidence/w3/` |
| **W4** | Chat sidebar + `POST /api/chat` + single-step route highlight | `docs/evidence/w4/` |
| **W5** | Agents: drop, move, remove assignment | `docs/evidence/w5/` |
| **W6** | Visual connections, permissions, hover tooltip, route-via-connection | `docs/evidence/w6/` |
| **W7** | Workflow step animation (sequential canvas replay) | `docs/evidence/w7/` |
| **W8** | Inspector Panel — Observability layer | `docs/evidence/w8/` |

### Архитектурные инварианты (сохранены)

- Thin client: workspace использует существующие API, не дублирует backend.
- Координаты building shared с 3D через `office_objects`.
- Chamber coordinates — building-local (подтверждено аудитом + `lib/floor-chamber-position.ts`).
- Single hardcoded office: `f47ac10b-58cc-4372-a567-0e02b2c3d479`.

---

## 2. Какие возможности появились после W8

W8 — не просто properties panel, а **первый слой Observability**.

### Для пользователя

- **Единая точка инспекции:** клик на City Hall, Building, Chamber, Agent или Connection → правая панель Inspector (320px).
- **Observability без admin-страниц:** rules, knowledge, routing, connections, assignments — на canvas, без перехода в `/structure` или `/connections`.
- **Knowledge Sources:** информационный блок происхождения знаний (Inherited from City / Building, Local Chamber Knowledge).
- **Chamber routing:** редактирование `routing_description` только для Chamber; City/Building — read-only.
- **Connection management:** edge click → Inspector → permissions PATCH + Delete Connection (W6 hover tooltip сохранён).
- **Agent popover W5 удалён** — Inspector как единственная точка просмотра.

### Для архитектуры

- **`InspectorTarget`** (`lib/workspace/inspector-target.ts`) — стабильный union-тип selection handle, переиспользуемый в City View.
- **`WorkspaceSelectionContext`** — shared selection state + canvas snapshot + actions registry.
- **`loadInspectorData()`** — orchestration parallel fetch через существующие API.
- **Context Preview сознательно отложен** — Inspector описывает объект, не отладку Context Engine.

### Что изменилось в продуктовой модели

До W8: canvas = **конструктор** (строить, соединять, чатить).  
После W8: canvas = **конструктор + observability** (понимать, почему объект так настроен и что он «знает»).

---

## 3. Что остаётся незавершённым для MVP

Исходный MVP scope (`docs/workspace-architecture.md`): **W1–W4** — canvas, buildings, chambers, chat, route highlight.  
**Canvas MVP превышен** (W5–W8 реализованы). Но **product MVP** (готовность к реальным пользователям) — нет.

### Критичные gaps (блокеры production)

| Gap | Статус в коде | Impact |
|---|---|---|
| **Auth / sessions** | `middleware.ts` не найден; RLS policies = `USING (true)` | Любой с URL имеет полный доступ |
| **Multi-tenant** | Single office UUID hardcoded | Один город на deployment |
| **Async chat** | `POST /api/chat` блокирует на `executeWorkflow()` | Timeout на длинных workflow |
| **Error recovery UX** | Errors в sidebar/console | Нет retry, нет graceful degradation |

### Functional gaps (workspace как primary UX)

| Gap | Детали |
|---|---|
| **Multi-select** | Не реализован (запланирован W9) |
| **Building↔Building connections на canvas** | W6: chamber↔chamber only; building-level edges — post-MVP по архитектуре |
| **Connection types whitelist** | API принимает любые пары `entity_registry`; canvas не ограничивает |
| **Undo / redo** | Не найдено |
| **Minimap / search** | Не найдено |
| **Keyboard shortcuts** | Не найдено |
| **Large graph performance** | Не тестировалось на 100+ buildings / 1000+ chambers |
| **Explainability** | `routing_logs`, `connection_logs` есть в БД; UI в workspace — нет |
| **Context Preview** | `buildContext()` работает в runtime (`invoke-agent.ts`); UI отложен |

### Engine gaps (из архитектурного аудита)

| Gap | Детали |
|---|---|
| **Multi-level process chains** | Mayor → Advisors → Director — не поддерживается; workflow = flat chamber steps |
| **`manager_agent_id`** | Колонка в `chambers`; в routing/workflow не используется |
| **Dual connection models** | `connections` (Sprint 4) + `office_links` (legacy hub cables) — параллельно |
| **Virtual chambers** | Chambers без `chambers` row не попадают в canvas replay (W7 limitation) |
| **City View ↔ Workspace** | Два независимых UI; `InspectorTarget` готов, интеграция — нет |

### MVP cut line (рекомендация)

**Workspace Feature MVP** — ✅ достигнут (W1–W8).  
**Product MVP** — требует минимум: auth, один стабильный chat mode, onboarding template, error handling, базовая explainability.

---

## 4. Что входит в W9

По `docs/workspace-architecture.md` и текущему backlog:

### Scope W9: Canvas UX Polish

| Feature | Описание |
|---|---|
| **Multi-select** | Выбор нескольких nodes; batch operations (delete, move) |
| **Keyboard shortcuts** | Delete, Escape (deselect), Connect mode toggle, zoom fit |
| **Selection UX** | Marquee select, Shift+click additive select |
| **Visual polish** | Snap-to-grid (optional), alignment guides, minimap |
| **Inspector integration** | Multi-select → Inspector показывает summary или «N objects selected» |
| **Regression** | W4–W8 evidence scripts остаются green |

### Явно не входит в W9

- Context Preview / `buildContext()` UI
- Auth / multi-tenant
- City View integration
- Fast / Team / Council modes как UX
- Новые таблицы / `/api/workspace/*`

**STOP-критерий W9:** multi-select работает для building/chamber/agent; keyboard shortcuts documented; evidence `docs/evidence/w9/`.

---

## 5. Что потребуется для режимов

В коде уже есть **heuristic foundation** в `estimateAgentCount()` (`lib/routing.ts`):

| Heuristic | `agentCount` | Триггер |
|---|---|---|
| Short simple query | **1** | `< 50 chars`, no `?`, no conjunctions |
| Medium complexity | **3** | default |
| Urgent / consensus / long | **11** | keywords: «срочно», «консенсус», «совет»; или `> 500 chars` |

Сейчас heuristic влияет на `RouteDecision.agentCount`, но **workspace chat** (`WorkspaceChatSidebar`) всегда идёт через `executeChatTask()` → single agent или workflow — **не fan-out на N агентов**.

Mission Control (`/`) уже реализует parallel multi-agent через client-side fan-out к `/api/ask-*`.

### Fast Mode

**Продуктовая модель:** один вопрос → один agent → быстрый ответ.

| Компонент | Требуется |
|---|---|
| UX | Mode toggle в chat sidebar; default mode |
| Routing | `agentCount: 1` explicit; skip workflow planner для simple queries |
| Canvas | Single-step highlight (W4 — уже есть) |
| Performance | Streaming response (SSE); сейчас sync POST |
| Context | `buildContext()` для одного agent — работает |
| Cost control | Token budget per request; model tier selection |

**Effort:** Medium (mostly UX + streaming; backend mostly ready).

### Team Mode

**Продуктовая модель:** задача → 3 агента параллельно → aggregated answer.

| Комponent | Требуется |
|---|---|
| UX | «Team» badge; 3 agent cards в sidebar; synthesis panel |
| Backend | `resolveAgentIdsForTarget(targetId, agentCount=3)` — есть в `lib/route-agent-ids.ts` |
| Execution | Parallel `invokeAgentForWorkflow()` × 3; merge/synthesize step |
| Canvas | Highlight 3 agents simultaneously |
| Aggregation | LLM synthesis of 3 answers (новый orchestration step) |
| Inspector | Show which agents participated |

**Effort:** Large (aggregation layer + parallel execution + UX).

### Council Mode

**Продуктовая модель:** сложная задача → до 11 advisors → consensus / debate → final decision.

| Компонент | Требуется |
|---|---|
| UX | Council chamber visualization; step-by-step debate timeline |
| Backend | `agentCount: 11`; chamber must have ≥ N assignments |
| Execution | Sequential or parallel rounds; voting / ranking mechanism |
| Workflow | Extend `workflow-planner` for multi-agent steps per chamber |
| Canvas | W7 animation × N agents; chamber glow intensity by consensus |
| Governance | Rules for when council mode activates (explicit toggle vs auto) |
| Cost | 11× token cost; budget caps mandatory |

**Effort:** XL (new orchestration paradigm; Mission Control is closest prototype but not integrated with workspace).

### Общее для всех режимов

```
Mode Selection → processTask(mode) → resolveRoute(agentCount) → execute(mode-specific) → Canvas highlight + Inspector log
```

Deferred from W8: **Orchestrator / Explainability layer** — natural home for mode selection, context preview, routing decision transparency.

---

## 6. Что потребуется для City View

City View (`/floor`) и Workspace (`/workspace`) — **два представления одной модели**, пока не связанные.

### Уже готово для интеграции

- Shared coordinates: building via `office_objects`, chamber building-local.
- `lib/floor-chamber-position.ts` — единый helper координат (Use Mode / City View).
- `InspectorTarget` — stable selection type для обоих view.
- `connections` через `entity_registry` — единая модель связей (Sprint 4).
- Communications Mode L1 edges — исправлены (chamber-accurate positions).

### Требуется построить

| Область | Работа |
|---|---|
| **Unified selection bus** | `WorkspaceSelectionContext` → generic `CitySelectionContext` или shared provider |
| **Inspector reuse** | `WorkspaceInspector` рендерится в City View sidebar (2D overlay или panel) |
| **Navigation** | City View zoom → Building → Use Mode ↔ Workspace focus on same building |
| **2D/3D parity** | Selection in 3D highlights same entity in Inspector; bi-directional |
| **Communications refactor** | Единый graph traversal через `entity_registry` (аудит: сейчас hybrid queries) |
| **`office_links` deprecation** | Migrate legacy hub cables → `connections` or hide in UI |
| **FloorViewState cleanup** | ~15 flags → explicit view state type (частично прокомментировано) |
| **Performance** | City View with 100+ buildings: LOD, lazy chamber load, instancing |

### City View ≠ Workspace duplicate

City View — **spatial / immersive** (3D navigation, Use Mode inside building).  
Workspace — **structural / editorial** (nested graph, connections, inspector).  
Product vision: **один Inspector, два viewport'а**.

**Effort:** Large (W11-class epic).

---

## 7. Что может стать первой коммерческой версией продукта

### Рекомендация: «AI Council Workspace — Starter»

**Positioning:** Visual AI operations canvas для одной команды / одного проекта.

### Включено в v1.0

| Feature | Обоснование |
|---|---|
| `/workspace` as primary entry | W1–W8 complete; лучший UX |
| **Fast Mode** chat | Lowest cost, fastest time-to-value |
| Inspector (W8) | Self-service configuration without admin pages |
| 1 City + до 5 Buildings + до 20 Chambers | Scope limit per account |
| Chamber routing + rules + knowledge | Core differentiation vs ChatGPT Teams |
| Visual connections (chamber↔chamber) | «Кабель = контракт» — уникальная метафора |
| Single-step route highlight | Immediate feedback loop |
| Supabase Auth + RLS per office | Minimum security bar |

### Исключено из v1.0 (upsell / v1.1+)

| Feature | Причина defer |
|---|---|
| Council Mode (11 agents) | Cost + complexity |
| Team Mode (3 agents) | v1.1 — natural upgrade |
| Workflow animation (W7) | v1.1 — «Pro» feature |
| City View 3D | v1.2 — enterprise tier |
| Multi-tenant admin | v1.2 |
| Context Preview / Explainability | v1.1–v1.2 |

### Monetization hooks

- **Free:** 1 building, 3 chambers, Fast Mode only, 100 requests/month.
- **Pro:** unlimited chambers, Team Mode, connections, workflow, Inspector edit.
- **Enterprise:** Council Mode, City View, SSO, audit logs, custom models.

### Minimum engineering before launch

1. Supabase Auth + office-scoped RLS  
2. Fast Mode UX in workspace chat (explicit, default)  
3. Streaming responses  
4. Onboarding template («Create your first Building»)  
5. Error boundaries + loading states polish  
6. Remove hardcoded office ID → user-scoped office  

**Estimated:** 3–4 weeks after W9.

---

## 8. Рекомендованный roadmap

### W9 — Canvas UX Polish (2–3 dev-weeks)

- Multi-select + marquee + Shift+click  
- Keyboard shortcuts (Delete, Escape, Connect toggle, Fit view)  
- Minimap (React Flow `MiniMap`)  
- Inspector: multi-select summary state  
- Evidence: `docs/evidence/w9/`  

**Outcome:** Workspace feels like Miro-class tool.

---

### W10 — Orchestrator & Explainability (3–4 dev-weeks)

- Mode selector: Fast / Team / Council (Council disabled or beta)  
- **Context Preview** (deferred from W8): read-only `buildContext()` summary in Inspector for Agent/Chamber  
- Routing decision panel: method, confidence, `routing_logs` timeline  
- Connection activity: `connection_logs` in Connection Inspector  
- Workflow run history: link chat message → workflow record  
- Async `POST /api/chat` for workflow mode (job queue or streaming)  

**Outcome:** User understands *why* the system routed and *what* context the agent saw.

---

### W11 — City View Integration (4–5 dev-weeks)

- Shared `InspectorTarget` + Inspector panel in `/floor`  
- Click entity in 3D → Inspector; click in Workspace → same Inspector state (if same session)  
- Unified navigation: Workspace «Open in 3D» / City View «Edit in Workspace»  
- Communications graph refactor (single `entity_registry` traversal)  
- Deprecate or hide `office_links` in UI  
- Building↔Building connections on workspace canvas  

**Outcome:** One product, two views; 3D becomes presentation layer, not separate app.

---

### W12 — Production & Modes (4–6 dev-weeks)

- Supabase Auth + multi-tenant (office per user/org)  
- RLS policies (replace `USING (true)`)  
- **Fast Mode** production-ready (streaming, rate limits)  
- **Team Mode** (parallel 3 agents + synthesis)  
- Onboarding flow + city template  
- Performance: canvas virtualization for large graphs  
- Monitoring: request_logs dashboard, cost tracking  
- Beta launch checklist  

**Outcome:** First commercial version (Starter tier) ready for external users.

---

## Summary Matrix

| Dimension | Now (post-W8) | After W12 |
|---|---|---|
| Canvas editor | ✅ Full | ✅ Polished |
| Observability | ✅ Inspector v1 | ✅ + Explainability |
| Chat | ✅ Single + Workflow | ✅ Fast/Team modes |
| 3D City View | ✅ Separate | ✅ Integrated |
| Security | ❌ Open | ✅ Auth + RLS |
| Commercial | ❌ Internal tool | ✅ Starter tier |

---

## Связанные документы

- [`docs/workspace-architecture.md`](workspace-architecture.md) — approved architecture, W1–W9 scope  
- [`docs/control-api-audit.md`](control-api-audit.md) — API reuse map  
- [`docs/evidence/w8/report.json`](evidence/w8/report.json) — W8 acceptance evidence  
- Архитектурный аудит 2025-06-23 (chat transcript) — ER diagram, 45 endpoints, scalability risks  

---

*Документ подготовлен для согласования приоритетов W9+. Не является commitment — scope W10–W12 subject to review after W9.*
