# Fast–Team–Council Design Review

**Дата:** 2025-06-23  
**Основа:** реальный код (`lib/routing.ts`, Mission Control, Workflow Engine, Workspace chat)  
**Связанные документы:** [`post-w8-strategic-review.md`](post-w8-strategic-review.md)

---

## Контекст: два разных измерения

В коде существуют **два ортогональных механизма**, которые не стоит смешивать:

| Измерение | Что делает | Где реализовано |
|---|---|---|
| **Parallel agents** (Fast / Team / Council) | N агентов отвечают **параллельно** на одну задачу в одном target chamber | `estimateAgentCount()` → `resolveAgentIdsForTarget()` → Mission Control fan-out |
| **Workflow** (multi-step) | Последовательная цепочка **chamber → chamber → chamber** | `planWorkflow()` → `executeWorkflow()` |

Workflow — это не Council Mode. Council — не workflow. Они могут комбинироваться (workflow step + 3 agents), но сейчас **ни одна такая комбинация не реализована**.

---

## 1. Что уже существует в коде?

### Routing & agent count

| Артефакт | Файл | Назначение |
|---|---|---|
| `estimateAgentCount(taskText)` | `lib/routing.ts` | Heuristic: 1 / 3 / 11 agents |
| `resolveRoute()` | `lib/routing.ts` | Выбор target chamber + `agentCount` в `RouteDecision` |
| `resolveAgentIdsForTarget(targetId, agentCount)` | `lib/route-agent-ids.ts` | N frontend agent ids, sorted by `cost_tier` (free → cheap → expensive) |
| `selectAgentForChamberEntity()` | `lib/agent-selection.ts` | **Один** agent для workflow / chat single path |
| `RouteDecision.agentCount` | `lib/office-types.ts` | Число агентов в routing decision |
| `routing_logs.agent_count` | DB Sprint 3 | Persisted при каждом routing |

### Execution paths (три разных pipeline)

```
Path A — Mission Control (parallel multi-agent)
  POST /api/workflows → processTask → (single mode) → resolveAgentIdsForTarget(agentCount)
  → client fan-out N× /api/ask-* → POST /api/consensus → AnalysisReportPanel

Path B — Workspace chat (single agent OR workflow)
  POST /api/chat → executeChatTask → selectAgentForChamberEntity (1 agent)
  OR executeWorkflow (multi-chamber sequential)

Path C — Legacy route API
  POST /api/route → resolveRoute → agentIds[]
```

### Multi-agent UI (Mission Control `/`)

| Компонент | Файл | Роль |
|---|---|---|
| `MissionControl` | `components/mission/MissionControl.tsx` | Orchestrates parallel launch, consensus, token sum |
| `ModelCard` | `components/mission/ModelCard.tsx` | Per-agent status (processing / complete / standby) |
| `AnalyzerHub` | `components/mission/AnalyzerHub.tsx` | Phases: collecting → analyzing → complete |
| `AnalysisReportPanel` | `components/mission/AnalysisReportPanel.tsx` | Consensus / Differences / Best Answer / Final Verdict |
| `WorkflowPanel` | `components/mission/WorkflowPanel.tsx` | Multi-chamber workflow status (отдельная ось) |
| `DataFlowCanvas` | `components/mission/DataFlowCanvas.tsx` | Visual agent flow |

### Consensus / synthesis

| API | Файл | Назначение |
|---|---|---|
| `POST /api/consensus` | `app/api/consensus/route.ts` | Claude Sonnet синтезирует N ответов → `AnalysisReport` |
| `fetchReport()` | `MissionControl.tsx` | Client wrapper; min 2 answers |

### Cost & logging infrastructure

| Артефакт | Где | Что хранит |
|---|---|---|
| `agents.cost_tier` | DB: `free \| cheap \| expensive` | Качественный tier, не USD |
| `request_logs` | DB Sprint 1 | question, response, latency_ms, agent_id — **без tokens** |
| `routing_logs` | DB Sprint 3 | task_text, method, **agent_count**, candidates |
| `sumTokens()` / `formatTokens()` | `lib/tokens.ts` | Client-side token aggregation (Mission Control only) |
| `AgentNode` cost badge | `components/workspace/nodes/AgentNode.tsx` | Visual: `free` / `$` / `$$$` |

### Workflow Engine (Sprint 5)

| Арtefact | Файл |
|---|---|
| `planWorkflow()` | `lib/workflow-planner.ts` |
| `processTask()` | `lib/workflow-orchestrator.ts` |
| `executeWorkflow()` | `lib/workflow-executor.ts` |
| `invokeAgentForWorkflow()` | `lib/invoke-agent.ts` |
| Tables | `workflows`, `workflow_steps` |

### Чего нет в коде

| Концепт | Статус |
|---|---|
| Explicit `mode: "fast" \| "team" \| "council"` parameter | **Не найдено** |
| Mode selector UI в Workspace | **Не найдено** |
| Dollar / credit billing | **Не найдено** |
| Token persistence в DB | **Не найдено** |
| Server-side parallel execution в `/api/chat` | **Не найдено** |
| Synthesis step в workspace chat | **Не найдено** |

---

## 2. Как сейчас работает `estimateAgentCount()`?

```typescript
// lib/routing.ts — упрощённая логика
export function estimateAgentCount(taskText: string): number {
  // Council trigger: urgent keywords OR length > 500
  if (isUrgent || taskText.length > 500) return 11;

  // Fast trigger: short, no ?, no conjunctions
  if (taskText.length < 50 && !text.includes("?") && !includes(" и " / " and ")) return 1;

  // Default: Team
  return 3;
}
```

### Council triggers (→ 11)

Keywords с word-boundary check: `срочно`, `важно`, `консенсус`, `совет`, `urgent`, `consensus`, `decision`, …  
**Или** длина текста **> 500 символов**.

### Fast triggers (→ 1)

Длина **< 50**, нет `?`, нет ` и ` / ` and `.

### Team (→ 3)

Всё остальное.

### Как `agentCount` используется дальше

```
resolveRoute(taskText)
  └─ agentCount = estimateAgentCount(taskText)   // всегда вычисляется
  └─ finalizeDecision(..., agentCount)
       └─ logRoutingDecision(..., agentCount)    // → routing_logs.agent_count

POST /api/workflows (single mode)
  └─ resolveAgentIdsForTarget(targetId, decision.agentCount)
       └─ slice(0, agentCount) agents sorted by cost_tier

POST /api/chat
  └─ executeChatTask()
       └─ selectAgentForChamberEntity()         // ⚠️ agentCount ИГНОРИРУЕТСЯ — всегда 1 agent
```

### Важное ограничение

Heuristic **автоматический** — пользователь не выбирает режим.  
Mission Control **уважает** `agentCount` через parallel fan-out.  
Workspace chat **не уважает** `agentCount` — всегда один agent (или workflow).

### Пример

| Запрос | `agentCount` | Mission Control | Workspace chat |
|---|---|---|---|
| `привет` | 1 | 1 agent card active | 1 agent via chat |
| `Напиши план маркетинга на Q3` | 3 | 3 agents parallel | 1 agent only |
| `Нужен консенсус совета по стратегии…` (>500 chars) | 11 | 11 agents + consensus | 1 agent only |

---

## 3. Можно ли реализовать Fast / Team / Council без изменений схемы БД?

### Ответ: **Да, для MVP всех трёх режимов**

Существующих таблиц и полей достаточно:

| Потребность | Существующее решение |
|---|---|
| Хранить выбранный режим | `routing_logs.agent_count` (1 / 3 / 11) |
| Какие агенты участвовали | `request_logs` (N rows per question) |
| Cost tier агентов | `agents.cost_tier` |
| Synthesis result | Client state или `request_logs.response` для analyzer row |
| Workflow (если нужен) | `workflows` + `workflow_steps` |

### Реализация без миграций

```typescript
// Новый optional param — не требует DB
POST /api/chat {
  taskText: string,
  sourceEntityId?: string,
  executionMode?: "fast" | "team" | "council"  // explicit override
}

// Mapping
fast    → agentCount = 1,  skipConsensus = true
team    → agentCount = 3,  skipConsensus = false (if ≥2 answers)
council → agentCount = 11, skipConsensus = false
```

Если `executionMode` не передан — fallback на `estimateAgentCount()` (текущее поведение).

### Что **опционально** улучшит billing, но не блокирует MVP

| Enhancement | Зачем | Обязательно? |
|---|---|---|
| `request_logs.input_tokens`, `output_tokens` | Точный cost tracking | ❌ post-MVP |
| `routing_logs.execution_mode TEXT` | Explicit mode vs inferred | ❌ можно infer из agent_count |
| `execution_batches` table | Group N request_logs under one chat message | ❌ можно batch_id в metadata JSON |
| `billing_credits` table | Commercial metering | ❌ commercial v1.2+ |

**Вывод:** schema changes **не требуются** для функционального MVP Fast/Team/Council.

---

## 4. Какие части Workflow Engine уже готовы?

Workflow Engine — **multi-chamber sequential**, не multi-agent parallel. Ниже — что можно переиспользовать.

### ✅ Готово и production-tested

| Компонент | Детали |
|---|---|
| **Planner** | `planWorkflow()` — Groq LLM + heuristic signals (multi-target route, multi-step text) |
| **Orchestrator** | `processTask()` — единая точка входа: workflow OR single route |
| **Persistence** | `workflows`, `workflow_steps` с status machine |
| **Executor** | `executeWorkflow()` — idempotent step claim, sequential execution, failure handling |
| **Agent invocation** | `invokeAgentForWorkflow()` + `buildContext()` + provider routing |
| **API** | `GET/POST /api/workflows`, `GET/PATCH /api/workflows/[id]` |
| **Canvas replay** | W7: `startWorkflowReplay()` — step animation on workspace |
| **UI** | `WorkflowPanel` — step list, status colors, expand/collapse |

### ⚠️ Частично готово

| Комponent | Gap |
|---|---|
| **Async execution** | `POST /api/chat` блокирует до завершения workflow |
| **Step → N agents** | Каждый step = 1 agent (`selectAgentForChamberEntity`) |
| **User-visible planning** | Planner output не показывается до execution |
| **Retry / resume** | Failed step не имеет UI retry |
| **Cost per step** | Tokens не логируются per step |

### ❌ Не готово (не входит в текущий engine)

| Feature | Статус |
|---|---|
| Parallel agents **within** a workflow step | Не найдено |
| Debate rounds / voting between agents | Не найдено |
| User approval between steps | Не найдено |
| Dynamic re-planning mid-workflow | Не найдено |

### Связь Workflow ↔ Fast/Team/Council

Сейчас **нет пересечения**:

```
Workflow path:  Chamber A → Chamber B → Chamber C  (sequential, 1 agent per step)
Council path:   Chamber X × 11 agents              (parallel, same target)
```

Будущая интеграция (post-MVP): workflow step может запускаться в Team Mode (3 agents per step + synthesis). Это **новый orchestration layer**, не расширение текущего executor.

---

## 5. Что потребуется изменить в UI?

### Workspace (`/workspace`) — primary target

| Изменение | Fast | Team | Council |
|---|---|---|---|
| **Mode selector** в chat sidebar | Default selected | Optional | Explicit opt-in + confirm |
| **Pre-send estimate** | «~1 agent · ~5s · free tier» | «3 agents · ~15s» | «11 agents · ~60s · $$$ warning» |
| **Loading state** | Single spinner | 3 agent cards pulsing on canvas | 11 agents + AnalyzerHub-style progress |
| **Response layout** | Single answer bubble | Tabbed / stacked 3 answers + short synthesis | Full AnalysisReportPanel (reuse from Mission Control) |
| **Canvas highlight** | 1 agent node glow | 3 agent nodes glow | All assigned agents + City Hall pulse |
| **Inspector** | Show 1 agent metadata | List 3 participating agents | Council roster + cost_tier breakdown |
| **Route highlight** | W4 single path (exists) | Same path, multiple agent nodes | Same + consensus badge on City Hall |

### Mission Control (`/`) — reference implementation

Уже содержит ~80% Council UX. Изменения минимальны:

- Explicit mode toggle (override heuristic)
- Pre-send cost estimate badge
- Link to workspace canvas highlight (сейчас disconnected)

### Shared components to reuse

| From Mission Control | Reuse in Workspace |
|---|---|
| `ModelCard` | Agent status during Team/Council execution |
| `AnalyzerHub` | Council progress indicator |
| `AnalysisReportPanel` | Council final report |
| `sumTokens()` + token line | Cost transparency footer |

### New components needed

| Component | Purpose |
|---|---|
| `ExecutionModeSelector` | Fast / Team / Council toggle + descriptions |
| `ExecutionEstimate` | Pre-flight: agents, time, tier, estimated tokens |
| `TeamAnswersPanel` | 3-column or accordion for Team mode |
| `ExecutionCostFooter` | Post-flight: tokens, latency, tier breakdown |

### API contract change (UI-driven)

```typescript
// WorkspaceChatSidebar — proposed request shape
{
  taskText: string,
  sourceEntityId?: string,
  executionMode?: "fast" | "team" | "council"  // new
}

// Response — proposed union extension
| { mode: "single"; answer: string; ... }           // fast (existing)
| { mode: "team"; answers: AgentAnswer[]; synthesis?: AnalysisReport; ... }  // new
| { mode: "council"; answers: AgentAnswer[]; report: AnalysisReport; ... }    // new
| { mode: "workflow"; ... }                          // existing
```

---

## 6. Как будет считаться стоимость выполнения?

### Что есть сейчас

**Качественный tier** (не USD):

```sql
-- agents.cost_tier: 'free' | 'cheap' | 'expensive'
-- Sprint 3 migration: Claude/GPT = expensive, Groq/Mistral = cheap, OpenRouter = free
```

**Token counting** — только client-side в Mission Control:

```typescript
// lib/tokens.ts
sumTokens([agent1usage, agent2usage, ..., consensusUsage])
formatTokens(total)  // "12 345" locale ru-RU
```

**Per-agent logging** — latency only:

```sql
-- request_logs: question, response, latency_ms, status
-- NO token columns
```

### Proposed cost model (design, not yet implemented)

#### Unit of measure

```
Total Cost Units = Σ(agent_invocation_cost) + synthesis_cost
```

#### Agent invocation cost (tier-based weights)

| `cost_tier` | Weight | Visual | Example agents |
|---|---|---|---|
| `free` | 1× | `free` | OpenRouter free models |
| `cheap` | 3× | `$` | Groq, Mistral, DeepSeek |
| `expensive` | 10× | `$$$` | Claude, GPT |

#### Mode baselines (typical)

| Mode | Agents | Synthesis | Relative weight |
|---|---|---|---|
| **Fast** | 1 × cheapest available | None | **1–3×** |
| **Team** | 3 × mixed tiers | Optional (1× cheap LLM) | **~10–15×** |
| **Council** | up to 11 × all tiers | Required (1× Claude Sonnet) | **~40–80×** |

#### Formula

```
execution_weight = Σ tier_weight(agent_i)  for i in 1..agentCount
synthesis_weight = (mode === "fast") ? 0 : tier_weight("expensive")
total_weight     = execution_weight + synthesis_weight

// Display (pre-flight estimate)
estimated_tokens = agentCount × avg_context_tokens + synthesis_buffer
estimated_time   = agentCount × avg_latency_p95  (parallel → max, not sum)
estimated_tier   = dominant cost_tier among selected agents
```

#### Post-flight (actual)

```
actual_tokens = sumTokens(all agent responses + synthesis)
actual_latency = max(agent latencies) + synthesis_latency   // parallel execution
logged_to = request_logs (per agent) + routing_logs.agent_count
```

#### Commercial conversion (future)

```
credits_charged = ceil(total_weight × token_multiplier)
// token_multiplier calibrated against API USD costs per provider
```

**Сейчас в коде нет USD conversion** — только tier labels и token counts в Mission Control UI.

### Recommended MVP display

```
Before send:
  ⚡ Fast — 1 agent (free) · ~5s · ~2k tokens est.

After response:
  ✓ Completed in 4.2s · 1,847 tokens · tier: free
```

Council adds warning:

```
⚠ Council — 11 agents + synthesis · ~45s · est. 25k tokens · includes $$$ models
  [ Confirm Council Mode ]
```

---

## 7. Как показать пользователю разницу между Fast и Council?

### Принцип: contrast through **scope, time, and visual density**

Пользователь должен **до отправки** понимать масштаб операции.

### A. Mode Selector (pre-send)

```
┌─────────────────────────────────────────┐
│  ⚡ Fast          👥 Team       🏛 Council │
│  ────────                               │
│  1 agent          3 agents      11 agents │
│  ~5 seconds       ~15 seconds   ~60 seconds │
│  Quick answer     Compare views Full deliberation │
│  Free tier        Mixed tiers   All advisors + synthesis │
└─────────────────────────────────────────┘
```

Fast selected by default. Council requires explicit click + confirmation dialog.

### B. Canvas behavior (during execution)

| Signal | Fast | Council |
|---|---|---|
| **Agents pulsing** | 1 node | 11 nodes simultaneously |
| **City Hall** | Static or single ① badge | Pulsing «Council in session» ring |
| **Other objects** | Dimmed 40% (W4 pattern) | Dimmed 60% — stronger focus |
| **Sidebar** | «Routing to Instagram → Agent X» | «Council processing: 7/11 agents complete» progress bar |
| **Duration feel** | Answer in one breath | Deliberate, multi-phase |

### C. Response format (post-execution)

**Fast** — один ответ, минимальный meta:

```
┌─ Answer ─────────────────────────────┐
│ Вот краткий ответ на ваш вопрос…     │
│                                      │
│ Route: City → Citizly → Instagram    │
│ Agent: Mistral (free) · 3.2s         │
└──────────────────────────────────────┘
```

**Council** — structured report (reuse `AnalysisReportPanel`):

```
┌─ Council Report ─────────────────────┐
│ ✓ Consensus    │ ✗ Differences      │
│ «Models agree…»│ «Claude vs GPT…»   │
├────────────────┴────────────────────┤
│ 🏆 Best Answer: Claude              │
│ Final Verdict: …                    │
│ 11 agents · 58s · 24,891 tokens     │
└──────────────────────────────────────┘
```

### D. Cognitive framing (copy)

| Mode | User-facing name | Metaphor |
|---|---|---|
| Fast | «Ask an advisor» | Один чиновник отвечает сразу |
| Team | «Small committee» | Три эксперта + краткое сравнение |
| Council | «Full council session» | Весь совет собирается, синтезирует решение |

### E. Guardrails for Council

1. **Confirmation modal** — «This will consult 11 AI models and may take up to 60 seconds. Continue?»
2. **Keyword auto-suggest** — если текст > 500 chars, suggest Council but don't auto-select
3. **Empty chamber check** — если < 3 agents assigned, Council disabled with explanation
4. **Cost badge** — red `$$$` on Council tab

### F. Side-by-side demo scenario (for onboarding)

Same question, two buttons:

> «Should we launch product X in Q3?»

| Fast (3s) | Council (45s) |
|---|---|
| One perspective | Consensus + disagreements + best answer |
| Good for quick tasks | Good for strategic decisions |

---

## Summary: readiness matrix

| Capability | Code exists? | Workspace wired? | DB needed? |
|---|---|---|---|
| **Fast** (1 agent) | ✅ `selectAgentForChamberEntity` | ✅ `/api/chat` single | ❌ |
| **Team** (3 parallel) | ✅ `resolveAgentIdsForTarget(3)` | ❌ Mission Control only | ❌ |
| **Council** (11 + synthesis) | ✅ Mission Control + `/api/consensus` | ❌ | ❌ |
| **Auto heuristic** | ✅ `estimateAgentCount()` | ⚠️ logged, not executed in workspace | ❌ |
| **Workflow** (sequential chambers) | ✅ full engine | ✅ W7 replay | ❌ |
| **Cost display** | ⚠️ tokens client-side only | ❌ | optional tokens column |
| **Explicit mode picker** | ❌ | ❌ | ❌ |

### Recommended implementation order

1. **ExecutionModeSelector** in Workspace chat (UI only, Fast default)
2. **Extend `POST /api/chat`** — server-side parallel invoke for team/council (reuse `resolveAgentIdsForTarget` + `invokeAgentForWorkflow`)
3. **Wire `/api/consensus`** for team (≥2) and council (≥2)
4. **Canvas multi-agent highlight** during execution
5. **Cost footer** — tier weights + token sum
6. **Confirmation gate** for Council

---

*Документ для design review. Не является implementation spec — детали API contract уточняются в W10 Orchestrator phase.*
