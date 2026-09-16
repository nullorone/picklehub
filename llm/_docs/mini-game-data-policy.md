# Контракты и данные мини-игры

Документ фиксирует решения этапа [`15-mini-game/02-contract-data.md`](../15-mini-game/02-contract-data.md). Он
описывает wire/storage boundary, а не заявляет готовый backend или клиент. Источник REST —
[`contracts/rest/mini-game.tsp`](../../contracts/rest/mini-game.tsp), внутренних событий —
[`asyncapi.yaml`](../../asyncapi.yaml), ограничений данных — migration
`20260916130000_mini_game_contract_data` и Prisma schema.

## REST-поверхность и независимость от платформы

Core flow одинаков для web/PWA, TMA и mobile WebView:

1. `POST /mini-game/sessions` получает `STANDARD`/`CALM` и опубликованную configuration version, затем возвращает
   `GameSession`, immutable `GameTask` и подписанный challenge. TTL challenge — ровно 15 минут, один terminal result,
   максимум 20 reward-eligible выдач на пользователя за UTC-сутки.
2. `POST /mini-game/sessions/{sessionId}/results` принимает challenge, случайный nonce минимум 128 bit,
   configuration/mode, monotonic active/pause duration и только bounded aggregate counters. `score`, input trace,
   pointer coordinates, per-key timing, frames и device signals в DTO отсутствуют. В сутки принимается максимум
   десять terminal eligible results; локальная offline practice этим лимитом не считается.
3. `GET /mini-game/progress` возвращает только собственные UTC goals, season counters и private cosmetics без score,
   leaderboard или другого пользователя.
4. `POST /mini-game/receipts/{receiptId}/reward-claim` в течение 24 часов получает независимые outcomes practice
   mark/cosmetic/global XP. Повтор с тем же idempotency key и fingerprint возвращает зашифрованный сохранённый
   ответ; повтор receipt/task/nonce не создаёт новый grant.

Все мутации требуют UUIDv4 `Idempotency-Key`. Обычный bearer обязателен, а browser `WEB`/`TMA` дополнительно
проходит Origin/context-cookie/CSRF boundary. Для server-known `MOBILE` и restricted game bearer эта пара
отсутствует; переданный только один browser header всегда invalid. Ответы содержат `private, no-store` и
`no-cache`. Core DTO не содержит platform enum и не меняет правила/награды по клиенту.

`STANDARD` принимается только с `activeDurationMilliseconds = 90000`; `CALM` — с ровно 20 attempts и без
reaction-time minimum, чтобы accessibility mode не штрафовался. В обоих режимах сервер проверяет
`success <= attempts`, `target <= success`, сумму трёх direction counters, верхнюю границу streak bonuses,
pause ≤ 600 секунд, version/mode/owner/task и expiry. Эти проверки отсекают невозможные claims, но не доказывают
честную локальную траекторию.

## Подпись и граница доверия

`mgc1_…` challenge — непрозрачный для клиента token над canonical payload version 1 и HMAC-SHA-256 backend key.
Внутренний payload связывает `sessionId`, `taskId`, actor, configuration ID/version, season, mode, UTC-window,
issued-at, expires-at и 256-bit server nonce, но эти claims не обязаны быть доступны или декодируемы клиентом.
После успешной проверки backend в одной транзакции поглощает challenge/task/client nonce, создаёт terminal
`GameResult`, меняет session state и пишет outbox. В базе остаются только keyed SHA-256 hashes challenge/result
proof/client nonce; raw values запрещены в БД, audit, log, trace, metric и analytics.

`mgr1_…` подписывается только сервером после commit и связывает receipt ID, actor, configuration/season, accepted-at
и claim expiry. Он подтверждает лишь bounded low-value reward eligibility. Клиент не подписывает свой score и не
получает HMAC key; signing/verification keys находятся только в backend secret manager, имеют version, rotation и
перекрытие не дольше максимального незавершённого TTL. TLS обязателен. Modified client всё ещё может автоматизировать
правдоподобные inputs — это признанный остаточный риск, ограниченный отсутствием leaderboard/спортивных прав и caps.

Различный payload при повторе `Idempotency-Key`, client nonce или task даёт conflict. Идентичный retry в retention
window получает прежний terminal receipt. Просроченный challenge/claim, чужой owner, mode/config mismatch,
невозможная арифметика либо rate отвергаются закрытым code без echo rejected value. Высокий score, `CALM`, слабое
устройство или WebView сами по себе не являются fraud signal и не меняют trust/account/Match MVP.

## Storage и транзакционные инварианты

- `GameConfiguration` immutable фиксирует mode shape, три направления, формулу `10/5/5→10` и pause TTL 600 s.
- `GameSeason` — непересекающийся полуоткрытый UTC interval ровно 84 суток с immutable snapshots трёх goals и
  четырёх fixed cosmetics.
- `GameSession` хранит только keyed challenge hash, actor/config/season/task binding, 15-minute expiry и один
  `ISSUED → COMPLETED|REJECTED|EXPIRED` transition.
- `GameResult`, `ProcessedGameTask` и `ProcessedGameNonce` связываются с terminal session deferred constraint:
  неполный bundle не может commit. Один session имеет один receipt, task и nonce глобально уникальны.
- `RewardGrant` и `CosmeticUnlock` append-only. `REVERSED` ссылается только на исходный `GRANTED`, а единственный
  `REINSTATED` — на reversal; owner/season/kind/semantic key/item/amount неизменны. Projection не переписывает
  историю.
- PostgreSQL advisory transaction locks сериализуют daily issuance/result и XP caps. Redis разрешён только как
  rate-limit/cache optimization; miss/outage не разрешает claim и не является источником replay truth.

Semantic keys не дают двум receipt создать одну и ту же daily goal, fixed cosmetic или daily XP. `PENDING`,
`CAPPED` и `REJECTED` имеют amount 0. Cosmetic item заранее фиксирован season snapshot, не продаётся, не
передаётся и не влияет на gameplay/профиль. Reversal не освобождает старое UTC-window для переноса награды в новый
день; reinstatement проходит исходные caps.

## XP-порт

Закрытый `XpSourceKind` аддитивно получает `MINI_GAME_DAILY_COMPLETION`; исторические `GLOBAL_V1` rows не
переписываются. Новая immutable global rule `2.0.0` задаёт 10 XP, один event/UTC day и пять/UTC week. Club rule,
club template и achievement для этого source отсутствуют. Mini-game создаёт global-XP `RewardGrant` и через
авторизованный gamification port/outbox передаёт opaque grant reference; она не пишет `xp_ledger_entries` или
`xp_balances`.

Owning transaction дополнительно ограничивает 30 grants на 84-day season, то есть 300 XP. Gamification повторно
защищает source-event uniqueness, daily/weekly cap и append-only compensation. XP consumer использует receipt
accepted-at, а не retry time, поэтому повтор после UTC boundary не переносит событие. `CAPPED/ALREADY_GRANTED`
остаётся terminal объяснимым outcome и не мешает остальным goals.

## Mobile WebView capability и browser policy

`POST /mini-game/webview-launches` доступен только server-known active `MOBILE` session и выдаёт `mgl1_…` на 60
секунд для одного exact configured HTTPS game origin. Capability передаётся только в POST body, никогда в URL,
query, referrer, native log или общий bridge. `/webview-launches/exchange` связывает exact `Origin`, атомарно
поглощает capability и возвращает non-refreshable `mga1_…` на 15 минут с audience/prefix только
`/v1/mini-game`. Он не принимается identity, match, chat, profile, advertising или другим API. Revoke/logout
native session инвалидирует ещё не истёкший game access. Browser cookie, native refresh и Telegram init data в
game origin не передаются.

Production origin — конфигурационный allowlist из одного origin на environment; wildcard, HTTP, IP literal,
redirect и runtime-provided host запрещены. Ответ game document обязан иметь минимум:

```text
Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src <exact-api-origin>; media-src 'self'; worker-src 'none'; child-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Permissions-Policy: camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=(), payment=(), usb=(), serial=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=()
Referrer-Policy: no-referrer
X-Content-Type-Options: nosniff
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

Нет third-party script/frame/storage, popup, download/upload, external navigation или service-worker scope вне
versioned game assets. `OPEN_SAFE_ROUTE` закрывает WebView до native authorization/refetch и принимает только
`MATCH_LIST`, `MATCH_CREATE`, `PROFILE_SELF`, без URL/ID/query. Bridge envelope version 1 — JSON максимум 2048 bytes
с UUIDv4 message ID и только `READY_V1`, `CLOSE_V1`, `OPEN_SAFE_ROUTE_V1`, `HEALTH_V1`; unknown version/type/field,
oversize, wrong origin или duplicate ID закрываются без native action. `HEALTH_V1` содержит только closed
load/crash/performance buckets, без session/user/reward/score/timing trace.

Точный механизм initial POST navigation и headers проверяется client/backend этапами на WKWebView и Android
WebView; contract не разрешает fallback через query, cookie или arbitrary JavaScript injection.

## События, данные и retention

`mini-game.events.v1` публикует только `receiptId + outcome`, `grantId + kind + state` или `unlockId + state`.
User/session/task, challenge/nonce, mode, score/counters/duration, cosmetic code/inventory, amount и reason/evidence
запрещены. Consumer deduplicates by message ID and reloads минимальную authorized projection. Event commit находится
в той же транзакции, что owning record; at-least-once delivery не создаёт новый grant/XP.

Raw proof существует только в памяти запроса/ответа. Idempotency response, processed task и keyed nonce живут 24
часа. Launch capability — 60 секунд, game bearer — 15 минут, challenge — 15 минут, claim proof — 24 часа.
Session/result/grant/compensation и season progress живут до конца season integrity/appeal window, но не более 114
дней от создания; затем cleanup удаляет либо необратимо обезличивает их. Fixed cosmetic ownership сохраняется,
пока существует аккаунт или предмет не отозван; source chain после окна сворачивается в проверяемую минимальную
проекцию без session/counters. Account deletion cryptoshreds response/proof keys, удаляет game access/local sync и
анонимизирует обязательный financial-free integrity record. Адресный legal hold следует общей safety policy и не
создаёт бессрочное хранение всех игроков.

Production rewards включаются только при подтверждённом размещении этих данных в России. Logs/traces/analytics не
содержат actor/session/receipt/grant/unlock IDs, proof/nonce, score/counters, exact time, device/network/navigation
или inventory. Operational metrics имеют только mode-independent outcome/reason class, TTL/rate bucket, latency
bucket и counts. Behavioral analytics consent не влияет на ledger correctness и пропущенные events не replay.

## Явные границы этапа

Migration и static policy tests проверяют декларативные инварианты, но не доказывают применение SQL, PostgreSQL
races, secret rotation, HMAC implementation, cleanup, outbox consumer, CSP/WebView runtime или реальные device
настройки. Backend, game engine и UI создаются следующими промптами. При недоступности reward storage/port игра
остаётся practice без persistent reward и никогда не блокирует Match MVP.
