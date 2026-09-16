# Итоговый аудит готовности PickleHub к эксплуатации

Документ фиксирует результат `16-production-readiness/05-verification.md` на 16 сентября 2026 года. Это
независимый аудит репозитория и локально доступных проверок, а не разрешение на production-развёртывание,
юридическое заключение или подтверждение российского размещения данных. Итоговое решение для публичного запуска —
**`NO-GO`**. Внешнее развёртывание не выполнялось и остаётся запрещено без явной авторизации.

Статусы в отчёте имеют строгий смысл:

- `PASS` — указанная проверка действительно выполнена в этом аудите либо воспроизводимо обеспечена обязательным
  тестом репозитория;
- `PARTIAL` — локальный слой проверен, но обязательное runtime/инфраструктурное доказательство отсутствует;
- `BLOCKED` — критическое доказательство отсутствует; такой статус нельзя трактовать как принятое исключение;
- `NOT APPLICABLE` — действие намеренно не входит в авторизованный объём, например production deploy.

## 1. Трассировка критериев этапов 01–04

### Требования и выпуск

| Критерий                                                                 | Подтверждение                                                                | Статус  |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------- |
| Пять критических сценариев имеют SLI/SLO и бюджеты ошибок                | `production-readiness-requirements.md`, schema 1 metrics, dashboard и alerts | PARTIAL |
| Неизвестный baseline не выдан за измеренный                              | Все цели помечены `PROVISIONAL`; 14/30-дневного отчёта нет                   | PASS    |
| Capacity, RTO/RPO, retention/export/deletion и severity заданы           | Requirements и backend runbooks задают gates, классы и процедуры             | PARTIAL |
| Сбой каждого провайдера имеет честную деградацию                         | Kill switches, bounded circuit breaker и unit/integration failure tests      | PARTIAL |
| Внутренний, invited, pilot и широкий rollout имеют stop/rollback условия | Requirements §8 и client rollout orchestration                               | PASS    |
| Критический security/legal/provider gate блокирует публичный запуск      | Requirements §9–10 и матрица решения ниже                                    | PASS    |

Наблюдаемость локально проверяет только форму и allowlist. Baseline реального трафика, маршрутизация alert,
доставка page, DB pool/disk/replica lag, queue wait и provider SLI не подтверждены.

### Контракты, данные и миграции

| Критерий                                                                        | Подтверждение                                                                 | Статус  |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------- |
| Health/readiness/metrics версионированы и не раскрывают topology/секреты        | TypeSpec/OpenAPI, policy test, controller/unit tests                          | PASS    |
| REST/events/generated clients проверяются на drift и соседнюю совместимость     | `contracts:breaking`, `contracts:generated:check`, contract typecheck         | PASS    |
| Каждая миграция имеет disposition, lock/runtime и recovery assessment           | `production-readiness-contract-data.md` и static data policy                  | PASS    |
| Разрушающие пути имеют безопасный expand/migrate/contract runbook               | Пять путей явно имеют `BLOCKED`; утверждённых replacement runbooks пока нет   | BLOCKED |
| Privacy lifecycle, suppression, legal hold, object/reconciliation schema заданы | Migration `20260916190000_production_readiness_contract_data`                 | PASS    |
| Clean/upgrade apply и lock timing доказаны на PostgreSQL/PostGIS                | Live migration job и production-like filled dataset в этой среде недоступны   | BLOCKED |
| Environment/secret ownership и rotation определены                              | Матрица и role owners определены; люди и фактические rotation tests не заданы | PARTIAL |

Применённые migration-файлы нельзя переписывать для получения зелёного результата. До выпуска DBA обязан заменить
каждый `BLOCKED` путь новой reviewed migration/runbook и предъявить clean/upgrade/lock/forward-fix evidence.

### Backend, устойчивость и восстановление

| Критерий                                                                    | Подтверждение                                                                  | Статус  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------- |
| Runtime/migration images многоэтапные, non-root и без dev dependencies      | Dockerfiles и CI inspection policy; daemon run в этом аудите недоступен        | PARTIAL |
| Graceful shutdown, readiness и resource limits заданы                       | Lifecycle tests, Compose config и smoke-script                                 | PARTIAL |
| Logs/metrics/traces редактируют запрещённые поля                            | Redaction, request-context и operational-metrics unit canaries                 | PASS    |
| Timeout/circuit/retry/kill switch не создают ложный success                 | Unit tests и provider failure integration paths                                | PASS    |
| Зафиксированный outbox переживает queue/provider failure                    | PostgreSQL-authoritative design и unit/integration tests                       | PARTIAL |
| Backup действительно восстановлен и RTO/RPO измерены                        | Скрипты и Compose drill существуют; Docker/PITR/provider rehearsal не выполнен | BLOCKED |
| Redis loss, outbox quarantine/DLQ replay и object reconciliation отработаны | Runbooks существуют; полный live drill и сверка отсутствуют                    | BLOCKED |
| Managed services, backups, logs и monitoring подтверждены в РФ              | Ни provider account, ни region/contract evidence не предоставлены              | BLOCKED |

### Клиенты, CI/CD и supply chain

| Критерий                                                                  | Подтверждение                                                               | Статус         |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------- |
| PR не развёртывает и обязательный job failure блокирует release candidate | Workflow policy test и read-only PR workflow                                | PASS           |
| Web/PWA и TMA — отдельные commit-bound артефакты с digest inventory       | Release build/verifier и rollback drill                                     | PASS           |
| Production config запрещает wildcard CORS, dev/Ton markers и source maps  | Environment и artifact policy tests                                         | PASS           |
| CSP/security/cache policy разделяет web и Telegram framing                | Nginx configs, release policy и browser specs                               | PASS           |
| Canary, smoke, rollback и mutable-shell purge готовы                      | Provider-neutral scripts; фактический provider rollout не выполнялся        | PARTIAL        |
| Mobile export проверен, но store publication не автоматизирован           | Production-mode unsigned Expo audit; `eas.json` отсутствует                 | PASS           |
| Проверенный SHA имеет CI/provenance/registry evidence                     | Workflow реализован; GitHub run/attestation/registry signing не запускались | BLOCKED        |
| DNS/CDN/TLS/BotFather/deep links настроены                                | Внешние изменения не авторизованы                                           | NOT APPLICABLE |

## 2. Выполненные проверки репозитория

Аудит выполнялся на Node.js `22.19.0` и npm `10.9.3`. Полные фактические команды, числа suites/tests и ограничения
среды записаны в `ai-development-log.md`. Канонический локальный набор:

```bash
npm ci --ignore-scripts
npm run workspace:check
npm run format:check
npm run docs:check
npm run release:policy
npm run contracts:check
npm run lint
npm run typecheck
npm test
EXPO_NO_TELEMETRY=1 npm run build -- --env-mode=loose
npm run test:e2e
npm run compose:smoke
npm audit --omit=dev --audit-level=high
npm run ci:licenses
```

`PASS` разрешено ставить только отдельной команде, завершившейся с кодом `0`. Если агрегат остановился на
ограничении среды, успешно завершившиеся до него подкоманды перечисляются отдельно, а агрегат не называется
успешным. Контейнерный, browser, registry и сетевой CI обязаны повторить локально заблокированные проверки для
того же полного commit SHA.

### Результат этого прогона

| Проверка                                  | Фактический результат                                                                                    | Итог    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------- |
| Чистая установка                          | 2 109 packages; принятый повтор с `NODE_TLS_REJECT_UNAUTHORIZED` unset и `strict-ssl=true`               | PASS    |
| Workspace/format/docs/whitespace          | 9 workspaces, 15 TypeSpec и 150 Markdown-файлов; ошибок нет                                              | PASS    |
| Контракты и generated drift               | 238 REST operations, 69 messages, 199 policy tests, compatibility/types/mock                             | PASS    |
| Lint/typecheck/unit/build без Turbo cache | 40/40 задач; backend 53/53 suites и 309/309 tests; web/TMA/mobile/game builds                            | PASS    |
| Release policy/artifacts/local rollback   | 4 policy и 5 audit tests; два commit-bound artifacts; atomic switch/rollback                             | PASS    |
| Browser E2E                               | Typecheck/build успешны; 41 сценарий не стартовал из-за Chrome `SIGABRT`/sandbox `kill EPERM`            | BLOCKED |
| PostgreSQL/Redis integration и race       | Prisma client сгенерирован; socket connect отклонён sandbox `EPERM`, assertions не считаются пройденными | BLOCKED |
| Compose/images/graceful shutdown/restore  | Config и shell syntax валидны; Docker daemon socket недоступен                                           | BLOCKED |
| Dependency licenses и CycloneDX           | 945 production dependency licenses; SBOM содержит 625 components                                         | PASS    |
| Vulnerability и secret history scan       | Registry DNS `ENOTFOUND`; `gitleaks` в среде отсутствует                                                 | BLOCKED |

Первый вызов `npm ci` обнаружил унаследованные `NODE_TLS_REJECT_UNAUTHORIZED=0` и npm `strict-ssl=false`. Его
результат не принят; установка повторена с принудительной TLS-проверкой. Infrastructure owner обязан удалить эти
настройки из runner/developer environment и добавить fail-fast CI assertion: иначе любой будущий сетевой gate
ненадёжен. Deprecated dependency warnings также не заменяют vulnerability report и требуют triage после доступного
registry audit.

## 3. Нагрузка, конкуренция и критический путь

Unit и integration suites покрывают повтор magic link/session, последнее место и waitlist, подтверждение
результата, chat/outbox idempotency, единственную XP/reward запись, campaign caps и tournament transitions.
Это regression evidence доменных инвариантов, но не capacity evidence.

Перед invited pilot performance owner должен на production-like РФ-контуре выполнить воспроизводимый профиль:

1. применить всю migration chain к чистой и предыдущей заполненной schema, записав lock/statement timing;
2. дать 2× ожидаемой sustained и 4× burst нагрузки для auth, search, join, chat и completion с раздельными p95/p99;
3. одновременно атаковать последнее место, duplicate result/XP/reward, idempotency key и outbox lease;
4. перезапустить API/worker и потерять Redis между commit и delivery, затем сверить PostgreSQL high-water mark;
5. сохранить dataset generator, hardware/provider plan, commit, команды, raw summary без PII и интерпретацию.

Порог — ноль переполнений состава, двойных итогов/наград и потерянных committed событий. До такого отчёта capacity
и конкурентное выполнение имеют статус `BLOCKED`, даже если unit/integration regression зелёные.

## 4. Учебные сбои и восстановление

| Упражнение                           | Доступное evidence                                          | Итог    | Для закрытия                                                                 |
| ------------------------------------ | ----------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| Редактирование чувствительных данных | Recursive canaries logs/errors/metrics и запрещённые labels | PASS    | Повторить canary на выбранном external exporter                              |
| Provider failure/circuit recovery    | Bounded timeout/open/half-open unit и disabled adapters     | PARTIAL | Уполномоченный staging outage с выбранными provider adapters                 |
| Client rollback                      | Atomic directory switch и artifact identity drill           | PARTIAL | Canary/rollback через reviewed deployment и cache adapters                   |
| Redis loss                           | DB-authoritative design и runbook                           | BLOCKED | Остановить staging Redis, восстановить новый instance и сверить backlog      |
| Outbox/queue recovery                | Single-event retry commands и idempotency tests             | BLOCKED | Quarantine/DLQ/restart drill с high-water и consumer receipts                |
| Logical backup/restore               | Checksum и disposable restore scripts                       | BLOCKED | Выполнить скрипт на разрешённом Docker host, записать RTO/RPO/reconciliation |
| Managed PITR                         | Требование и порядок проверки                               | BLOCKED | Provider-native point-in-time restore в isolated project                     |
| Object storage/provider outage       | Fail-closed policy и reconciliation schema                  | BLOCKED | Missing/orphan/quarantine drill на выбранном РФ-хранилище                    |
| Alert/page delivery                  | Dashboard и Prometheus rules                                | BLOCKED | Test alert до primary и независимого backup, сохранить UTC receipt           |

Drill не считается успешным по наличию скрипта. В evidence нужны UTC start/end, release SHA, синтетический dataset,
фактические RTO/RPO, high-water marks, reconciliation result, участники и незакрытые findings без credentials/PII.

## 5. Эксплуатационный handbook

### Развёртывание и откат

Release owner использует только проверенный immutable SHA и порядок: approvals → backup/PITR marker → migration
preflight → один migration job → schema/C0 smoke → API canary → worker → web/TMA canary → наблюдение → promote.
`deploy/compose.production.yml` является reference, а не production topology. Секреты передаются manager-ом,
credentials в manifest/CLI запрещены. При failed smoke, zero-budget invariant, unknown data transfer или exhausted
error budget rollout останавливается. Сначала выключается capability/cohort и возвращается совместимый artifact;
schema не откатывается вслепую — применяется approved forward-fix либо isolated restore.

### Инциденты

Incident commander классифицирует событие по `SEV-0..3`, замораживает rollout и ведёт UTC timeline только с
request/correlation ID. В ticket/chat нельзя копировать email, init data, token, chat/safety text, координаты,
object key или provider payload. Runbooks C0/C1, outbox/DLQ, privacy/reconciliation, saturation и telemetry находятся
в `production-readiness-backend.md`. До invited pilot назначаются primary и независимый backup, проверяются page,
break-glass, legal escalation и blameless review. Без реального 24×7 приёма `SEV-0/1` широкий круглосуточный доступ
запрещён.

### Карта приватности и данных

| Класс                         | Authoritative storage                      | Производные sinks                                | Release gate                                                                   |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------ |
| Identity/session/consent      | PostgreSQL РФ, encrypted/keyed credentials | Redis TTL, audit, bounded operational metrics    | Legal basis, residency, rotation, export/deletion и backup suppression         |
| Profile/match/club/tournament | PostgreSQL/PostGIS РФ                      | Public projections, Redis/cache, outbox          | Access purpose, retention, object inventory и reconciliation                   |
| Chat/notification/safety      | PostgreSQL РФ, restricted ciphertext       | BullMQ/DLQ, approved providers, audit            | No content in telemetry; provider DPA/residency; deletion/appeal/legal hold    |
| Media/content                 | Approved РФ object storage + PostgreSQL    | CDN/search/cache только approved/public revision | Rights/provenance, takedown, locator encryption, missing/orphan reconciliation |
| Analytics/advertising         | Consented allowlist/aggregates             | Только approved РФ processor                     | Consent/legal review, low cohorts, no precise location/device/ad ID            |
| Logs/metrics/backups          | Restricted РФ operational sinks            | Approved monitoring и encrypted backup           | Redaction canary, access/retention, PITR/restore и deletion replay             |

Полный field-level inventory и предлагаемые сроки находятся в `security-privacy.md` и feature data-policy
документах. Все сроки остаются предложениями до legal approval. Трансграничная передача и production snapshots в
non-production запрещены; неизвестный sink блокирует новый сбор.

### Демонстрация внутреннего этапа

Демонстрация проводится только на синтетических данных и не заменяет тест. Ведущий показывает release SHA и
успешные CI gates, вход, поиск, atomic join, chat reconnect, подтверждение результата, admin/safety audit, затем
отключает C2 capability и демонстрирует честное degraded состояние. После этого показываются readiness/metrics без
PII, outbox backlog/recovery и rollback клиента к предыдущему manifest. Нельзя показывать реальные контакты,
Telegram init data, точные перемещения, safety/chat content или объявлять провайдера/РФ-размещение проверенными.
Протокол фиксирует дату, роли, commit, сценарии, findings и ссылки на CI/drill evidence.

### AI workflow

Редактируемыми источниками являются requirements/TypeSpec/AsyncAPI/Prisma/code; generated OpenAPI и клиенты вручную
не меняются. Агент выполняет ровно один prompt, сохраняет чужие изменения, не ослабляет gates и записывает точные
команды, результаты, риски и следующий prompt в `ai-development-log.md`. AI-generated statement не является
evidence внешнего deploy, legal approval, provider terms, human ownership или физического теста.

## 6. Матрица решения о запуске

| Gate                                      | Решение | Ответственный владелец роли      | Как получить достаточное evidence                                                       |
| ----------------------------------------- | ------- | -------------------------------- | --------------------------------------------------------------------------------------- |
| Security threat/redaction/access review   | NO-GO   | Security owner + reviewer        | Закрыть P0, exporter canary, access/break-glass и secret rotation drill                 |
| 152-ФЗ, возрастной риск и notices         | NO-GO   | Legal owner                      | Актуальное письменное заключение, основания, сроки, incident/subject-rights procedures  |
| РФ-локализация всех primary/backup/sinks  | NO-GO   | Infrastructure + legal owners    | Provider contracts, region screenshots/API evidence и проверка data-flow                |
| Telegram/email/maps/OSM/content/ads       | NO-GO   | Integration + legal owners       | Versioned terms/DPA/quota/attribution register и production-account smoke               |
| Пять SLI и 14/30-дневный baseline         | NO-GO   | SRE owner                        | Dashboard queries, sample sizes, alert delivery и burn report без PII                   |
| Capacity и конкурентные инварианты        | NO-GO   | Performance + domain owners      | Reproducible 2×/4× load/race report на production-like plans                            |
| Миграции соседних версий                  | NO-GO   | DBA + backend owner              | Replacement пяти blocked paths, filled upgrade timing и approved forward-fix            |
| Backup/PITR, Redis/outbox/object recovery | NO-GO   | Recovery owner + independent DBA | Timestamped restore/outage/reconciliation drill с фактическими RTO/RPO                  |
| Incident response и дежурство             | NO-GO   | Incident commander               | Именной roster/backup, page test, tabletop и review actions                             |
| CI, artifacts и provenance для SHA        | NO-GO   | Release owner                    | Успешный mandatory workflow, signed/attested immutable artifacts и branch protection    |
| Privacy export/deletion/retention         | NO-GO   | Privacy + legal owners           | End-to-end synthetic request, sink receipts, overdue alert и backup-expiry verification |
| Pilot analytics                           | NO-GO   | Product owner                    | Не менее 30 eligible matches, denominator и ≥50% confirmed conversion                   |

Ни одна роль в таблице пока не назначена конкретному человеку, независимые approvals отсутствуют. Владелец не
может сам одобрить собственное security/legal исключение. После закрытия строк release owner создаёт новый
датированный audit appendix; этот документ нельзя просто переключить на `GO` без ссылок на неизменяемые evidence.

## 7. Окончательное решение

Репозиторий содержит значимый локально проверяемый reference для внутреннего этапа, но критерии production readiness
не выполнены полностью. Публичный и invited production — **`NO-GO`**. Допустимы только локальная/CI проверка и
внутренняя демонстрация на синтетических данных. Следующее действие — не deployment, а назначение владельцев и
закрытие migration, live recovery/load, security/legal/residency/provider и SLO evidence из матрицы выше.
