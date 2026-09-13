# Проверка геймификации

Документ фиксирует модель корректности, матрицу злоупотреблений, автоматизированные подтверждения и незакрытые
runtime-gates этапа `11-gamification/05-verification`. Он не подтверждает применение миграций, доступность
production-инфраструктуры или юридическую готовность обработки персональных данных.

## Модель корректности

Источником отображаемого XP служит только append-only `XpLedgerEntry`. Для одного пользователя, scope, source kind,
source event, версии правила и kind допускается одна запись. `AWARD/POSTED` и `REINSTATEMENT/POSTED` прибавляют
сохранённую сумму, `REVERSAL/POSTED` вычитает её, а `PENDING` и terminal `CAPPED` не входят в баланс. Проекция не
является источником истины: полный rebuild читает тот же ledger и обязан получить те же net XP, achievement state и
seasonal ranks, что и последовательное обновление.

Event consumer сериализует один source advisory lock, дедуплицирует `message_id` и owning source revision, а позднюю
старую revision сохраняет как `STALE`. Формула выбирается по `source_occurred_at` и immutable rule snapshot. Global и
каждый club являются отдельными partitions; выход замораживает клубный баланс и удаляет leaderboard row, повторное
вступление размораживает тот же ledger без backfill или повторной награды.

## Прослеживаемость проверок

| Инвариант                                                  | Автоматизированное подтверждение                                                                                                                          |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicate, late и out-of-order delivery не дают второй XP  | `gamification-verification.spec.ts`: permutation revision simulation; verification policy: processed-event keys, serializable transaction и advisory lock |
| Отмена и восстановление не переписывают историю            | unit permutation ledger; SQL append-only trigger, chain validation и unique compensation indexes                                                          |
| Сумма на экране прослеживается до ledger                   | unit independent signed sum против `GamificationRuleEngine.project`; UI показывает amount, kind, status и rule version                                    |
| Нет скрытого бонуса за победу или счёт                     | unit equal amount для winner/loser metadata; closed SQL enum и runtime policy запрещают winner/score source                                               |
| Fake guest и organizer spam не награждаются                | runtime policy требует registered `PLAYED` participant кроме organizer и не читает `MatchGuestSlot`                                                       |
| Complaint/payment/login/streak spam не является источником | closed `xp_source_kind`, DTO allowlist и verification policy                                                                                              |
| UTC caps и историческая версия правила                     | cap boundary simulation; SQL source-time day/week checks и rule snapshot guard                                                                            |
| Global/club и разные клубы независимы                      | unit partition simulation; runtime queries и partial unique indexes включают exact scope/club                                                             |
| Выход и повторное вступление                               | unit immutable-ledger replay; runtime membership interval, freeze/unfreeze и atomic leaderboard removal checks                                            |
| Смена сезона                                               | SQL half-open interval/no-overlap, immutable snapshot и monotonic state; projection source-time filter                                                    |
| Rebuild эквивалентен последовательной проекции             | unit all permutations give one net/checksum; operator path uses `rebuildAll` and has no analytics dependency                                              |
| Club admin не меняет другой club/global                    | verification policy checks exact `clubId`, active OWNER/ADMIN and no global bulk update                                                                   |
| Leaderboard только по явному consent                       | SQL current opt-in/composite FK/contiguous revisions; API bearer/browser-integrity checks; UI component and browser consent flows                         |
| Privacy, restriction и blocks                              | projection eligibility checks restriction/club block; viewer response removes ID and name; UI renders semantic placeholder                                |
| Доступность и reduced motion                               | web/TMA component suites; browser test for semantic progress, narrow viewport and consent; CSS policy for `prefers-reduced-motion`                        |

## Матрица злоупотреблений

- Повтор сообщения с тем же ID или source revision даёт `DUPLICATE`; новый message для старой revision даёт `STALE`.
- Победа, счёт, login, streak, реклама, платёж, жалоба и создание гостевого места отсутствуют в закрытом source enum.
- Организатор получает award только у обычного подтверждённого матча хотя бы с одним другим зарегистрированным
  `PLAYED`-участником. Гостевой placeholder не имеет `MatchParticipant.userId` и не проходит этот критерий.
- Несколько отзывов одного автора к матчу сводятся к первому active representative; eligibility перечитывается из
  owning review revision. Rating, tags и текст не меняют сумму.
- Club coefficient ограничен `0.5..2.0`; base XP и caps неизменны. Membership проверяется в exact club и в момент
  source event. Архивный клуб не получает отложенное начисление.
- Ограничение или club block удаляет публичную строку при rebuild. Взаимная communication block сохраняет место и XP,
  но заменяет identity на `Скрытый игрок` для конкретного viewer.

## Конкурентность и восстановление

Unit/property tests доказывают чистую арифметику ledger и инвариант порядка. Статические policy tests связывают её с
SQL unique indexes, append-only triggers, compensation guards, source-time caps, current consent FK и competition
rank constraint. Это не заменяет PostgreSQL: реальная проверка должна одновременно доставить duplicate/reordered
messages через Redis/BullMQ, пересечь cap, invalidation/reinstatement, membership leave/rejoin и opt-out, затем
сравнить materialized projection с `gamification:rebuild` в одной зафиксированной fixture.

## Незакрытые gates

- В текущей sandbox-среде loopback к PostgreSQL и Redis запрещён. Обе gamification migrations, SQL triggers,
  advisory-lock concurrency, BullMQ redelivery и rebuild checksum на реальной БД здесь не исполняются.
- Browser E2E добавлен для production builds web/TMA, включая узкий viewport и emulated reduced motion. Локальный
  Chrome в предыдущем этапе завершался `SIGABRT` до первого step; результат текущего запуска фиксируется в журнале,
  и успешный browser runtime не объявляется без фактического выполнения.
- Антифрод policy удерживает подозрительный award, но полноценные moderator evidence/appeal operational drills и
  product guardrail alerting требуют production-like observability и обезличенной тестовой выборки.

До закрытия database/queue gate статические, unit, component, contract и build проверки подтверждают доступные
инварианты, но не доказывают конкурентное runtime-поведение PostgreSQL/BullMQ.
