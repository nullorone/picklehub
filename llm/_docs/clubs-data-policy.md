# Контракты и данные клубов

Документ фиксирует решения этапа [`09-clubs/02-contract-data`](../09-clubs/02-contract-data.md). TypeSpec в
`contracts/rest/clubs.tsp`, `asyncapi.yaml`, Prisma schema и additive migration являются исполняемыми источниками;
этот текст объясняет границы и не заменяет их.

## API и авторизация

Публичны только поиск активных клубов, карточка клуба и ссылки на опубликованные canonical площадки. Остальные
операции требуют player bearer; backend повторно получает активное `ClubMembership` именно по `clubId` и применяет
фиксированную матрицу `OWNER` / `ADMIN` / `MEMBER`. Platform role, роль организатора матча и membership другого
клуба прав не дают. Все ответы имеют `Cache-Control: no-store`; browser-мутации требуют Origin, CSRF и UUIDv4
idempotency key. Cursor связан с фильтрами и snapshot, page limit не превышает 100.

Hard delete клуба отсутствует. `archive` и `restore` — versioned переходы с закрытой причиной; ownership transfer,
изменение роли, exclusion и block используют также ожидаемую revision target. Raw invitation capability выдаётся
один раз, имеет не менее 128 бит энтропии и семь суток жизни; в БД остаётся только keyed hash. URL с capability не
должен попадать в access/application log, trace, analytics или referrer.

## Инварианты хранения

Все клубы живут в общей PostgreSQL schema; tenant database и tenant credential не создаются. `Club` не содержит
обязательного `venue_id`. Partial unique indexes разрешают не более одного активного membership пользователя и не
более одного active owner, а deferred constraint triggers требуют ровно одного owner на commit. Поэтому создание
клуба коммитит корень и owner вместе, а transfer может в одной транзакции повысить target и понизить прежнего
owner, не показывая промежуточные ноль или два владельца.

Заявка и приглашение имеют одно `PENDING` состояние и один неизменяемый terminal transition. Membership — interval:
повторное вступление создаёт новую строку, а прошлое не переоткрывается. Активный club block и архивный клуб
запрещают новые membership intents на уровне БД. Invitation token и зашифрованный 24-часовой idempotent response
не появляются в outbox/audit. Governance audit append-only и содержит лишь club/actor/target opaque ID, action,
outcome и закрытый reason code.

`ClubVenue` — составной ключ `(club_id, venue_id)` и только ссылка на опубликованную canonical venue. FK используют
`RESTRICT`; unlink не каскадирует площадку, клуб или матчи. Venue merge/retraction обрабатывается будущим backend
consumer: ссылка переводится на survivor или скрывается, зависимое правило приостанавливается, созданный матч не
переписывается.

## Повторение, UTC и DST

Стартовая политика — только `WEEKLY`, interval 1–12 недель, уникальные ISO weekdays и rolling generation horizon
ровно 42 суток. Правило хранит local date/time, IANA timezone, tzdata version, неизменяемую gap policy `SKIP` и
явную overlap policy `EARLIER_OFFSET` либо `LATER_OFFSET`. Изменение шаблона повышает template version и действует
лишь на ещё не записанные календарные позиции.

Ключ позиции — `rule_id + YYYY-MM-DDTHH:mm`. Unique constraint и immutable occurrence делают retry идемпотентным.
Для каждой позиции migration независимо перебирает допустимые UTC offsets: отсутствие кандидата фиксируется как
`SKIPPED_DST_GAP`, два кандидата выбираются строго по overlap policy. Occurrence сохраняет выбранный UTC instant,
offset, tzdata/template version и ровно один match ID; reciprocal deferred FK/trigger не допускает расхождения.
`SKIPPED_PAUSE` также занимает календарный ключ, поэтому resume/restore не создают backlog.

Сам `Match` остаётся агрегатом matches и получает неизменяемую после публикации ссылку `ClubMatchSource`.
`RECURRING_RULE` требует club, rule и occurrence IDs; обычная клубная встреча требует только club ID. Правило не
хранит roster, участников, очередь или общую вместимость: каждый матч полностью независим.

## События и минимизация

`club.events.v1` содержит `clubId` в каждом сообщении и только opaque aggregate IDs, версии и закрытые состояния.
Идентификатор пользователя/invitee/organizer, token, название/описание/locality клуба, member graph, координаты,
roster, reason и точное расписание запрещены. События transactional-outbox, at-least-once; consumer дедуплицирует
`messageId` и перечитывает минимальную projection через авторизованный port.

Retention и окончательные legal/residency решения остаются production gate из `security-privacy.md`; migration не
заявляет юридическое соответствие и не добавляет платежи, членские взносы, club XP или tournament storage.
