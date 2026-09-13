# Контракты и данные геймификации

## Поверхность API

TypeSpec [`gamification.tsp`](../../contracts/rest/gamification.tsp) добавляет только аутентифицированные private
reads и защищённые мутации. `/gamification/progress` возвращает собственный global progress,
`/clubs/{clubId}/gamification/progress` — независимый progress одного клуба, а `/gamification/achievements` —
собственные awards. Сезонная таблица доступна через `/gamification/seasons/{seasonId}/leaderboard`; строка возникает
только после отдельного consent данного пользователя, scope и сезона.

`PUT .../leaderboard-consent` принимает явное `optedIn`, policy version и expected revision. Consent выключен по
умолчанию, не выводится из Terms, analytics или membership и может быть отозван после закрытия сезона. Новый opt-in
закрытого сезона запрещён. Club owner/admin читает и версионирует allowlisted templates и уровни через
`/clubs/{clubId}/gamification/configuration`; platform definitions доступны только purpose-bound admin capability.
Все ответы имеют `private, no-store`; мутации требуют bearer, Origin, CSRF и UUIDv4 idempotency key.

## Версии, scope и реестр

`XpRuleDefinition` — immutable snapshot: scope, source, semantic version, enabled, base XP, coefficient in tenths,
daily/weekly caps, effective interval и hash. Global scope требует `club_id IS NULL`, club scope — непустой
`club_id`; partial unique indexes не позволяют nullable global key обойти уникальность. Версия применяется по
`source_occurred_at`, поэтому retry и поздняя проверка не меняют формулу или окно.

`XpLedgerEntry` append-only. Award имеет ключ `(scope, club, user, source event, rule version, kind)`; отдельный
`ProcessedGamificationEvent` дедуплицирует at-least-once message по `message_id` и по owning event/revision.
`PENDING` и `POSTED` содержат вычисленную сумму, а окончательный `CAPPED` — ноль. PostgreSQL advisory transaction
lock сериализует cap одного user/scope/source; сутки и неделя (с понедельника) считаются в UTC по исходному факту.
При поздней доставке consumer считает все уже принятые факты ровно в том же UTC-окне, что и SQL trigger: конкретный
`CAPPED` source может зависеть от порядка получения, но число `POSTED` событий, net XP и все публичные проекции
сходятся к одному результату. Global и каждый club имеют собственные lock/key/balance partitions.

История не обновляется: reversal ссылается только на posted award и сохраняет owner, scope, rule и сумму;
reinstatement ссылается только на reversal. Partial unique indexes допускают по одной записи каждого типа, поэтому
компенсация не превосходит исходный award. Ledger/definitions/award/consent защищены `UPDATE OR DELETE` triggers.
`XpBalance` и достижения — воспроизводимые projections, не источник истины и не связь со спортивной статистикой.

## Правила и уровни

Миграция публикует `GLOBAL_V1` (`1.0.0`): подтверждённая фактическая игра — 100 XP, организация подтверждённого
обычного матча — 40 XP, допустимый structured review — 15 XP. Для каждого источника максимум три события за UTC
сутки и десять за UTC неделю. Source enum закрыт: victory, score, payment, login, streak, advertising, complaint и
неподтверждённый факт не могут быть записаны как источник.

Club definition выбирает те же три source types, enabled/off и coefficient `5..20` десятых, то есть `0.5..2.0` с
шагом `0.1`; XP округляется вниз. Caps неизменны. Level set содержит 1–20 записей, имя 1–30 символов и строго
возрастающие ordinal/threshold. Backend пропускает имя через NFC/trim и запрещает имитацию staff capability,
денежные, призовые и азартные обещания; owner/admin проверяется внутри конкретного клуба. SQL не пытается заменить
moderation текста.

## Сезоны, consent и ранг

`LeaderboardSeason` хранит полуоткрытый UTC interval `[starts_at, ends_at)`, immutable rule snapshot/hash и scope.
Exclusion constraint с `btree_gist` запрещает пересечение сезонов одного global/club scope; длительность — 28–366
суток. `LeaderboardConsent` — append-only последовательность contiguous revisions. Каждая новая revision удаляет
старую projection row в той же транзакции; opt-in row затем строится заново только на current explicit consent.

`LeaderboardEntry` имеет composite FK на конкретную consent revision и trigger, отклоняющий stale/opt-out consent.
Deferred constraint проверяет competition ranking только по seasonal net XP: `1, 2, 2, 4`. Стабильный UUID нужен
только для порядка показа и не разрывает ничью. Viewer-aware read заменяет взаимно заблокированного пользователя на
`HIDDEN_BY_BLOCK` без user ID/avatar/profile link; restriction, club block, opt-out и deletion удаляют публичную
строку, но не ledger или rank остальных. Redis cache обязан включать season, viewer и consent/block/restriction
revisions; общий CDN snapshot запрещён.

## События и приватность

`gamification.events.v1` — внутренний transactional outbox, не WebSocket subscription. Четыре сообщения переносят
только opaque ledger/award/consent/season record IDs, projection revision и закрытый outcome. В payload запрещены
user/club/source IDs, матч или отзыв, score/winner, XP amount/rank, display identity, fraud reason/evidence и граф
совместной игры. Consumer дедуплицирует `messageId`, затем перечитывает разрешённую projection через owning port.

## Runtime backend

Worker получает `match.*`, `club.*` и минимальное `review.eligibility.changed.v1` через отдельную BullMQ queue.
Review-событие содержит только opaque review ID и revision; рейтинг, теги, текст, автор, адресат и match ID остаются
в owning storage. Consumer берёт advisory lock исходного aggregate, сравнивает message/source revision и каждый раз
перечитывает authoritative marker, review head и membership interval. Позднее старое событие становится `STALE`,
повтор той же revision — no-op, а отмена создаёт append-only reversal. Системная recurring-материализация не получает
награду организатора; archive клуба запрещает отложенный club award, а membership freeze и удаление строки текущего
leaderboard выполняются атомарно.

`GamificationProjectionService` пересобирает balance и achievements из упорядоченного ledger, а периодическая worker
задача переключает состояния сезонов и полностью перестраивает consent/restriction-aware leaderboard. Тот же путь
доступен оператору как `npm run gamification:rebuild --workspace @picklehub/backend`; rebuild не создаёт XP и не
читает behavioral analytics. Все изменения club definitions, season и consent имеют audit/outbox след.

Личный ledger/source explanation и holds доступны только владельцу и purpose-bound moderator. Рекомендуемые сроки,
псевдонимизация account/club deletion, appeal/legal hold и РФ-residency остаются gates из
[`security-privacy.md`](security-privacy.md); эта схема не заявляет юридическую готовность production.
