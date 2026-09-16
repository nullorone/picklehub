# Backend мини-игры

Документ фиксирует реализацию этапа [`15-mini-game/03-backend.md`](../15-mini-game/03-backend.md) поверх
[контрактов и политики данных](mini-game-data-policy.md). Клиентский runtime и WebView-оболочка описаны отдельно в
[client-документе](mini-game-frontend.md). Документ не заявляет production-размещение данных или реальную проверку
гонок PostgreSQL/Redis в текущей среде.

## Сессия, challenge и result

`MiniGameModule` реализует опубликованные маршруты `/mini-game`. Reward-eligible session выдаётся только активному
пользователю с завершённым onboarding, опубликованной immutable configuration и активным 84-дневным сезоном.
Challenge подписан HMAC-SHA-256 отдельным backend key, связан с actor/session/task/configuration/season/mode/TTL и
хранится только как purpose-separated keyed hash. Raw challenge, result proof, client nonce и WebView capability
добавлены в обязательную redaction policy.

Result transaction проверяет owner, подпись, hash binding, 15-минутный TTL, terminal state, configuration/mode,
ровно 90 секунд `STANDARD` либо 20 ходов `CALM`, арифметику агрегированных counters и coarse rate bound. Она
атомарно создаёт terminal `GameResult`, поглощает task и keyed nonce, переводит session и пишет минимальный outbox.
Невозможный bounded input получает terminal `REJECTED`; сервер сохраняет безопасную нормализованную форму и hash
request, а не непроверенный score/trace. Все мутации имеют UUIDv4 idempotency key; replay response зашифрован
AES-256-GCM и живёт 24 часа.

Дневная выдача и приём сериализуются PostgreSQL advisory transaction locks. Настраиваемые пределы не могут быть
выше database hard caps: 20 session и 10 accepted result на пользователя за UTC-сутки. Redis ограничивает только
нагрузку на отдельном `mini-game` namespace; его отказ закрывает reward API с `GAME_REWARDS_UNAVAILABLE` и не
затрагивает match endpoints.

## Награды, XP и компенсации

Claim повторно проверяет signed result proof, owner и 24-часовой TTL, затем под actor/day lock независимо создаёт
practice-mark, fixed cosmetic и global-XP outcomes. Semantic keys не позволяют двум receipt выдать одну дневную
цель, один предмет или дневной XP. XP равен 10, ограничен 1/UTC-day, 5/UTC-week и 30/84-day season; `CALM`, score,
реклама и устройство не меняют eligibility.

Mini-game не пишет `xp_ledger_entries` или balance. Она публикует opaque `grantId`; gamification worker перечитывает
authorized `GLOBAL_XP` grant и применяет `MINI_GAME_DAILY_COMPLETION` через существующий append-only ledger.
Повтор события дедуплицируется общим processed-event registry. `REVERSED` и единственный `REINSTATED` создаются как
append-only compensation, публикуют новый grant event и приводят gamification ledger к тому же состоянию.

## WebView, выключатель и эксплуатация

Только server-known `MOBILE` identity session может получить 60-секундную capability для одного exact
`MINI_GAME_ORIGIN`. Exchange требует этот Origin, атомарно поглощает capability и возвращает 15-минутный
non-refreshable bearer, который lookup-ом связан с native session и принимается только controller мини-игры.
Logout/revoke/auth-epoch проверяются заново через исходную session; cookie, native refresh и Telegram init data в
game credential не входят.

`MINI_GAME_REWARDS_ENABLED` выключает только online reward boundary. Runtime change проходит через
`setRewardsEnabled` и минимальный audit с reason code. В production включение дополнительно запрещено без
`MINI_GAME_RU_RESIDENCY_CONFIRMED=true`; signing/encryption keys и exact HTTPS origin обязаны быть заданы явно.
Метрики имеют только закрытые outcome classes без actor/session/receipt, mode, score, counters, device или exact
time. Worker помечает истёкшие sessions и очищает 24-часовые nonce/task/idempotency records и истёкшие capabilities.

Migration публикует configuration `1.0.0` для `STANDARD`/`CALM`, текущий сезон 2026-09-16—2026-12-09 и следующий
сезон до 2027-03-03. Следующий season обязан быть опубликован отдельной reviewed migration до этой границы; backend
не создаёт или не продлевает сезон из пользовательского запроса.

## Оставшиеся runtime gates

- применить contract/data и backend migrations к чистому и обновляемому PostgreSQL 16/PostGIS;
- выполнить реальные concurrent tests: два result submit, reused nonce/task, параллельные claims и XP cap;
- проверить Redis outage, outbox at-least-once delivery, compensation и maintenance после restart;
- проверить secret rotation с перекрытием незавершённого TTL и production secret manager;
- подтвердить РФ-размещение, deletion/backup cycle и только затем включить production rewards;
- проверить initial POST, exact Origin, CSP, navigation и revoke/logout на WKWebView и Android WebView на клиентском
  этапе.
