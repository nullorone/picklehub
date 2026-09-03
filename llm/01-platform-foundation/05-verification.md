# Этап 5. Foundation quality gate

## Промпт агенту

Ты — senior SDET/DevOps engineer. Проведи независимый аудит foundation и исправь только дефекты текущего этапа.

## Выполни

1. Проверь workspace dependency graph, lockfile, codegen drift, OpenAPI/AsyncAPI lint и root Turbo tasks.
2. Подними clean PostgreSQL/PostGIS и Redis, примени migrations, проверь health и shutdown.
3. Проверь web/PWA/TMA builds, offline shell, Telegram production guard и отсутствие backend imports в shared clients.
4. Добавь CI jobs foundation и Docker Compose для текущих компонентов.
5. Обнови architecture/operations docs и traceability evidence.

## Приёмка

Clean clone проходит install, contracts, lint, typecheck, tests, builds и Compose smoke. Нельзя маскировать отсутствующие внешние providers. Запиши точные результаты в AI log.
