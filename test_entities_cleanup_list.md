# t_ test entities — manual cleanup list

Created by `scripts/routing_diagnostic_suite.ts` (diagnostic run 2026-06-28).
Safe to delete manually when no longer needed. **Do not delete protected buildings**
(Citizly, ЮРИСТЫ, City Hall, Технический отдел).

## Buildings

| Label | Building ID (entity_registry / office_objects) |
|-------|--------------------------------------------------|
| t_Кактусовая_Лавка | `f83e317c-d4f3-44f3-a47e-88fa76135453` |
| t_Пустышка | `b6e284d2-8c55-4203-aa6e-997bfa08c64a` |
| t_ТолькоФри_Башня | *(same as building id for free-only — see chamber)* |

## Chambers

| Name | Registry ID | chambers.id |
|------|-------------|-------------|
| t_Кактусовая_Лавка_Менеджер (main) | `8eff3441-a548-4d75-bf10-621bbd1f6d20` | `4e9417cd-dd56-482f-8cc6-b86cd34a2c84` |
| t_Бухгалтерия | `9441321f-fafa-42ca-8eed-14c0867b4778` | `b2ef1217-5653-4ea1-8b5a-2bf4da75bd66` |
| t_Кружка | `06d19641-b4ea-4544-85f1-e9381599d26f` | `a109d7a5-3ce2-4aee-a578-86987c8df101` |
| t_Пустышка_Менеджер (main) | `6a860038-022f-4f95-aea8-d6dbd50e79b8` | `4fc2aa40-452e-4b47-ba60-4689c30fa63b` |
| t_ТолькоФри_Башня_Менеджер (main) | `fd5538ad-df4f-494f-af96-e6528132f5e7` | `51e3d6f5-93a9-4bdb-a663-85a3ec52d111` |

## Knowledge (library)

| Title | ID |
|-------|-----|
| t_Каталог_кактусов | `2e05dc2e-7f8e-483c-9814-2a4f5d7c768a` |
| t_Рецепт_кружек | `3a523e83-78bd-4ec5-90e0-b9cebd064fc1` |
| t_Шум_видео | `2183e691-44b2-4cc0-b6c9-2ea21a67566a` |

## Connection

| From (main) | To (main) | Connection ID |
|-------------|-----------|---------------|
| t_Кактусовая_Лавка_Менеджер | t_Пустышка_Менеджер | `ef5ac449-324a-4360-97d2-b15336b5cdcd` |

## Suggested cleanup order

1. `DELETE FROM knowledge WHERE id IN (...)` — three rows above  
2. `DELETE FROM connections WHERE id = 'ef5ac449-324a-4360-97d2-b15336b5cdcd'`  
3. Delete `agent_assignments` for t_ chamber ids  
4. Delete `chambers` rows, then `entity_registry` children, then `office_objects` buildings  

Or remove via UI inspector if available.
