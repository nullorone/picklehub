# Этап 1. Admin requirements

## Промпт агенту

Ты — operations/product analyst. Опиши backoffice workflows and least privilege.

## Выполни

- Permission matrix для четырёх ролей и break-glass/non-goals.
- MVP stories: secure access, case queue/decision, venue candidate merge/approve/reject, user restriction, audit search.
- Later extension points для CMS/ads без реализации экранов заранее.
- Определи reason requirements, irreversible-action confirmation, pagination/filtering, export limits and operational metrics.

## Приёмка

Every mutation has actor/reason/audit; editor/ads manager cannot access safety narratives; no flexible permission builder.
