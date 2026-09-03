# Промпты реализации PickleHub

Комплект предназначен для последовательной реализации реального startup MVP одним разработчиком с AI-агентом.

## Обязательный порядок работы

1. Всегда начинайте с [`00-project-overview.md`](00-project-overview.md).
2. До первого product-кода выполните `01-platform-foundation` целиком.
3. Затем выполняйте каталоги по номеру; внутри каталога — файлы по номеру.
4. Перед каждым prompt прочитайте его `00-overview.md`, актуальные документы в `_docs/`, контракты и результаты предыдущих этапов.
5. Не переходите дальше, пока критерии приёмки текущего prompt не выполнены либо блокировка не записана в `_docs/ai-development-log.md`.
6. Изменение продукта сначала отражается в overview/requirements/ADR, затем в OpenAPI/AsyncAPI и только после этого в коде.
7. Нельзя выдумывать успешные проверки, лицензии, интеграции, production-развёртывания или юридическое соответствие.

## Релизные волны

- Foundation: `01`.
- Match MVP для TMA и web/PWA: `02`–`08`.
- Supply и соревнования: `09`–`10`.
- Retention и monetization inventory: `11`–`13`.
- Дополнительные клиенты: `14`–`15`.
- Production readiness: `16`.

## Стандарт каталога фичи

- `00-overview.md`: стабильный контекст, scope, зависимости и non-goals.
- `01-requirements.md`: продуктовые правила, аналитика и acceptance criteria.
- `02-contract-data.md`: OpenAPI/AsyncAPI, данные, constraints и события.
- `03-backend.md`: use cases, безопасность, concurrency и фоновые задачи.
- `04-tma-web.md`: TMA и web/PWA; для mobile/operations каталога — соответствующий клиентский этап.
- `05-verification.md`: полный quality gate и evidence.

Шаблоны находятся в [`_templates/`](_templates/). Общие результаты и ADR складываются только в [`_docs/`](_docs/).

## Каталоги

1. [Platform foundation](01-platform-foundation/00-overview.md)
2. [Identity и onboarding](02-identity-onboarding/00-overview.md)
3. [Площадки](03-venues/00-overview.md)
4. [Матчи](04-matches/00-overview.md)
5. [Чат и уведомления](05-chat-notifications/00-overview.md)
6. [Профиль и статистика](06-player-profile-stats/00-overview.md)
7. [Trust & safety](07-trust-safety/00-overview.md)
8. [Admin backoffice](08-admin-backoffice/00-overview.md)
9. [Клубы](09-clubs/00-overview.md)
10. [Турниры](10-tournaments/00-overview.md)
11. [Геймификация](11-gamification/00-overview.md)
12. [Новости](12-content-news/00-overview.md)
13. [Реклама](13-advertising/00-overview.md)
14. [Mobile parity](14-mobile-parity/00-overview.md)
15. [Мини-игра](15-mini-game/00-overview.md)
16. [Production readiness](16-production-readiness/00-overview.md)
