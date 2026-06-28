# Visual Workspace Canvas — архитектурное предложение

Документ для согласования **до** начала реализации `/workspace`.

Статус: **approved** (2025-06-22)  
Дата: 2025-06-22

### Решения (согласовано)

| # | Вопрос | Решение |
|---|---|---|
| 1 | Координаты Building | **Общие с 3D** — `office_objects`, без отдельного workspace layout |
| 2 | City Hall | **Draggable** через `offices.workspace_meta` |
| 3 | Agent position | **`agent_assignments.layout_x/y`** (Phase W5+, вне MVP) |
| 4 | Connection types | **Поэтапно** — MVP: Building↔Building, Chamber↔Chamber only |
| 5 | MVP scope | **W1–W4**: canvas, buildings, chambers, chat, route highlight |
| 6 | Bounds | **Workspace unbounded**; clamp только в 3D render |

**Следующий шаг:** W3 ✅ → W4 (chat sidebar + route highlight).

---

## 1. Оценка объёма работ

### Что уже есть (можно переиспользовать без нового backend)

| Область | Состояние |
|---|---|
| Сущности city → building → chamber → agent | `entity_registry`, `chambers`, `agent_assignments` |
| Позиция/размер building | `office_objects.position_x/z`, `size_w/d` (type `room`) + sync с `entity_registry` |
| Позиция/размер chamber (внутри building) | `chambers.x/z/width/depth` (building-local) |
| Связи + permissions | `connections`, `connection_permissions` — любые пары `entity_registry.id` |
| Rules / knowledge | `GET/POST /api/rules`, `/api/knowledge` |
| Chat end-to-end | `POST /api/chat` → `processTask` → agent / workflow |
| Admin UI для отладки | `/control`, `/structure`, `/connections`, `/agents` |

### Чего нет (нужно построить)

| Область | Gap |
|---|---|
| Страница `/workspace` | Нет |
| Infinite canvas (pan/zoom/drag/resize/selection) | Нет 2D-движка |
| Nested UI: building ⊃ chamber ⊃ agent | Нет |
| Visual connection editor | Есть API, нет canvas-редактора |
| Позиция агента **внутри** chamber | Нет колонок в БД |
| PATCH chamber (move/resize/routing_description) | Только DELETE, нет update |
| PATCH building resize (`size_d`) | PATCH objects — position + label, без resize |
| City Hall как постоянный узел | City = `entity_registry` (office id), визуала нет |
| Подсветка маршрута при chat/workflow | Логика routing есть, canvas-highlight нет |
| Ослабление 3D bounds для бесконечного canvas | `office-bounds` ограничивает 220×160 |

### Объём (грубая оценка)

| Категория | Оценка |
|---|---|
| **MVP** (canvas + buildings + chambers + chat + базовый highlight) | **8–12 dev-days** |
| **Full spec** (+ agents DnD, all connection types, workflow animation, properties panels, multi-select) | **18–25 dev-days** |
| **Polish** (undo, minimap, keyboard, collision snap, edge routing) | **+5–8 dev-days** |

Это **крупный UI-проект** — сопоставим по объёму с `/floor`, но на другом стеке. Admin panel уже закрывает CRUD; workspace — новый primary UX-слой.

---

## 2. Предлагаемая библиотека

### Сравнение

| Критерий | **React Flow** (`@xyflow/react`) | **Konva** (`react-konva`) | **Excalidraw** | **Собственная** |
|---|---|---|---|---|
| Pan / Zoom | ✅ встроено | ✅ руками | ✅ | много работы |
| Drag & Drop узлов | ✅ | ✅ | ✅ | много работы |
| Nested nodes (building ⊃ chamber) | ✅ `parentId` / subflows | возможно, сложнее | ❌ не для этого | очень сложно |
| Edges / connections | ✅ handles, custom edges | рисовать самим | freehand, не typed graph | очень сложно |
| Multi-select | ✅ box + shift | частично | ✅ | с нуля |
| Привязка к typed backend entities | ✅ natural fit | neutral | ❌ sketch-first | полный контроль |
| Стиль Miro/FigJam | diagram-like | ближе к Miro | whiteboard | зависит |
| Bundle / learning curve | средний | средний | тяжёлый embed | — |
| React 19 / Next 15 | ✅ поддерживается | ✅ | ⚠️ embed awkward | — |

### Рекомендация: **React Flow (`@xyflow/react`)**

**Почему:**

1. Модель данных workspace — **граф с иерархией**, не свободный скетч. Building → Chamber → Agent maps directly to parent/child nodes.
2. Connections уже хранятся как directed edges между `entity_registry` id — React Flow edges + custom edge component.
3. Pan/zoom/selection/multi-select — out of the box.
4. Подсветка маршрута = временная смена `className`/style на node ids из `routing.targets` или `workflow_steps`.
5. Excalidraw — неправильный инструмент (нет typed entity binding).
6. Konva — лучше для «чистого Miro», но edges, nesting, hit-testing, connection handles — **+2 недели** минимум.
7. Собственная реализация на SVG/Canvas — не оправдана при наличии React Flow.

**Компромисс:** визуально будет ближе к **Whimsical/diagram**, чем к Excalidraw. Для «Miro-feel» позже можно кастомизировать node chrome (rounded rects, shadows, grid background) без смены движка.

**Дополнения к React Flow:**

- `framer-motion` — уже в проекте, для highlight-pulse при routing
- `@reactflow/node-resizer` — resize building/chamber
- Grid background — `@reactflow/background`

---

## 3. Где хранить позиции и размеры

### Принцип: **одна сущность — один источник координат**, без `/api/workspace/*`

Workspace — thin client. Persist через **существующие таблицы + минимальные расширения**.

### 3.1 Building (проект)

| Поле | Таблица | Уже есть? |
|---|---|---|
| id (= entity_registry building id) | `office_objects.id` | ✅ |
| canvas position | `office_objects.position_x`, `position_z` | ✅ |
| canvas size | `office_objects.size_w`, `size_d` | ✅ |
| name | `office_objects.label` + `entity_registry.name` | ✅ |

**API:** `POST/PATCH/DELETE /api/offices/{officeId}/objects` (существующие).

**Конфликт с 3D `/floor`:** координаты **общие** — building на workspace = building на 3D-карте (инвариант sync, как в Control Panel).

**Бесконечный canvas:** сейчас PATCH проверяет `isRoomInBounds(220×160)`.  
**Предложение (на согласование):**

- **Вариант A (рекомендуемый):** убрать жёсткий bounds для `object_type=room` **или** ввести `coordinate_space: 'unbounded'` — 3D floor при рендере **clamp** координаты к видимой площадке, workspace — нет.
- **Вариант B:** отдельная JSONB `offices.workspace_layout` только для 2D → риск рассинхрона с 3D. **Не рекомендуем.**

### 3.2 City Hall

City Hall — **не отдельная запись building**, а визуальное представление city:

- Данные: `entity_registry` где `id = office_id`, `entity_type = 'city'`
- Routing: уже используется как mayor-level target

**Позиция City Hall:**

| Вариант | Плюсы | Минусы |
|---|---|---|
| **A. Фиксированный узел** (always top-center, не draggable) | Просто, нет миграции | Меньше гибкости |
| **B. `offices.workspace_meta` JSONB** `{ city_hall: { x, y, w, h } }` | Draggable, один city | Новое поле, не entity |
| **C. Специальный `office_objects` room** «City Hall» | Единая модель с buildings | Дублирует city entity, путаница |

**Рекомендация:** **B** — `offices.workspace_meta` только для city hall chrome + viewport. Не создавать fake building.

### 3.3 Chamber (отдел внутри building)

| Поле | Таблица | Уже есть? |
|---|---|---|
| position (local) | `chambers.x`, `chambers.z` | ✅ |
| size | `chambers.width`, `chambers.depth` | ✅ |
| routing_description | `entity_registry.routing_description` | ✅ |

**API gap:** нужен **`PATCH`** на существующем маршруте  
` /api/offices/{officeId}/buildings/{buildingId}/chambers/{chamberId}`  
(расширение shared route, не новый namespace).

Chamber coords остаются **building-local** — при resize building chamber nodes масштабируются относительно parent (React Flow parent node).

### 3.4 Agent (кружок внутри chamber)

| Поле | Таблица | Сейчас |
|---|---|---|
| assignment | `agent_assignments` | ✅ |
| position inside chamber | — | ❌ **нет** |

**Предложение (на согласование):**

```sql
ALTER TABLE agent_assignments
  ADD COLUMN layout_x DOUBLE PRECISION,
  ADD COLUMN layout_y DOUBLE PRECISION;
```

- Nullable → auto-layout при `NULL`
- Persist on drag end через **`PATCH /api/chambers/{chamberId}/assignments/{assignmentId}`** (расширить существующий route)
- DnD между chambers: `DELETE` old + `POST` new (или PATCH chamber_id если добавить — не обязательно)

**Альтернатива:** JSONB `chambers.agent_layout JSONB` `{ agent_id: {x,y} }` — хуже для query, лучше колонки на assignment.

**Unassigned agents:** palette sidebar — список из `GET /api/offices/{officeId}` agents минус assigned. Не хранить «плавающую» позицию до drop в chamber.

### 3.5 Connections (линии)

| Поле | Таблица |
|---|---|
| source / target | `connections.source_entity_id`, `target_entity_id` |
| permissions | `connection_permissions` |

**Визуальные waypoints** (изгиб линии): **Phase 2+**, хранить в `connections.visual JSONB` или не персистить (auto-routing edges). MVP — straight/step edges.

**Типы связей из спеки** (Building↔Building, Agent↔Chamber, …):  
уже возможны — все id из `entity_registry` (agents.id = registry id). **Миграция не нужна**, только UI validation какие пары имеют смысл.

### 3.6 Canvas viewport (pan/zoom пользователя)

| MVP | Post-MVP |
|---|---|
| `localStorage` key `workspace-viewport-{officeId}` | `offices.workspace_meta.viewport` |

---

## 4. Переиспользуемые компоненты и код

### Можно переиспользовать напрямую

| Артефакт | Как |
|---|---|
| `POST /api/chat`, `lib/execute-chat-task.ts` | Chat panel на workspace |
| `app/control/page.tsx` | Вынести chat UI → `WorkspaceChatPanel.tsx` |
| `lib/control-defaults.ts` | Default sizes при create |
| `app/connections/page.tsx` | Permissions checkbox UI → edge properties panel |
| `app/structure/page.tsx` | Логика rules/knowledge forms → chamber inspector |
| `components/mission/WorkflowPanel.tsx` | Step status labels/colors для workflow highlight |
| `components/mission/FeedbackBar.tsx` | Опционально в chat panel |
| `lib/floor-chamber-position.ts` | Адаптировать: local ↔ world coords (building parent offset) |
| `docs/control-api-audit.md` | Карта API endpoints |

### Не переиспользовать (другой стек / scope)

| Артефакт | Почему |
|---|---|
| `FloorScene`, Three.js, `FloorEditorCanvas` | 3D, другая модель interaction |
| `BuildingPanel` / `ChamberPanel` 3D | Тяжёлые, завязаны на floor state |
| `office_links` (legacy) | Отдельно от Sprint 4 `connections` |

### Новые компоненты (ожидаемые)

```
app/workspace/page.tsx
components/workspace/
  WorkspaceCanvas.tsx      # React Flow wrapper
  nodes/
    CityHallNode.tsx
    BuildingNode.tsx
    ChamberNode.tsx
    AgentNode.tsx
  edges/
    ConnectionEdge.tsx
  WorkspaceChatPanel.tsx
  ConnectionPropertiesPanel.tsx
  EntityInspectorPanel.tsx  # routing_description, rules, knowledge
lib/workspace/
  build-workspace-graph.ts  # DB rows → React Flow nodes/edges
  highlight-route.ts        # routing/workflow → node ids
```

---

## 5. Изменения в БД

### Минимальный набор (рекомендуемый для MVP)

| Изменение | Зачем | Обязательно? |
|---|---|---|
| `agent_assignments.layout_x`, `layout_y` | Позиция кружка агента | ✅ для agent layout |
| `offices.workspace_meta JSONB` | City Hall position + optional viewport | ✅ для City Hall |
| `connections.visual JSONB` | Edge waypoints | ❌ post-MVP |

### Расширения API (не новые namespaces)

| Route | Изменение |
|---|---|
| `PATCH .../objects/[objectId]` | + `size_w`, `size_d`; ослабить bounds для room |
| `PATCH .../chambers/[chamberId]` | **новый handler**: x, z, width, depth, name, routing_description |
| `PATCH .../assignments/[assignmentId]` | + layout_x, layout_y |
| `PATCH /api/offices/[officeId]` | + workspace_meta (optional) |

**Не создавать:** `workspace_objects`, `/api/workspace/*`, duplicate entity tables.

### Sync-инварианты (сохранить)

- Create building → `POST /api/offices/.../objects` (room) → auto `entity_registry`
- Create chamber → existing POST chambers route
- Assignment → existing agent_assignments routes
- Connection → existing `POST /api/connections`

---

## 6. Оценка сложности по этапам

Рекомендуемый порядок — **инкрементально проверяемый**, как Control Panel Phases 0–4.

| Phase | Scope | Сложность | STOP-критерий |
|---|---|---|---|
| **W0** | Согласование этого документа + выбор storage option | — | Подписанный decision log |
| **W1** | Canvas shell: React Flow, pan/zoom, grid, load buildings + City Hall | **M** | Здания видны, draggable, position persists via PATCH objects |
| **W2** | Building CRUD on canvas: create, rename, resize, delete | **M** | SQL: office_objects + entity_registry sync |
| **W3** | Nested chambers: create/move/resize inside building | **L** | PATCH chamber works, chambers persist in SQL |
| **W4** | Chat sidebar + `POST /api/chat` + single-step route highlight | **M** | Вопрос → ответ + подсветка target building/chamber |
| **W5** | Agents: palette, drop into chamber, move, remove assignment | **M–L** | agent_assignments + layout_x/y in SQL |
| **W6** | Connections: draw edge, permissions panel, existing API | **L** | POST /api/connections from canvas gesture |
| **W7** | Workflow highlight (multi-step animation) | **M** | Steps pulse in order during/after workflow |
| **W8** | Inspector: routing_description, rules, knowledge | **M** | Edit persists via existing rules/knowledge API |
| **W9** | Multi-select, keyboard, polish | **M** | Nice-to-have |

**Legend:** S = 1–2d, M = 3–5d, L = 5–8d

### Риски

| Риск | Mitigation |
|---|---|
| Bounds conflict 3D vs infinite 2D | Variant A: unbounded rooms + 3D clamp |
| Nested drag performance | React Flow parent nodes, limit re-renders |
| Agent parent_entity_id = city, not chamber | Routing uses assignments; visual parent = chamber node only |
| Connection source/target hit testing | Handles on node borders, snap to entity_registry id |
| Large graph UX | Minimap, collapse building, lazy-load chamber details |

---

## 7. Открытые вопросы для согласования

1. **Координаты building:** общие с 3D (recommended) или отдельный workspace layout?
2. **City Hall:** fixed vs draggable (`workspace_meta`)?
3. **Agent position:** колонки на `agent_assignments` vs JSON на chamber?
4. **Connection types:** разрешить все пары entity_registry или whitelist (e.g. block Agent→Agent initially)?
5. **MVP cut line:** W1–W4 first (без agents/connections on canvas) vs full W1–W6?
6. **Удаление building/chamber:** confirm cascade behavior (entity_registry ON DELETE CASCADE)?

---

## 8. Решение после согласования

После ответов на §7 — зафиксировать в `docs/workspace-architecture.md` (status: **approved**) и начинать **W1** без `/api/workspace/*`.

Admin pages (`/control`, `/structure`, …) остаются без изменений; в `ControlShell` добавить ссылку на `/workspace`.
