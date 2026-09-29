# PickleHub Telegram Mini App

Monorepo для Telegram MVP PickleHub. Текущее приложение находится в `frontend/tg/`; архитектурные границы и порядок
дальнейшей работы описаны в `llm/_docs/architecture.md` и `llm/README.md`.

## Установка и запуск

В корне репозитория используется один `package-lock.json`:

```sh
npm ci
npm run start
npm run start:https
```

`start:https` создаёт локальный HTTPS-сертификат через mkcert. Он не создаёт публичный туннель.
Для временной проверки Mini App из Telegram с локальным API используйте
[инструкцию S19](llm/_docs/s19-local-pilot-runbook.md).

## Проверки и сборка

```sh
npm run format
npm run lint
npm run typecheck
npm run build
```

Результат сборки Mini App находится в `frontend/tg/dist/`. `npm run deploy` публикует статический frontend в GitHub Pages;
публикация backend в этот процесс не входит.
