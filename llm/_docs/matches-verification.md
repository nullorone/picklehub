# Матрица прослеживаемости матчей

Матрица относится к `llm/04-matches/05-verification.md`. Статус «автоматизировано» означает, что проверка входит в
обычные команды репозитория. Статус «подтверждено» выставляется только после фактического успешного запуска в
указанном слое; компиляция теста не заменяет PostgreSQL или браузерное выполнение.

| Риск или требование                                                                    | Уровень                           | Автоматизированное подтверждение                                                         | Статус 2026-09-10                                   |
| -------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Разрешённые и запрещённые переходы агрегата                                            | Unit                              | `backend/test/unit/match-domain.spec.ts`, таблица `allowsMatchTransition`                | Подтверждено                                        |
| Счёт `BEST_OF_1/3/5`, 11/15/21, deuce и отсутствие лишних партий                       | Unit + PostgreSQL                 | `match-domain.spec.ts`; `matches-migration.integration-spec.ts`                          | Unit подтверждён; PostgreSQL ожидает CI             |
| Стабильный score 0–100 и две объяснимые причины                                        | Unit + contract                   | `match-domain.spec.ts`; `contracts/scripts/matches-policy.test.mjs`                      | Подтверждено                                        |
| UTC-конвертация в нескольких IANA-зонах и несуществующее DST-время                     | Unit                              | `frontend/packages/validation/src/index.test.ts`                                         | Подтверждено                                        |
| Два AUTO-кандидата не занимают последнее место одновременно                            | PostgreSQL                        | `matches.integration-spec.ts`; десять повторов в `matches-migration.integration-spec.ts` | Ожидает CI                                          |
| APPROVAL-решения сериализуются, заполненный матч даёт FIFO offer                       | PostgreSQL                        | `matches.integration-spec.ts`                                                            | Ожидает CI                                          |
| Выход освобождает место ровно для головы FIFO                                          | PostgreSQL                        | `matches.integration-spec.ts`                                                            | Ожидает CI                                          |
| Одновременные start/cancel дают один переход и одно событие                            | PostgreSQL                        | `matches.integration-spec.ts`                                                            | Ожидает CI                                          |
| Одновременные proposal и confirm/dispute дают один результат                           | PostgreSQL                        | `matches.integration-spec.ts`                                                            | Ожидает CI                                          |
| Completion marker и outbox event создаются один раз                                    | PostgreSQL                        | `matches.integration-spec.ts`                                                            | Ожидает CI                                          |
| Повторная доставка completion event не удваивает статистику                            | PostgreSQL                        | `matches.integration-spec.ts`; `match-statistics-worker.spec.ts`                         | Unit подтверждён; PostgreSQL ожидает CI             |
| Гость занимает место, но не получает player statistics                                 | PostgreSQL + component            | `matches.integration-spec.ts`; обе версии `matches-ui.test.tsx`                          | Component подтверждён; PostgreSQL ожидает CI        |
| Bearer, CSRF, UUIDv4 idempotency и version headers обязательны                         | Contract                          | `contracts/scripts/matches-policy.test.mjs`; общий OpenAPI policy check                  | Подтверждено                                        |
| Повтор idempotency key не повторяет команду, response зашифрован                       | PostgreSQL + client               | `matches.integration-spec.ts`; обе версии `matches-ui.test.tsx`                          | Client подтверждён; PostgreSQL ожидает CI           |
| Чужой organizer/self action запрещён                                                   | Service + contract                | проверки `organizer`, self и opposite-team в `MatchService`; match contract policy       | Покрыто PostgreSQL-сценариями; ожидает CI           |
| `UNLISTED` отсутствует в discovery, raw token не хранится и не попадает в DOM/referrer | PostgreSQL + policy + Playwright  | `matches.integration-spec.ts`; `matches-data-policy.test.mjs`; `matches.spec.ts`         | Policy подтверждён; PostgreSQL/браузер ожидают CI   |
| Offline mutation отключена, stale version вызывает refetch                             | Component                         | обе версии `matches-ui.test.tsx`                                                         | Подтверждено                                        |
| Нет площадок: показан честный fallback создания публичного адреса                      | Component                         | обе версии `matches-ui.test.tsx`                                                         | Подтверждено                                        |
| `UNKNOWN`, `NOT_BOOKED`, `BOOKED_EXTERNALLY` не имитируют бронирование PickleHub       | Contract + component + Playwright | match contract; обе версии `matches-ui.test.tsx`; `matches.spec.ts`                      | Contract/component подтверждены; браузер ожидает CI |
| Создать → найти → вступить → заполнить состав → начать → результат → подтверждение     | Playwright web + TMA              | два stateful сценария в `test/e2e/matches.spec.ts`                                       | Ожидает CI                                          |

## Обязательный запуск в CI

Среда должна содержать чистые PostgreSQL 16/PostGIS 3.4 и Redis 7.4, а также установленный Playwright Chromium.
После применения всех migrations выполнить:

```sh
npm exec --workspace @picklehub/backend -- jest --config jest.integration.config.cjs --runInBand \
    test/integration/matches-migration.integration-spec.ts test/integration/matches.integration-spec.ts
npm run test:e2e:build
npx playwright test test/e2e/matches.spec.ts --workers=1
```

Успешное подтверждение должно сохранить wall-clock duration и следующие итоговые assertions: ни одна команда не
создала roster сверх capacity; на подтверждённый матч существуют ровно один `match_metric_markers` и один
`match.completed.confirmed.v1`; повторная обработка одного event ID оставила один receipt и `played_count = 1` у
каждого зарегистрированного участника; гостевой слот отсутствует в player statistics.

## Фактический запуск 2026-09-10

- Backend unit: 16 suites, 42 tests, успешно за 4,478 с.
- Web component: 4 файла, 15 tests, успешно за 1,48 с.
- TMA component: 3 файла, 13 tests, успешно за 1,16 с.
- Validation: 1 файл, 6 tests, успешно за 184 мс.
- Production e2e builds: web 217 мс, TMA 171 мс; известны предупреждения о MapLibre chunk 924 кБ и основном TMA
  bundle 514 кБ.
- PostgreSQL suite завершился за 4,191 с до выполнения assertions: sandbox запретил соединения с
  `127.0.0.1:5432` и `127.0.0.1:6379`; Docker socket также недоступен с `permission denied`.
- Playwright обнаружил 5 match tests, включая два полных сценария, но каждый Chrome process завершился `SIGABRT`
  при launch за 1 мс. Browser assertions в этой среде не считаются выполненными.

До зелёных PostgreSQL и Playwright запусков критерий приёмки этапа не объявляется выполненным.
