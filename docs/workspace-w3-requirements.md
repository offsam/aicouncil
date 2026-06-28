# W3 — Chamber CRUD (requirements locked)

Approved before implementation (2025-06-22).

1. **True child of Building** — React Flow `parentId` + `extent: 'parent'`, not sibling nodes.
2. **Create inside Building** — select Building → «+ Chamber» → appears within bounds.
3. **Full CRUD on canvas** — create, rename, move, resize, delete (no `/structure`).
4. **Local coords** — `chambers.x/z` remain building-local; shared with Floor / Use Mode.
5. **Building as boundary** — `extent: 'parent'`; cannot drag outside building.
6. **No agents** in W3 — Building → Chambers only.
7. **Done when** Citizly + Instagram / PDF / Marketing / Support creatable entirely on `/workspace`.

API: extend `PATCH .../chambers/[chamberId]` (shared route, not `/api/workspace/*`).
