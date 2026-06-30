# Dual-Read Adapters (Phase 1A → 1D)

**Status:** Implemented in `lib/workspace/graph-identity.ts` — **wired** to runtime entry points (Phase 1B). Legacy fallbacks **removed** (Phase 1D). Production paths use **`require*()`** invariants in `lib/workspace/graph-identity-required.ts`.

---

## Logging format

```
[graph-identity] <resolverName> unresolved=<reason>
```

Emitted when the graph path cannot produce a value (missing column, unset `building_role`, missing connection, etc.). There is **no** `fallback=` / `legacyId=` log line — legacy branches were deleted from `graph-identity.ts`.

Production code that must not proceed without a value calls `requireExternalEntryOfficeId()`, `requireCityHallBuildingId()`, `requireTechDepartmentBuildingId()`, or `requireTechDepartmentMainChamberRegistryId()` and throws an invariant error.

---

## Adapters

| ID | Function | Graph source | Legacy fallback | Status |
|----|----------|--------------|-----------------|--------|
| DR-001 | `resolveExternalEntryOfficeId()` | `offices.workspace_meta.external_entry === true` (exactly one office) | *(removed)* | Graph-only |
| DR-002 | `resolveCityHallBuildingId(officeId)` | `entity_registry.building_role = 'city_hall'` | *(removed)* | Graph-only |
| DR-003 | `resolveTechDepartmentBuildingId(officeId)` | `entity_registry.building_role = 'tech_department'` | *(removed)* | Graph-only |
| DR-004 | `resolveMainChamberForBuilding(id)` | `chambers.routing_role = 'main'` | None | Graph-only |
| DR-005 | `isMayorAgent(agentId, officeId)` | Manager/assignment on main chamber under city_hall building | *(removed)* | Graph-only |
| DR-006 | `resolveTechDepartmentMainChamberRegistryId(officeId)` | Main chamber via DR-003 + DR-004 | *(removed)* | Graph-only |
| DR-007 | `findTechDepartmentCityHallConnection(officeId)` | Active edge between graph-resolved Tech + City Hall buildings | *(removed)* | Graph-only |

Observational resolvers return `{ value, source: "graph" | "unresolved", unresolvedReason? }`. They do **not** silently substitute label heuristics or hardcoded UUIDs.

---

## Schema expectations (post–Phase 1C)

| Field | Expected state |
|-------|----------------|
| `entity_registry.building_role` | Canonical values on City Hall and Tech Department rows (1C.2 backfill) |
| `offices.workspace_meta.external_entry` | Seeded on AI Council (1C.3) — DR-001 uses `source=graph` |
| Tech → City Hall connection | Migration `20260624240000` (+ revised permissions migration) |

If backfill or seed is missing, resolvers log `unresolved=building_role_unset` (or `connection_missing` for DR-007) and production `require*()` calls fail fast.

---

## Phase 1B wiring (complete)

Runtime entry points now call graph resolvers / require layer:

| Former hidden source | Current |
|----------------------|---------|
| `lib/workspace/resolve-production-office.ts` | **Deleted** — use `requireExternalEntryOfficeId()` |
| `lib/telegram/mayor-chat-target.ts` | DR-001 + graph-backed orchestrator |
| `lib/workspace/city-hall-orchestrator.ts` | DR-002, DR-004, DR-005 |
| `lib/execute-chat-task.ts` | Mayor detection (DR-005), Tech direct-chat gate (DR-006) |
| `lib/mayor-routing.ts`, structure delegate | DR-003 via `requireTechDepartmentBuildingId()` |
| `lib/tech-department-escalation.ts` | DR-007 |

Details: `docs/migration/phase1b/README.md`.

---

## Verification

```bash
npx tsx scripts/verify_graph_identity_resolvers.ts
npx tsx scripts/verify_phase1b_wiring.ts
```

After 1C backfill, expect **`source=graph`** for DR-001–DR-006 on a correctly seeded database. DR-007 requires the Tech → City Hall connection migration applied.

---

## Phase 1D — fallback removal (complete)

1. Legacy branches inside `graph-identity.ts` — **deleted**
2. Hardcoded `TECH_DEPARTMENT_*` building/chamber UUID constants — **removed from runtime** (PHASE1-CLEANUP-1)
3. Normal staging logs should show **`unresolved=`** only when data/migrations are missing — not `[graph-identity] fallback=`

Phase 0 register (`docs/migration/phase0/dual-read-adapters-register.md`) remains frozen as the pre-1D baseline snapshot.
