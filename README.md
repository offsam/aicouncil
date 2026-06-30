# AI Council City

Next.js application for managing an **AI office as a city**: a visual workspace where a **Mayor** agent receives user requests and routes work through a graph of **buildings**, **chambers**, and **agents**.

## What it is

**AI Council City** models an organization as a city on a canvas:

```
City (office)
 └── Building (project / department)
      └── Chamber (team / room)
           └── Agent (LLM-backed worker)
```

The **Mayor** at City Hall is the primary entry point for user chat (workspace sidebar, Telegram, and related APIs). The Mayor decides whether to answer directly, clarify, or delegate to a building/chamber. Structure changes (create/rename/delete buildings and chambers) go through the **Tech Department** and its **Mutation Engine**.

Connections between entities define who may send tasks, read results, and escalate.

## Key capabilities (today)

| Area | What the system does |
|------|----------------------|
| **Visual workspace** | 2D canvas (`/workspace`) — buildings, chambers, agents, connections, route highlight, inspector |
| **Mayor routing (MR-2)** | Deterministic gates (structure commands, read-only system questions) plus **Mayor agent** semantic routing for everything else |
| **Mutation Engine** | LLM structure planner → impact preview → confirmation → atomic execute; compound detection and anaphora resolution for follow-ups |
| **Tech Department** | Direct chat for code audit, diagnostics, and structure mutations |
| **Graph identity** | City Hall, Tech Department, external-entry office, and escalation edges resolved from the workspace graph (`building_role`, `external_entry`) |
| **LLM roles management** | Per-office `system_llm_roles` (Mayor, planner, cheap/expensive slots) with UI and runtime enforcement |
| **Mayor memory** | Conversation history persisted for Mayor sessions |
| **Observability** | Routing logs, connection logs, inspector panels for entity configuration |

Lower-level design notes live under `docs/` (workspace architecture, migration phases, API audit).

## Project Status

### ✅ Phase 1 completed

Phase 1 delivered the core **routing + structure mutation + identity** stack:

- Mayor agent routing (MR-2) with deterministic structure/system gates
- Mutation Engine: planner, impact snapshot, confirmation, atomic execute, compound blocking, anaphora resolver
- Tech Department direct chat (code audit, diagnose, structure plan)
- Workspace graph identity (Phase 1A–1C): resolvers wired; legacy hardcoded building/office UUIDs removed from runtime
- Managed LLM roles (`system_llm_roles`) for Mayor, planner, and execution tiers
- Mayor conversation memory
- Council legacy cleanup; graph-backed Telegram Mayor target
- Orphan legacy cleanup (PHASE1-CLEANUP-1)

The system is usable for building and operating an AI office on the canvas with Mayor-led chat and Tech Department structure changes.

### 🚧 Phase 2 planned (not implemented)

The next planned chapter is **Knowledge Connectors** — wiring external and structured knowledge sources into the graph so chambers and agents can consume them beyond today’s manual rules/knowledge CRUD.

Also planned (not started):

- **General Intake / routing pool disposition** — off-canvas fallback chamber still exists in the legacy `resolveRoute()` path; not integrated into Mayor-first UX
- **Production hardening** — auth, multi-tenant offices, async long-running chat (see `docs/post-w8-strategic-review.md`)

Nothing in Phase 2 is available in the current runtime unless explicitly built in a future task.

## Quick start

1. Copy environment template and fill in keys:

```bash
cp .env.local.example .env.local
```

2. Install and run the dev server:

```bash
npm install
npm run dev
```

3. Open [http://localhost:3000/workspace](http://localhost:3000/workspace).

Supabase migrations under `supabase/migrations/` must be applied for graph identity and Tech Department connections to resolve correctly.

## Verification

Representative checks (require `.env.local` + applied migrations):

```bash
npx tsc --noEmit
npx tsx scripts/verify_graph_identity_resolvers.ts
npx tsx scripts/verify_mayor_structure_routing.ts
npx tsx scripts/verify_mayor_routing_parser.ts
```

Migration phase artifacts: `docs/migration/` (Phase 0 baseline is frozen historical reference).
