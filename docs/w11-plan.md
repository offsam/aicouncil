# W11 — Mission Control ↔ Workspace Canvas Link

**Статус:** draft для ревью  
**Дата:** 2026-06-24  
**Тип:** продуктовая спецификация + план шагов (без кода на этом этапе)  
**Основа:** код после W10B/W10C; deferred item из [`w10-execution-modes-spec.md`](w10-execution-modes-spec.md) §9.2 #10

---

## 0. Проблема

Сейчас в продукте **два независимых UI** одной и той же системы:

| Поверхность | URL | Что делает |
|---|---|---|
| **Mission Control** | `/` | Запуск multi-agent (fan-out к `/api/ask-*`), Analyzer Hub, `AnalysisReportPanel`, workflow panel |
| **Workspace (город)** | `/workspace` | Canvas City → Building → Chamber → Agent; чат Mayor с Fast/Team/Council |

**Связь сегодня минимальная:**

- Mission Control читает `sessionStorage.routingSourceEntityId` (chamber context для ask-*).
- Workspace Chat после `/api/chat` вызывает `applyChatRoute()` → подсветка пути на canvas (W4, расширено W10B).
- Mission Control **не вызывает** `applyChatRoute` и **не пишет** highlight state для Workspace.
- `DataFlowCanvas` в Mission Control — **декоративный SVG** (линии к Analyzer Hub), это **не** город.

**Пользовательский gap:** запуск в Mission Control не виден в городе — кажется, что «совет работает в другом приложении».

---

## 1. Цель W11

> При запуске агентов через Mission Control маршрут и участники **видны на Workspace canvas** — на том же building/chamber/agent, что и при Fast/Team/Council из чата.

### Что пользователь должен видеть

1. **Маршрут:** City Hall → Building → Chamber (как W4).
2. **Участники:** agent nodes в target chamber, которые реально ответили (или были запущены).
3. **Timing:** подсветка появляется **во время** или **сразу после** launch; hold + fade — тот же паттерн W4 (4s hold, 1s fade).
4. **Навигация:** из Mission Control — явная ссылка «Открыть в Workspace» (сейчас есть только «Открыть город →» на `/floor`).

### Что W11 **не** делает

| Out of scope | Почему |
|---|---|
| Fast / Team / Council orchestration | W10B закрыт; `executeChatTask`, `executeParallelAgents` — **не трогаем** |
| W10C Context Preview / last-run badge | **Не трогаем** |
| Миграции / новые таблицы | Bridge через client state + существующие lookup данные |
| Объединение `/` и `/workspace` в один экран | Отдельный epic |
| 3D City View (`/floor`) | Был «W11 City View» в strategic review — **отложено**; этот план только про **2D Workspace canvas** |
| Переписывание Mission Control fan-out на server-side | MC остаётся client fan-out; меняем только **side-effect → canvas** |
| Real-time SSE / websockets | Overkill для MVP |

---

## 2. Текущая архитектура (что уже есть и что переиспользуем)

### 2.1 Workspace highlight pipeline (W4 / W10B)

```
/api/chat → ExecuteChatTaskResult
    → WorkspaceChatSidebar.applyChatRoute(data)
    → resolveRouteHighlight(result, chambers, buildings, assignments)
    → WorkspaceRouteContext.setRouteHighlight({ steps, connectionIds })
    → WorkspaceCanvas useEffect → node classNames (workspace-route-node, dimmed, badges)
```

**Ключевые файлы (read-only для W11, кроме расширения context):**

| Файл | Роль |
|---|---|
| `lib/workspace/resolve-route-highlight.ts` | Строит `RouteHighlightStep[]` из `ExecuteChatTaskResult` |
| `components/workspace/WorkspaceRouteContext.tsx` | State, timers, `applyChatRoute`, workflow replay |
| `components/workspace/WorkspaceCanvas.tsx` | Применяет `activeRouteHighlight` к React Flow nodes/edges |
| `app/globals.css` | `.workspace-route-node`, `.workspace-node-route-highlight`, fade |

### 2.2 Mission Control launch pipeline

```
handleLaunch()
  → POST /api/workflows { taskText, sourceEntityId? }
  → { mode, decision, agentIds } | { mode: workflow, workflowId, steps }
  → parallel POST /api/ask-* per enabled agent
  → /api/consensus → AnalysisReportPanel
```

**Ключевые файлы:**

| Файл | Роль |
|---|---|
| `components/mission/MissionControl.tsx` | Orchestration UI, routing, fan-out |
| `components/mission/DataFlowCanvas.tsx` | Декоративные линии (не город) |
| `lib/routing-source-storage.ts` | `routingSourceEntityId` в sessionStorage |
| `app/api/workflows/route.ts` | Routing без execution highlight payload |

### 2.3 Разрыв

Mission Control **имеет** routing decision (`decision.targets`, `agentIds`, `routingLogId`), но **не имеет** доступа к `WorkspaceRouteContext` (другая страница, другой React tree).

**Вывод:** нужен **cross-page bridge** — тот же паттерн, что уже используется для `routingSourceEntityId`.

---

## 3. Предлагаемое решение — «Pending Route Bridge»

### 3.1 Идея

Mission Control после успешного routing **сериализует** минимальный highlight payload в `sessionStorage`.  
Workspace при загрузке (или при focus) **читает** payload и вызывает существующий highlight pipeline.

```
Mission Control (/)
  handleLaunch → routing OK
    → write sessionStorage["workspacePendingRoute"]
    → optional: link "View in Workspace"

Workspace (/workspace)
  WorkspaceRouteProvider mount + registerRouteLookup (chambers loaded)
    → read pending payload
    → resolveMissionRouteHighlight(payload, lookup)
    → setRouteHighlight (reuse W4 timers)
    → clear sessionStorage
```

### 3.2 Контракт payload (новый, client-only)

Примерная форма (финализировать на Step 1):

```typescript
type WorkspacePendingRoute = {
  source: "mission-control";
  createdAt: string;
  taskText: string;
  routing: {
    targetEntityRegistryId: string;
    routeViaEntityId?: string;
    usedConnectionId?: string;
    method: string;
    targetName?: string;
  };
  agents: Array<{
    agentDbId: string;       // Supabase agents.id
    slug: string;            // gemini, groq, or_qwen, …
    status: "launched" | "success" | "error";
    agentName?: string;
  }>;
};
```

**Обновление статусов:** MC может **PATCH** payload по мере завершения агентов (optional Step 2) или записать финальное состояние один раз после fan-out (Step 1).

### 3.3 Adapter вместо дублирования логики

`resolveRouteHighlight()` принимает `ExecuteChatTaskResult`. Mission Control возвращает другую форму.

**Не менять** `ExecuteChatTaskResult` и chat flow.

**Добавить** тонкий adapter:

`lib/workspace/resolve-mission-route-highlight.ts`

```typescript
resolveMissionRouteHighlight(
  pending: WorkspacePendingRoute,
  chambers, buildings, assignments
): RouteHighlightResult | null
```

Внутри — **маппинг** в synthetic `ExecuteChatTaskResult`-like shape **или** общий helper, вынесенный из `resolve-route-highlight.ts` (refactor без изменения chat behavior).

---

## 4. Маппинг агентов MC → nodes на canvas

| Mission Control | Workspace canvas |
|---|---|
| `AgentId` (`or_qwen`, `gemini`, …) | `agents.id` (UUID) via `AGENT_DB_IDS` |
| UUID | `agent_assignments` row → node id `assignment-{id}` |

`appendParticipatingAgents()` уже делает: chamber + agentDbId → `workspaceAssignmentNodeId(assignment.id)`.

**Ограничение MVP:** agent node подсветится **только если** агент **назначен** в target chamber на canvas. Если MC запустил модель, которой нет в roster chamber — подсветка остановится на Chamber (City → Building → Chamber). Это **ожидаемо** и совпадает с поведением Fast mode для unassigned advisor.

**Step 1 acceptance:** маршрут до chamber гарантирован; agent nodes — best-effort по assignments.

---

## 5. Workflow mode в Mission Control

MC при `mode === "workflow"` показывает `WorkflowPanel`, **не** parallel fan-out.

**W11 Step 1:** workflow **не** в scope (не ломаем `WorkflowPanel`).

**W11 Step 3 (optional):** reuse `startWorkflowReplay()` — MC пишет `workflowId` / steps в sessionStorage; Workspace воспроизводит тот же replay, что W7 chat. Отдельный payload `workspacePendingWorkflow`.

---

## 6. Файлы — что трогать по шагам

### Step 1 — Read-only bridge (самый простой первый шаг) ⭐

**Deliverable:** после launch в MC пользователь открывает `/workspace` и видит **статический** highlight (path + agents, финальное состояние).

| Действие | Файл |
|---|---|
| **NEW** | `docs/w11-plan.md` (этот документ) |
| **NEW** | `lib/mission-workspace-bridge.ts` — read/write/clear `sessionStorage`, тип `WorkspacePendingRoute` |
| **NEW** | `lib/workspace/resolve-mission-route-highlight.ts` — adapter → `RouteHighlightResult` |
| **EDIT** | `components/mission/MissionControl.tsx` — после fan-out complete: `writePendingRoute(...)`; ссылка `/workspace` рядом с report |
| **EDIT** | `components/workspace/WorkspaceRouteContext.tsx` — `consumePendingMissionRoute()` после `registerRouteLookup` |
| **NEW** | `scripts/w11_step1_evidence.ts` — Playwright: MC launch → navigate workspace → screenshot highlight |
| **NEW** | `docs/evidence/w11-step1/report.json` |

**Не трогаем:** `execute-chat-task.ts`, `WorkspaceChatSidebar.tsx` (Fast/Team/Council), `TeamAnswersPanel`, `CouncilReportPanel`, `ContextPreviewSection`, migrations, `/api/chat`.

### Step 2 — Live progress (optional, после ревью Step 1)

| Действие | Файл |
|---|---|
| **EDIT** | `MissionControl.tsx` — write pending route **at routing time** with `status: launched`; patch on each agent complete |
| **EDIT** | `WorkspaceRouteContext.tsx` — `storage` event listener → refresh highlight while user already on workspace |
| **EDIT** | `WorkspaceCanvas.tsx` — optional: `fitView` на target chamber при incoming mission route |

### Step 3 — Polish

| Действие | Файл |
|---|---|
| **EDIT** | `MissionControl.tsx` header link: `/floor` → `/workspace` или обе ссылки |
| **EDIT** | Workflow bridge → `startWorkflowReplay` |
| **EDIT** | Inspector banner: «Last mission from Mission Control» (read-only, без W10C badge logic) |

---

## 7. UX детали Step 1

1. **Когда писать payload:** после `Promise.all` fan-out (знаем success/error per agent).
2. **Ссылка в MC:** «Маршрут в Workspace →» появляется когда routing target известен (не ждать consensus).
3. **Workspace:** если pending payload свежий (< 5 min) — auto-highlight; иначе ignore.
4. **Конфликт с chat highlight:** pending mission **не перетирает** активный chat highlight, если chat run < 10s назад; иначе mission wins (document in code comment).
5. **Visual:** 100% reuse W4 CSS — без новых animation modes на Step 1.

---

## 8. Evidence / STOP-критерий Step 1

| Check | Критерий |
|---|---|
| `mission_writes_pending_route` | После MC launch в sessionStorage есть `workspacePendingRoute` с valid `targetEntityRegistryId` |
| `workspace_consumes_route` | На `/workspace` после перехода — nodes highlighted, `workspace-route-node` class present |
| `path_includes_chamber` | Minimum: City Hall → Building → target Chamber |
| `agents_when_assigned` | Если launched agents ∈ chamber roster — их nodes в highlight chain |
| `regression_w10b` | Existing W10B evidence scripts still pass (no chat flow changes) |
| `screenshot` | `docs/evidence/w11-step1/01-mission-launch.png`, `02-workspace-highlight.png` |

---

## 9. Риски и mitigations

| Риск | Mitigation |
|---|---|
| MC и Workspace на разных вкладках — stale highlight | TTL 5 min + `createdAt` |
| Agent не на canvas | Highlight до chamber; tooltip «Agent not placed in this department» — Step 3 |
| `resolveRouteHighlight` tightly coupled to `ExecuteChatTaskResult` | Adapter file; extract shared `buildRouteSteps()` only if needed — **не** менять chat call sites |
| Duplicate highlight logic | Single consumer: `WorkspaceRouteContext.setRouteHighlight` |
| Link to `/floor` confuses users | Step 1 или 3: добавить `/workspace` link |

---

## 10. Порядок шагов (для ревью)

| Phase | Scope | Review gate |
|---|---|---|
| **W11A** | Этот документ | ✅ вы здесь |
| **W11B Step 1** | SessionStorage bridge + static highlight после MC launch | Evidence + ваш OK |
| **W11B Step 2** | Live progress (storage events) | Optional |
| **W11B Step 3** | Workflow bridge + navigation polish | Optional |

---

## 11. Самый простой первый шаг (резюме)

**W11B Step 1 = один bridge + один adapter + два hook point:**

1. `MissionControl.handleLaunch` — в конце fan-out записать `WorkspacePendingRoute` в sessionStorage.
2. `WorkspaceRouteContext` — при загрузке chambers/assignments прочитать и вызвать существующий highlight.

Никаких API changes. Никаких миграций. Fast/Team/Council не трогаем.

---

## Связанные документы

- [`docs/w10-execution-modes-spec.md`](w10-execution-modes-spec.md) — §0 gap, §9.2 #10 deferred
- [`docs/w9-plan.md`](w9-plan.md) — формат пошагового plan + evidence
- [`docs/post-w8-strategic-review.md`](post-w8-strategic-review.md) — broader «City View W11» (out of scope here)
- [`lib/workspace/resolve-route-highlight.ts`](../lib/workspace/resolve-route-highlight.ts) — reuse target
