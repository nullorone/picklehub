# Проверка новостей и редакционного контента

Документ фиксирует доказательства и незакрытые runtime-gates этапа `12-content-news/05-verification`. Он не
подтверждает права внешнего издателя, production-развёртывание, юридическое соответствие или работу не включённого
провайдера.

## Реестр разрешений источников

| Проверяемое состояние         | Фактическое значение | Подтверждение                                                                 |
| ----------------------------- | -------------------- | ----------------------------------------------------------------------------- |
| Включённые реальные источники | 0                    | Миграции не создают `ContentSource`; в репозитории нет production source seed |
| Синтетические источники       | Только tests         | Домены `example.test`, evidence явно помечено synthetic                       |
| Full-text лицензии            | 0                    | Default policy допускает metadata/excerpt; отдельного evidence не добавлено   |
| Media licenses/storage        | 0                    | Production adapter закрыт; unit test требует verified rights и storage        |

Следовательно, чек-лист конкретного издателя сейчас неприменим: ни один реальный RSS/API source не включён. Это
не предположение о правах, а fail-closed состояние, подтверждаемое отсутствием seed и SQL-guard включения. Перед
первым переходом источника в `ENABLED` владелец должен приложить проверяемое evidence и зафиксировать legal,
security, privacy и commercial approval, endpoint/terms version, разрешённые поля, excerpt/media limits,
атрибуцию, rate limit, robots/cache условия, территорию, языки, срок review и takedown-процедуру. Техническая
доступность feed или публичный URL не заменяет юридическое разрешение.

## Матрица автоматизированных подтверждений

| Риск или сценарий                               | Подтверждение                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ETag/Last-Modified и `304`                      | `content-source-adapter.spec.ts` и PostgreSQL/Redis integration checkpoint test                  |
| Malformed XML/JSON, XXE, тип/размер, SSRF       | `content-source-adapter.spec.ts`; redirects проверяются повторно                                 |
| Retry, недоступность и backoff                  | ingestion unit и integration; при ошибке candidate не создаётся                                  |
| URL/provider/hash duplicate                     | advisory-lock ingestion integration и SQL unique/index policy                                    |
| Гонка scheduler и BullMQ redelivery             | `content-backend.integration-spec.ts`: concurrent scheduler и closed-payload retry               |
| XSS и очистка                                   | closed AST unit/component tests и browser canary без DOM `img`/`script`                          |
| Draft authorization и role matrix               | OpenAPI/static verification, fixed capabilities и private no-store preview                       |
| Immutable revisions, checklist и audit          | SQL triggers, integration draft/audit assertion и append-only decisions                          |
| Unpublish/delete                                | атомарное удаление projection/search и body-free event integration test                          |
| Атрибуция и source link                         | web/TMA component tests и `test/e2e/content.spec.ts`                                             |
| Feed, search, share, offline, SEO/accessibility | production-build Playwright для web/TMA; POST search body, canonical URL, stale и narrow layout  |
| Bookmarks                                       | unique database row integration и client component tests; mutation требует auth/CSRF/idempotency |
| Утечка через события                            | AsyncAPI closed fields и integration payload assertion                                           |

Поиск передаёт запрос только POST body и читает только `ContentPublicProjection`. Candidate, draft, preview,
revision history и bookmark graph не попадают в public DTO. Preview требует отдельной staff capability, получает
`private, no-store` и `noindex,nofollow`. Снятие удаляет публичную projection вместе с `search_vector`; событие
содержит только opaque article/revision IDs, aggregate version и outcome.

## Ручной source enable checklist

Перед каждым реальным включением независимо подтверждаются и прикладываются к immutable policy:

1. юридическое лицо издателя, canonical origin, точный RSS/API endpoint и владелец проверки;
2. URL и версия условий, evidence права на fetch, хранение metadata/excerpt, переработку и публикацию;
3. отдельное evidence для full text и media либо явный запрет этих use classes;
4. attribution text, обязательная source link и поведение при недоступности или отзыве;
5. robots/API rules, rate/cache limits, security и SSRF review;
6. privacy/commercial review, территория, языки, срок действия и дата повторной проверки;
7. takedown contact/process и проверка очистки public projection, search, cache, media и queue.

Неполный, истёкший или неподтверждённый checklist оставляет source в `PROPOSED`/`PAUSED`; скриншот сайта или
успешный HTTP-ответ не является evidence.

## Незакрытые gates

- PostgreSQL/Redis integration требует применённых миграций и доступных сервисов. Static SQL и unit harness не
  заменяет runtime-проверку trigger, advisory lock, конкурентного scheduler, bookmark uniqueness и BullMQ retry.
- Browser evidence считается полным только после реального запуска `npm run test:e2e`; component/jsdom test не
  заменяет production-build Chromium, offline transition, canonical metadata и viewport 360 px.
- Перед первым реальным источником обязательны юридическая проверка конкретных актуальных условий и сохранение
  evidence. Текущий нулевой реестр нельзя трактовать как разрешение на любой feed.
- Production cache/CDN purge, object storage erasure, backup erasure, мониторинг и размещение данных в России
  проверяются эксплуатационным этапом и здесь не заявляются выполненными.
