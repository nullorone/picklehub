# Проверка доверия и безопасности

Документ фиксирует threat model, матрицу авторизации и прослеживаемость этапа
`07-trust-safety/05-verification`. Результат проверки не является legal approval, разрешением собирать реальные
safety-данные или подтверждением production staffing. Административный HTTP API и платформенные роли появляются
в `08-admin-backoffice`; до этого moderator repository остаётся внутренней capability без публичного маршрута.

## Threat model

### Активы и границы

- Закрытые активы: текст отзыва, evidence обращения, ответ стороны, апелляция, связь reporter-subject, case,
  assignment, decision basis и sanction detail.
- Минимальные player projections: собственная квитанция, broad category/status/outcome и собственный отправленный
  текст. Публичная проекция содержит только обратимый средний рейтинг и размер выборки после пяти независимых
  eligible источников.
- Trust/safety store является владельцем signal, case, evidence, decision и effect. Communications владеет
  физическим block graph, profiles — статистической проекцией no-show, outbox передаёт только opaque ID и broad
  category.
- Недоверенные границы: браузер/TMA, query string и request body, повторная доставка HTTP, параллельные команды,
  публичный profile API, telemetry/error reporting, outbox/BullMQ/DLQ и административный caller.

### Угрозы и проверки

| Угроза                                                              | Защита                                                                                                                                  | Регрессия                                                                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Неучастник или просроченный caller создаёт signal                   | Проверка source revision, состава и окон review/no-show/report до сохранения                                                            | PostgreSQL integration: eligibility и stage-03 backend scenarios                                               |
| Retry или гонка умножают signal/case/effect                         | 24-часовой transport idempotency, reporter + business-key unique, serializable transaction, unique no-show effect                       | Concurrent same-key и distinct-key duplicate в `trust-safety-backend.integration-spec.ts`; SQL migration suite |
| Обвинение становится публичным фактом                               | Reports не входят в public reputation; порог применяется только к eligible reviews                                                      | Public threshold integration и contract policy scan                                                            |
| Reporter читает данные subject или subject читает evidence reporter | Caller-scoped projection; чужой/отсутствующий receipt одинаково даёт 404; subject получает только safe status и собственный ответ       | Actor matrix integration assertions                                                                            |
| Сотрудник читает case без необходимости                             | Нет moderator HTTP route; restricted read требует exact assignment и отсутствие conflict на каждом запросе; отказ аудируется            | Assigned/unassigned repository integration assertions                                                          |
| Block обходится через обратное направление или очередь              | Один physical edge запрещает взаимодействия в обе стороны; block завершает pending request/waitlist; unblock не восстанавливает прошлое | Interaction policy и match join integration assertions, Web/TMA browser journey                                |
| Narrative уходит в telemetry или производный sink                   | Шифрование с record-bound AAD; allowlist event payload; recursive structured-log redaction; safety UI не вызывает analytics/error SDK   | Crypto unit test, redaction canaries и verification source scan                                                |
| Модератор меняет case без следа                                     | Optimistic revision, SQL transition guard и минимальная append-only audit entry в одной транзакции                                      | Полный реализованный путь `OPEN → TRIAGED → ASSIGNED → INVESTIGATING → DECIDED` с точным audit trail           |
| Реклама закрывает критическое действие                              | Safety surfaces имеют `data-ad-free`, не содержат ad slot/third-party embed                                                             | Web/TMA component и production-build Playwright journey                                                        |

## Матрица авторизации

`Разрешено` означает минимально необходимый ответ. Любой другой доступ запрещён. Назначение само по себе не заменяет
будущую проверку platform role на административной границе.

| Actor                               | Собственный список       | Safe detail известного receipt                          | Evidence reporter                       | Case/evidence repository | Публичный aggregate         |
| ----------------------------------- | ------------------------ | ------------------------------------------------------- | --------------------------------------- | ------------------------ | --------------------------- |
| Заявитель                           | Разрешено                | Разрешено                                               | Только собственный текст                | Запрещено                | Только threshold projection |
| Обвиняемый                          | Не включает чужой signal | Только по выданному exact receipt; без текста заявителя | Запрещено                               | Запрещено                | Только threshold projection |
| Посторонний игрок                   | Только свои записи       | 404 как для отсутствующей записи                        | Запрещено                               | Запрещено                | Только threshold projection |
| Moderator, назначен, без conflict   | Нет player bypass        | Нет player bypass                                       | Через restricted repository             | Разрешено и аудируется   | Как публичному caller       |
| Moderator, не назначен или conflict | Нет player bypass        | Нет player bypass                                       | Запрещено                               | 403 и denied audit       | Как публичному caller       |
| Superadmin                          | Нет неявного bypass      | Нет неявного bypass                                     | Запрещено до отдельного break-glass API | Запрещено до этапа 08    | Как публичному caller       |
| Editor                              | Нет неявного bypass      | Нет неявного bypass                                     | Запрещено                               | Запрещено                | Как публичному caller       |
| Ads manager                         | Нет неявного bypass      | Нет неявного bypass                                     | Запрещено                               | Запрещено                | Как публичному caller       |

Этап 08 должен добавить role check перед вызовом repository. Superadmin не наследует постоянный доступ к evidence:
break-glass должен быть адресным, срочным, обоснованным и аудируемым. До появления этой границы внутренний service
не экспортируется контроллером, поэтому отсутствие роли не может превратиться в HTTP-доступ.

## Privacy и retention scan

- Primary store: narrative сохраняется только как authenticated ciphertext; searchable metadata содержит category,
  source revision, checksums и сроки, но не plaintext.
- Player response: reporter видит только собственный submitted evidence; subject не получает его. Case ID,
  reporter count, assignment, priority, basis и sanction detail отсутствуют в wire projection.
- Logs и error metadata: recursive redactor удаляет `evidence`, `submittedEvidence`, `reviewText`, `responseText`,
  `appealText` и `reportDescription` на любой глубине. Error objects логируются только по типу.
- Analytics: safety narratives и graph identifiers отсутствуют в типизированной таксономии; safety UI не вызывает
  analytics и не подключает error-report SDK. Operational metrics используют только broad category/count.
- Async processing: четыре `safety.*.v1` envelope содержат один opaque entity ID и broad category. Narrative,
  reporter, subject, reason, status и outcome запрещены contract policy.
- Retention: evidence/response очищаются в primary, cache, queue/DLQ и export; idempotency payload живёт 24 часа;
  backup истекает за 35 суток и после restore применяет suppression ledger. Legal hold ограничен case и record scope.

Фактический cleanup worker, backup restore drill, production error provider и legal hold execution ещё не созданы.
Они остаются production gates, поэтому текущая проверка подтверждает contract/code boundary, а не выполненное
удаление в production.

## Автоматизированное покрытие

- Contract/data policy: минимальная receipt schema, запрет полей в AsyncAPI, шифрование, state/unique/append-only SQL
  guards, retention statements и verification source scan.
- Backend unit: authenticated encryption/AAD и canary redaction для логов/error metadata.
- PostgreSQL integration: review threshold, concurrent/deduplicated no-show, caller matrix, assigned evidence,
  two-way block/unblock и полный audit trail реализованного moderation lifecycle.
- Web/TMA component: emergency boundary, exact source revision, offline deny, очистка текста, доступный focus,
  block confirmation и отсутствие ad slot.
- Playwright на production builds: одинаковые Web/TMA journeys обращения, no-show, block/unblock, idempotency header,
  очистка narrative из DOM и ad-free критическая поверхность.

PostgreSQL integration требует доступной тестовой БД, а Playwright — установленного Chromium/Chrome. Если окружение
их блокирует, suite должна быть обнаружена и выполнена в CI; локальная невозможность запуска не считается успехом.
