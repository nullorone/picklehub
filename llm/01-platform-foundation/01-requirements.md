# Этап 1. Архитектурные требования

## Промпт агенту

Ты — principal TypeScript architect. Прочитай overview проекта, этот feature overview, `_docs` и root-конфигурацию. Уточни архитектуру до product-кода.

## Выполни

1. Дополни `_docs/architecture.md`: containers, module boundaries, dependency rules, auth/session direction, REST/WebSocket flows, outbox and failure flow.
2. Зафиксируй ADR для workspace, modular monolith, shared packages, web-as-PWA и deferred mobile.
3. Определи environment matrix, naming, migrations, generated-code policy и Definition of Done.
4. Создай требования к логам, correlation ID, redaction, health, rate limit, audit и data residency.

## Ограничения и приёмка

Не создавать приложения и не выбирать provider без проверки условий. Документы не содержат нерешённых placeholder-маркеров и не противоречат `00-project-overview.md`. Проверь Markdown/ссылки и запиши evidence в AI log.
