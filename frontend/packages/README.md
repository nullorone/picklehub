# Общие frontend-пакеты

Пакеты в этом каталоге не содержат React-компоненты и platform-specific код:

- `api-client` — типизированный HTTP-клиент; `src/generated/openapi.ts` создаётся из корневого OpenAPI командой
  `npm run contracts:generate` и вручную не редактируется;
- `domain` — общие framework-neutral типы;
- `validation` — схемы Zod, включая конфигурацию времени выполнения;
- `i18n` — русские ресурсы и независимая от React настройка i18next;
- `analytics` — типизированная таксономия и порт без подключения внешнего провайдера.

Пакеты не импортируют backend, DOM, Telegram SDK или код приложений. UI остаётся внутри `web` и `tg`.
