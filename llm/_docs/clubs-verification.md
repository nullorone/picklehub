# Проверка клубов

Документ фиксирует матрицу, автоматизированные подтверждения и остаточные риски этапа
`09-clubs/05-verification`. Он не подтверждает production-инфраструктуру, юридическое соответствие или готовность
будущих турниров, платежей и клубного XP.

## Модель угроз

Защищаемые инварианты — единственный владелец, активное членство, terminal-заявки и приглашения, клубные роли,
canonical-связь площадки, неизменяемая атрибуция готового матча, уникальная календарная позиция серии и уникальный
confirmed marker. Недоверенные границы — platform role, роль или membership другого клуба, pending intent,
устаревшая revision, повтор idempotency key, параллельное решение, повтор worker и скрытая клиентом кнопка.

Основные угрозы и меры:

- доступ по `PlatformRole`, membership другого клуба или client claim закрывается повторным чтением активного
  membership по точным `clubId + userId`; owner/admin/member не дают обратного доступа в platform administration;
- параллельные join/approve/invite/transfer сериализуются блокировкой корня и optimistic version, а partial unique
  indexes и deferred owner constraint не допускают двух memberships, нуля или двух владельцев на commit;
- pending request/invite не даёт прав, terminal transition не переоткрывается, а принятие invite supersede-ит
  ожидающую заявку в одной транзакции;
- calendar key `ruleId + local date/time`, explicit overlap policy и сохранённая gap/pause occurrence делают retry,
  DST и resume детерминированными; отмена отдельного матча не меняет правило или соседнюю встречу;
- venue merge разрешается в публичной карточке в canonical survivor и дедуплицируется, но исходная связь и
  исторический `Match.venueId` не переписываются; непубличная площадка без survivor скрывается;
- завершённый клубный матч считается только по уникальному `CONFIRMED_MATCH` marker, а не по mutable match state,
  клиентской аналитике или доступности провайдера.

## Матрица сценариев

| Область                | Позитивный сценарий                                                                           | Отрицательный или конкурентный сценарий                                                         | Подтверждение                            |
| ---------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `OPEN`                 | join сразу создаёт один `MEMBER`                                                              | два одновременных join дают не более одного active membership                                   | PostgreSQL integration + unique index    |
| `APPROVAL`             | approve создаёт membership                                                                    | pending requester не читает roster; approve против invite acceptance сходится в один membership | PostgreSQL integration                   |
| `INVITE_ONLY`          | адресный invite принимается invitee                                                           | самостоятельный join и чужой token запрещены; revoke/decline/expiry terminal                    | integration + contract/data policy       |
| Выход/исключение/block | member выходит, manager исключает или блокирует в своей иерархии                              | owner не выходит и не понижается; block запрещает новый intent                                  | integration + owner constraint           |
| Ownership              | target membership становится owner, прежний owner — admin                                     | конкурентный transfer/stale revision не оставляет ноль или двух owners                          | integration + deferred trigger           |
| Изоляция               | owner/admin управляет своим клубом                                                            | platform role, member, outsider и owner другого клуба получают scoped отказ                     | unit + integration + source policy       |
| Серия                  | позиции материализуются в независимые матчи                                                   | duplicate worker не создаёт дубль; archive/pause/gap занимают позицию без backlog               | timezone unit + integration + SQL policy |
| DST                    | Moscow/fractional offset однозначны; overlap выбирает явный offset                            | Berlin spring gap получает `SKIPPED_DST_GAP`                                                    | timezone unit + SQL resolver policy      |
| Изменение/отмена       | новый template version действует только вперёд; один match отменяется обычным match lifecycle | соседний match и правило не меняются, ended rule не возобновляется                              | integration + contract policy            |
| Площадка               | published canonical venue привязывается                                                       | merge показывает survivor; unlink/retraction не удаляет venue, club или historical match        | integration + FK/source policy           |
| Сквозной путь          | membership → recurring occurrence → join match → start → result → confirmation                | proposed/disputed/retry не увеличивают confirmed total                                          | PostgreSQL integration + metrics unit    |

## Автоматизированные подтверждения

- `backend/test/unit/club-policy.spec.ts` проверяет роли и обязательный scope точного клуба;
- `backend/test/unit/club-timezone.spec.ts` проверяет gap/overlap, Moscow, fractional offset и calendar arithmetic;
- `backend/test/unit/club-metrics.spec.ts` доказывает источник confirmed-метрики и безопасные `origin/format` срезы;
- `backend/test/unit/club-venue-projection.spec.ts` проверяет canonical merge, дедупликацию и скрытие непубличной
  ссылки без PostgreSQL;
- `backend/test/integration/clubs-backend.integration-spec.ts` покрывает три membership policy, гонку request/invite,
  leave/block, межклубный отказ, transfer/last owner, duplicate generation, archive, независимую отмену, venue merge
  и сквозное подтверждённое завершение; suite требует PostgreSQL и Redis;
- `contracts/scripts/clubs-verification-policy.test.mjs` статически связывает source, migration и privacy/tenant
  границы; существующие club contract/data tests проверяют OpenAPI, AsyncAPI и SQL;
- `frontend/web/src/clubs-ui.test.tsx`, `frontend/tg/src/clubs-ui.test.tsx` и `test/e2e/clubs.spec.ts` проверяют parity,
  server 403/409, zero-venue, offline/stale состояния и защищённый invitation deep link.

## Метрики

`ClubMetricsService.confirmedMatches` читает только уникальные `match_metric_markers` типа `CONFIRMED_MATCH` через
неизменяемую club attribution. Один recurring match входит в общий total ровно один раз и лишь получает dimension
`RECURRING_RULE`; proposal, dispute, повтор confirmation/outbox delivery и analytics retry не являются источником.
Возвращаются только total и закрытые `origin/format` buckets без roster, member graph, venue, точного расписания или
пользовательских идентификаторов.

Membership conversion, rolling active clubs и recurring fill остаются определёнными в `analytics-plan.md` и не
выдаются этим внутренним confirmed projection за уже опубликованный dashboard. Production-агрегация обязана
сохранять cohort/consent/minimization правила и отдельный immutable fill snapshot на scheduled start.

## Остаточные риски и gates

- PostgreSQL/Redis integration и browser E2E считаются успешными только в окружении, где реально доступны сервисы
  и Chrome; статические либо unit-тесты не заменяют эти запуски.
- Tzdata version берётся из Node runtime; обновление production tzdata требует regression на сохранённых policy и
  календарных позициях до rollout.
- Production dashboard, fill snapshot worker, observability alerts, backup/restore и проверка размещения данных в
  России остаются последующими эксплуатационными gates и здесь не заявляются выполненными.
