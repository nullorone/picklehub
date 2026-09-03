# Журнал AI-разработки

Записывайте только фактически выполненные действия.

## 2026-09-03 — исходное состояние на основе промптов

- Задача: преобразовать TMA-прототип в спецификацию PickleHub на основе промптов.
- Решение: зафиксировать ориентир UX, удалить старый код приложений, создать общий контекст и вертикальные
  промпты фич.
- Контекст: продуктовые решения получены в интервью; структура основана на `ai-for-developers-project-386`.
- Изменения: создано 109 файлов в `llm/`, включая 16 feature-каталогов по шесть вертикальных этапов, общие документы, шаблоны и ADR; root переведён на npm workspaces/Turborepo; legacy Vite/TMA/TON/GitHub Pages файлы удалены.
- Проверки:
    - `npm install --ignore-scripts` — успешно, lockfile синхронизирован;
    - `npm run format:check` — успешно;
    - `npm run docs:check` — успешно, 111 Markdown-файлов, 0 ошибок;
    - специальная проверка внутренних ссылок Markdown — успешно, 111 файлов;
    - структурная проверка — успешно: 16 каталогов фич по 6 файлам промптов, всего 109 Markdown-файлов в `llm/`,
      устаревшие каталоги и каталоги приложений отсутствуют;
    - `git diff HEAD --check` — успешно;
    - `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` — конфигурация Turbo валидна, рабочие
      пространства приложений ещё не созданы, поэтому выполнено 0 задач согласно исходному состоянию
      на основе промптов.
- Риски: старые незакоммиченные исходники удаляются без архива по явному решению владельца.

## 2026-09-03 — основа платформы, этап 01-requirements

- Активный промпт: `llm/01-platform-foundation/01-requirements.md`.
- Объём: уточнена архитектура до создания приложений и продуктового кода; определены контейнеры и процессы,
  слои и владение модулей, направления зависимостей, auth/session flow, REST/WebSocket, transactional outbox,
  обработка сбоев, среды, именование, миграции, generated code policy и definition of done.
- Решения: сохранён принятый модульный монолит из ADR 0002; API и worker определены как независимо запускаемые
  режимы одной кодовой базы; ADR 0003 закрепил npm workspaces, единый lockfile, framework-neutral общие пакеты,
  отдельные web/PWA и TMA и запрет создавать mobile до этапа 14.
- Безопасность: заданы классификация и локализация данных, server-side sessions, структурированные allowlist-логи,
  перенос correlation context, redaction с негативными тестами, liveness/readiness/startup, distributed rate
  limiting, append-only audit и production gates для retention и внешних провайдеров.
- Изменённые файлы: `llm/_docs/architecture.md`, `llm/_docs/security-privacy.md`,
  `llm/_docs/adr/0002-modular-monolith-and-contracts.md`,
  `llm/_docs/adr/0003-workspace-and-client-delivery.md`, `llm/_docs/ai-development-log.md`.
- Проверки:
    - `npx prettier --check llm/_docs/architecture.md llm/_docs/security-privacy.md llm/_docs/adr/0002-modular-monolith-and-contracts.md llm/_docs/adr/0003-workspace-and-client-delivery.md` — обнаружил необходимость форматирования `architecture.md`; файл исправлен через `npx prettier --write`;
    - `npm run format:check` — успешно, все файлы соответствуют Prettier;
    - `npm run docs:check` — успешно, 112 Markdown-файлов, 0 ошибок;
    - read-only Node-проверка относительных Markdown-ссылок — успешно, проверено 112 файлов, отсутствующих целей нет;
    - `git diff --check` — успешно.
- Не выполнялись: `lint`, `typecheck`, `test`, contract generation и `build`, поскольку текущий документационный
  этап запрещает создавать приложения и не изменяет исполняемый код или контракты; их выполнение осталось бы
  нулевым Turbo-запуском и не проверяло бы критерии этого этапа.
- Риски и gates: конкретные внешние провайдеры не выбраны; production блокируется до юридической/security-проверки
  data residency, retention и условий каждого провайдера. Точные session TTL и endpoint rate limits обязан
  утвердить владеющий feature prompt до реализации соответствующего контракта.
- Следующий промпт: `llm/01-platform-foundation/02-contract-data.md`; к нему не переходили.
