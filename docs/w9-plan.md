# W9 — Multi-Select, Keyboard & Workspace Polish

**Статус:** draft для утверждения  
**Дата:** 2025-06-23  
**Основа:** код после W8 (`/workspace`, `@xyflow/react` ^12.11.1)  
**Архитектурный scope:** `docs/workspace-architecture.md` — W9: «Multi-select, keyboard, polish»

---

# Goal

После W9 пользователь на `/workspace` работает с canvas как с полноценным редактором (Miro-class), а не только с поштучным выбором объектов.

### Что получает пользователь

1. **Multi-select** — выбор нескольких Chamber / Agent / Connection одновременно.
2. **Box selection** — рамкой на пустом canvas (marquee select).
3. **Keyboard shortcuts** — Delete, Escape, Select All; Shift+Click для additive select.
4. **Batch delete** — удаление всех выбранных deletable-объектов одним действием (с confirm).
5. **Minimap** — обзор всего города в углу canvas; клик/drag для навигации.
6. **Visual polish** — единый стиль selection ring, hover states, shortcut hints в toolbar.
7. **Inspector остаётся рабочим** — один объект → полный W8 Inspector; несколько → summary panel.

### STOP-критерий

- Evidence `docs/evidence/w9/` — все checks PASS.
- Regression W4–W8 evidence scripts остаются green.
- Connect mode (W6) и workflow replay (W7) не сломаны.

---

# Scope

## ✅ Входит в W9

| Feature | Описание |
|---|---|
| **Multi-select объектов** | Chamber, Agent, Connection — additive и replace selection |
| **Box selection** | Marquee на pane; partial intersection (`selectionMode="partial"`) |
| **Keyboard shortcuts** | Delete / Backspace, Escape, Cmd/Ctrl+A, Shift+Click |
| **Delete selected** | Batch delete через существующие DELETE API |
| **Escape deselect** | Сброс selection + закрытие Inspector primary view |
| **Workspace minimap** | `@xyflow/react` `<MiniMap />` |
| **Canvas polish** | Selection styles, focus ring, selected count badge |
| **UX improvements** | Shortcut cheat sheet (toolbar tooltip / `?` popover), empty selection hint |

## ❌ Не входит в W9

| Feature | Куда отложено |
|---|---|
| Undo / redo | W10+ |
| Snap-to-grid / alignment guides | W10+ |
| Multi-select Building / City Hall | Вне scope W9 (single-select only) |
| Batch move / batch resize | W10+ |
| Batch edit routing / rules | W10+ |
| Fast / Team / Council modes | W10 Orchestrator |
| Context Preview / Explainability | W10 |
| City View integration | W11 |
| Agent palette DnD changes | W5 scope закрыт; не трогаем |
| Новые таблицы / миграции | Запрещено |
| Новые `/api/workspace/*` | Запрещено |
| Новые backend endpoints | Не требуются |
| Building↔Building connections | Post-MVP |
| Edge waypoint editing | Post-MVP |

---

# Current Architecture Impact

## Текущее состояние selection (W8)

Сейчас существуют **два параллельных механизма**, не полностью синхронизированных:

| Механизм | Где | Поведение |
|---|---|---|
| **Inspector selection** | `WorkspaceSelectionContext.selectedTarget` | Single `InspectorTarget`; set на `onNodeClick` / `onEdgeClick` |
| **React Flow selection** | `onSelectionChange` | Только visual `building.selected` для border glow |

Дополнительно:

- `deleteKeyCode={null}` — RF delete отключён намеренно.
- `onPaneClick` → `setSelectedTarget(null)` если не connect mode.
- Connect mode: agents `pointer-events: none`, chambers pickable, inspector selection не меняется от edge.

## Компоненты — изменения

| Файл | Изменения |
|---|---|
| `components/workspace/WorkspaceCanvas.tsx` | **Major** — RF selection props, keyboard handler, batch delete, MiniMap, sync selection ↔ context |
| `components/workspace/WorkspaceSelectionContext.tsx` | **Major** — multi-select state, primary target, selection helpers |
| `components/workspace/WorkspaceInspector.tsx` | **Medium** — multi-select summary view (`N selected`) |
| `lib/workspace/inspector-target.ts` | **Minor** — batch resolve helpers, `inspectorTargetKeys()` |
| `lib/workspace/selection.ts` | **New** — map nodes/edges → targets, batch delete orchestration, selectability rules |
| `components/workspace/ConnectionEdge.tsx` | **Minor** — selected edge styling (reuse `selected` prop) |
| `components/workspace/nodes/ChamberNode.tsx` | **Minor** — multi-select ring (via RF `selected`) |
| `components/workspace/nodes/AgentNode.tsx` | **Minor** — multi-select ring |
| `components/workspace/WorkspaceToolbar.tsx` | **Minor** — shortcut hints, selection count |
| `app/globals.css` | **Minor** — `.workspace-multi-selected`, minimap theme |
| `lib/workspace/constants.ts` | **Minor** — minimap size, selection colors |
| `scripts/w9_manual_browser_evidence.ts` | **New** — Playwright evidence |

## Без изменений (regression only)

| Файл | Причина |
|---|---|
| `WorkspaceChatSidebar.tsx` | W4 scope |
| `WorkspaceRouteContext.tsx` | Read-only integration; replay не зависит от selection |
| `load-inspector-data.ts` | Single-object load; multi-select не вызывает load |
| `/floor` 3D scene | Explicit constraint |
| Backend API routes | Thin client preserved |

## Контексты — расширения

### `WorkspaceSelectionContext`

```typescript
// Proposed additions (conceptual)
selectedTargets: InspectorTarget[];       // 0..N
primaryTarget: InspectorTarget | null;      // Inspector focus (= sole selection or last clicked)
setSelection(targets: InspectorTarget[], primary?: InspectorTarget | null): void;
clearSelection(): void;
toggleTarget(target: InspectorTarget, additive: boolean): void;

// Backward compat
selectedTarget: InspectorTarget | null;   // alias → primaryTarget
setSelectedTarget(t)                       // → setSelection(t ? [t] : [], t)
```

### `WorkspaceRouteContext`

**Без изменений API.** Workflow replay и route highlight используют `activeRouteHighlight` независимо от user selection. При replay selection **не сбрасывается**, но highlight имеет приоритет в CSS (как сейчас).

### `InspectorTarget`

Сохраняется stable union W8. Multi-select — это **массив** `InspectorTarget[]`, не новый тип.  
Добавить helper:

```typescript
resolveInspectorTargetsFromNodes(nodes: Node[], edges: Edge[], ctx): InspectorTarget[]
inspectorTargetKeySet(targets: InspectorTarget[]): string[]
```

### `WorkspaceCanvas`

Центральная интеграция:

```
ReactFlow selection (nodes/edges)
  ↔ onSelectionChange / onSelectionDrag
  ↔ WorkspaceSelectionContext.selectedTargets
  ↔ WorkspaceInspector (primaryTarget | summary)
```

---

# Multi-Select Design

## Принцип

React Flow — **source of truth** для visual selection (nodes + edges).  
`WorkspaceSelectionContext` — **semantic layer** для Inspector и batch operations.

## Single click

| Object | Click target | Selection behavior | Inspector |
|---|---|---|---|
| **City Hall** | node | Replace selection → 1 city | Full W8 Inspector |
| **Building** | node (header area) | Replace → 1 building | Full W8 Inspector |
| **Chamber** | accent / body | Replace → 1 chamber | Full W8 Inspector |
| **Agent** | agent circle | Replace → 1 agent | Full W8 Inspector |
| **Connection** | edge path | Replace → 1 connection | Full W8 Inspector |
| **Pane** | empty canvas | Clear all selection | Empty state |

**Replace** = сброс предыдущего selection, выбор одного объекта.

Implementation: `onNodeClick` / `onEdgeClick` вызывают `setSelection([target], target)` + `rfInstance.setNodes/Edges selected flags`.

## Shift+Click (additive)

| Object | Behavior |
|---|---|
| **Chamber** | Toggle in selection set |
| **Agent** | Toggle in selection set |
| **Connection** | Toggle in selection set |
| **Building** | **Replace only** (не additive) — single-select type |
| **City Hall** | **Replace only** |

Shift+Click на уже selected object → **deselect** этого object.

`primaryTarget` = last Shift+Clicked item (или единственный selected).

## Drag selection (box / marquee)

**Gesture:** Shift + drag на pane **или** drag на pane при `selectionOnDrag` (см. Keyboard Design — pan vs select split).

**React Flow config (recommended):**

```typescript
selectionOnDrag={!connectMode}
selectionMode="partial"          // intersects marquee
panOnDrag={[1, 2]}               // pan = middle + right mouse
multiSelectionKeyCode="Shift"      // additive click (RF default)
```

**Selectable in marquee:**

| Type | `node.selectable` | In marquee |
|---|---|---|
| Chamber | `true` | ✅ |
| Agent | `true` (not connect mode) | ✅ |
| Connection (edge) | `true` | ✅ |
| Building | `true` but filtered post-select | ⚠️ Single-only: if building in box → replace with building only, clear others |
| City Hall | `false` for marquee | ❌ Excluded |

**Post-processing rule:** если marquee захватил Building → treat as accidental; либо ignore buildings in box, либо select building alone. **Рекомендация:** `cityHall.selectable = false`, `building.selectable = false` during marquee; building select только explicit click.

## Mixed selection

Допустимые mixed sets:

| Combination | Allowed | Inspector | Delete |
|---|---|---|---|
| Chambers only | ✅ | Summary: «3 chambers» + list | Batch DELETE chambers |
| Agents only | ✅ | Summary: «2 agents» + list | Batch DELETE assignments |
| Connections only | ✅ | Summary + «Delete N connections» | Batch DELETE connections |
| Chambers + Agents | ✅ | Grouped summary | Delete each group (confirm shows breakdown) |
| Chambers + Connections | ✅ | Grouped summary | Separate API calls |
| Agents + Connections | ✅ | Grouped summary | Separate API calls |
| All three types | ✅ | Grouped summary | Confirm modal with counts |
| Any + Building | ❌ | Building click replaces all | — |
| Any + City | ❌ | City click replaces all | — |

## Inspector behavior by selection count

| Count | Inspector panel |
|---|---|
| **0** | «Click City Hall, Building, Chamber, Agent, or Connection» |
| **1** | Full W8 sections (Routing, Knowledge, etc.) |
| **2+** | **Multi-select summary:** counts by kind, scrollable name list, «Delete N objects» button, hint «Select one object to edit details» |

Multi-select **не вызывает** `loadInspectorData()` (avoid N parallel fetches). Summary строится из `InspectorTarget.label` + snapshot.

## Visual selection states

```css
/* RF built-in .selected + custom */
.workspace-node-selected     /* ring amber */
.workspace-edge-selected     /* stroke amber (W6 highlight compatible) */
.workspace-selection-count   /* toolbar badge "3 selected" */
```

---

# Keyboard Design

Global handler on `WorkspaceCanvas` wrapper (`tabIndex={0}` или `useEffect` on `document` when canvas focused).

**Disabled when:** connect mode active, permissions modal open, input/textarea focused (chat sidebar, inspector edit fields).

| Key | Action | Details |
|---|---|---|
| **Delete** | Delete selected deletable objects | Confirm if N > 1 or N chambers with agents. Skip City/Building. |
| **Backspace** | Same as Delete | Alias |
| **Escape** | Clear selection | `clearSelection()` + RF deselect all. If connect mode → exit connect mode first (priority). |
| **Cmd+A** / **Ctrl+A** | Select all selectable | All chambers + agents + connections on canvas. **Not** buildings/city. Max cap: 100 nodes (guard perf). |
| **Shift+Click** | Additive toggle | See Multi-Select Design |

### Delete behavior detail

| Selected type | API | Pre-check |
|---|---|---|
| Chamber | `DELETE .../chambers/{id}` | Confirm if has agents (count from snapshot) |
| Agent | `DELETE .../assignments/{id}` | None |
| Connection | `DELETE /api/connections/{id}` | None |
| Building | — | Not batch-deletable in W9 (existing single delete with empty guard) |
| City | — | Not deletable |

**Order:** connections first → agents → chambers (avoid orphan edge references in UI).

After delete: update canvas nodes/edges, `clearSelection()`, `registerSnapshot` refresh.

### Escape priority

```
1. If connectMode → resetConnectFlow() + exit connectMode
2. Else if selection not empty → clearSelection()
3. Else no-op
```

### Focus model

Canvas receives keyboard focus on click inside `.workspace-flow`. Visual: subtle focus ring on canvas wrapper. Chat sidebar inputs retain focus when typing — shortcuts не перехватываются.

---

# Minimap

## Библиотека

**`@xyflow/react` built-in `<MiniMap />`** — уже в dependency, zero new packages.

```typescript
import { MiniMap } from "@xyflow/react";
```

## Размещение

```
┌─────────────────────────────────────────────┐
│  Toolbar (Connect, + Building)            │
│                                    ┌──────┐ │
│                                    │ Mini │ │
│         Canvas                     │ Map  │ │
│                                    └──────┘ │
│  [React Flow Controls zoom]                 │
└─────────────────────────────────────────────┘
```

- Position: `bottom-right`, above RF `<Controls />` (offset ~12px).
- Size: ~160×100px (`lib/workspace/constants.ts` → `MINIMAP_WIDTH_PX`, `MINIMAP_HEIGHT_PX`).
- z-index: above canvas, below modals.

## Styling

| Node type | Minimap color |
|---|---|
| City Hall | `#eab308` (amber) |
| Building | `#78716c` (stone) |
| Chamber | `#0d9488` (teal) |
| Agent | `#7c3aed` (violet) |

```typescript
<MiniMap
  nodeColor={(node) => MINIMAP_NODE_COLORS[node.type ?? "default"]}
  maskColor="rgba(20, 20, 20, 0.75)"
  className="workspace-minimap"
  pannable
  zoomable
/>
```

## Взаимодействие

| Action | Effect |
|---|---|
| Click on minimap | Pan viewport to clicked region |
| Drag on minimap | Pan viewport (RF `pannable`) |
| Scroll on minimap | Zoom (`zoomable`) |
| Node click on main canvas | Minimap viewport indicator updates (automatic) |
| Connect mode | Minimap stays active |
| Workflow replay | Minimap stays visible; highlight nodes still visible in minimap |

## Toggle (UX polish)

Small button on toolbar: «Minimap» toggle, default **on**. Preference: `localStorage` key `workspace-minimap-visible`.

---

# Acceptance Criteria

## Multi-select

- [ ] Single click selects one object and opens full Inspector (W8 parity).
- [ ] Shift+Click adds/removes Chamber from selection.
- [ ] Shift+Click adds/removes Agent from selection.
- [ ] Shift+Click adds/removes Connection from selection.
- [ ] Shift+Click on Building replaces selection with Building only.
- [ ] Marquee selects multiple chambers/agents partially inside box.
- [ ] Marquee selects connections whose path intersects box.
- [ ] Mixed selection (chamber + agent) shows Inspector summary with counts.
- [ ] Multi-select does **not** trigger `loadInspectorData()`.

## Keyboard

- [ ] Delete removes selected agent assignment(s) via API.
- [ ] Delete removes selected connection(s) via API.
- [ ] Delete removes selected chamber(s) with confirm when needed.
- [ ] Backspace === Delete.
- [ ] Escape clears selection.
- [ ] Escape exits connect mode if active (before clearing selection).
- [ ] Cmd/Ctrl+A selects all chambers + agents + connections.
- [ ] Shortcuts inactive when chat input focused.

## Minimap

- [ ] Minimap visible bottom-right by default.
- [ ] Click minimap pans main viewport.
- [ ] Node colors distinguish types.
- [ ] Toggle hides/shows minimap; preference persists refresh.

## Regression (W4–W8)

- [ ] W4: chat + single route highlight works.
- [ ] W6: connect mode — only chambers pickable; agents pass-through; create connection E2E.
- [ ] W6: edge hover tooltip preserved.
- [ ] W7: workflow replay animation after chat workflow response.
- [ ] W8: single-select Inspector — routing edit, knowledge sources, connection delete from Inspector.
- [ ] W8: edge click opens Connection Inspector (single select replaces marquee).

## Polish

- [ ] Selected nodes show visible selection ring.
- [ ] Toolbar shows «N selected» when N > 1.
- [ ] Shortcut hint accessible (? or toolbar tooltip).

---

# Evidence

**Directory:** `docs/evidence/w9/`

**Script:** `scripts/w9_manual_browser_evidence.ts`

## Screenshots

| File | Scenario |
|---|---|
| `01-single-chamber-inspector.png` | Single chamber → full Inspector (W8 regression) |
| `02-multi-select-chambers.png` | 3 chambers selected, summary Inspector |
| `03-marquee-selection.png` | Box selection mid-drag or result |
| `04-mixed-agent-chamber.png` | Mixed selection summary |
| `05-keyboard-delete-agents.png` | Before/after Delete on 2 agents |
| `06-escape-deselect.png` | Selection cleared, Inspector empty |
| `07-minimap-visible.png` | Minimap bottom-right with nodes |
| `08-connect-mode-regression.png` | Connect mode active, multi-select disabled |
| `09-workflow-replay-regression.png` | Workflow step badge during replay |

## Playwright checks (`report.json`)

```json
{
  "checks": {
    "single_inspector_w8_regression": true,
    "multi_select_three_chambers": true,
    "inspector_summary_not_full_load": true,
    "marquee_select_works": true,
    "shift_click_additive": true,
    "delete_agents_api": true,
    "delete_connection_api": true,
    "escape_clears_selection": true,
    "cmd_a_select_all": true,
    "minimap_visible": true,
    "connect_mode_regression": true,
    "workflow_replay_regression": true
  }
}
```

## Verification commands

```bash
npx tsx scripts/w9_manual_browser_evidence.ts
npx tsx scripts/w8_manual_browser_evidence.ts   # regression
npx tsx scripts/w6_manual_browser_evidence.ts   # regression
```

---

# Risks

## Inspector (W8)

| Risk | Mitigation |
|---|---|
| Multi-select triggers stale W8 data | Summary mode skips `loadInspectorData`; guard `selectedKey === primaryKey` kept |
| User expects edit in multi-select | Clear copy: «Select one object to edit details» |
| Edge selected + node selected | Primary = last clicked; summary shows both groups |

## Connect mode (W6)

| Risk | Mitigation |
|---|---|
| Marquee interferes with connect picks | **Disable** `selectionOnDrag` and keyboard shortcuts when `connectMode=true` |
| Agent pointer-events none blocks select | Correct — agents not selectable in connect mode (existing) |
| Shift+Click during connect | Ignored; connect uses plain click on chambers only |

## Workflow replay (W7)

| Risk | Mitigation |
|---|---|
| Selection rings clash with route highlight | Route highlight uses `workspace-node-route-highlight`; selection uses separate ring; route z-index wins for glow |
| Replay clears selection | Do not clear selection on replay start |
| User selects during replay | Allowed; replay animation independent |

## W8 selection model

| Risk | Mitigation |
|---|---|
| Dual selection systems diverge | Single sync path: RF `onSelectionChange` → context. Remove duplicate setState in click handlers where possible |
| `onPaneClick` double-clear | Unify: pane click → RF deselect + context clear |
| Building `selected` visual from W2 | Keep; extend pattern to chamber/agent selected class |

## Performance

| Risk | Mitigation |
|---|---|
| Cmd+A on 500+ nodes | Cap select-all at 100; toast «Selection limited» |
| Marquee on large graph | RF native; acceptable for MVP scale |
| Batch delete 20+ objects | Sequential DELETE with progress toast |

## Pan vs marquee UX change

| Risk | Mitigation |
|---|---|
| Left-drag no longer pans | `panOnDrag={[1, 2]}` — middle/right pan; document in shortcut hint; Controls zoom remains |

---

# Estimated Scope

| Metric | Estimate |
|---|---|
| **Sprint size** | **M** — 3–5 dev-days |
| **Complexity driver** | Selection sync + Inspector dual mode + keyboard + regression matrix |
| **New files** | 2 (`lib/workspace/selection.ts`, `scripts/w9_manual_browser_evidence.ts`) |
| **Modified files** | ~8–10 |
| **Lines of code (approx)** | 600–900 |
| **New DB migrations** | **None** |
| **New API endpoints** | **None** |
| **Existing APIs used** | `DELETE .../chambers/{id}`, `DELETE .../assignments/{id}`, `DELETE /api/connections/{id}` |

### File list (expected)

```
lib/workspace/selection.ts                          NEW
lib/workspace/inspector-target.ts                   MODIFY
lib/workspace/constants.ts                          MODIFY
components/workspace/WorkspaceSelectionContext.tsx  MODIFY
components/workspace/WorkspaceCanvas.tsx            MODIFY (largest)
components/workspace/WorkspaceInspector.tsx         MODIFY
components/workspace/WorkspaceToolbar.tsx           MODIFY
components/workspace/ConnectionEdge.tsx             MODIFY
components/workspace/nodes/ChamberNode.tsx          MODIFY (optional)
components/workspace/nodes/AgentNode.tsx            MODIFY (optional)
app/globals.css                                     MODIFY
scripts/w9_manual_browser_evidence.ts               NEW
docs/evidence/w9/*                                  NEW
```

---

# Recommendation

## ✅ W9 можно завершить без изменений backend и схемы БД

**Обоснование:**

1. **Multi-select** — pure client state + React Flow built-ins (`selectionOnDrag`, `MiniMap`, `multiSelectionKeyCode`).
2. **Delete** — reuse existing DELETE handlers already used in W3/W5/W6/W8.
3. **Inspector multi-summary** — derived from `InspectorTarget[]` + snapshot; no new fetches.
4. **Keyboard** — DOM events in canvas shell; no server involvement.
5. **Minimap** — `@xyflow/react` component; no persistence required (optional localStorage for toggle only).

**Thin client invariant preserved:** workspace остаётся клиентом существующих API; `/api/workspace/*` не создаётся; миграции не нужны.

---

*После утверждения этого документа можно начинать реализацию W9.*
