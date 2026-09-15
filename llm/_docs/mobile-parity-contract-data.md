# Контракты и данные функционального паритета mobile

Документ фиксирует wire/data boundary этапа `14-mobile-parity/02-contract-data.md`. Он не создаёт Expo-клиент и
не заявляет реализованными backend handlers, push provider, universal links или безопасное хранилище устройства.
Редактируемые источники истины — TypeSpec, корневой AsyncAPI и Prisma/SQL migration; generated TypeScript вручную
не меняется.

## Результат аудита React Native

`contracts/generated/openapi.ts` и `contracts/generated/asyncapi.ts` являются type-only ES2022 modules: они не
обращаются к DOM, `window`, cookie, `localStorage`, `RequestCache`, `WebSocket` или Node API. Отдельный
`contracts:mobile:check` компилирует оба generated artifacts и выбранную native surface с `lib: ["ES2022"]` и
`types: []`. Это доказывает runtime-neutral type compatibility, но не является сборкой Expo приложения.

`@picklehub/api-client` пока остаётся browser adapter: он использует cookie credentials, CSRF bootstrap,
`globalThis.location` и browser refresh. Mobile не должен импортировать `createIdentityClient`; на клиентском этапе
он реализует нативный transport поверх тех же generated DTO. Fetch/WebSocket/crypto/secure-store реализации и
поддерживаемая Expo SDK проверяются в этапах 04–05, без ручной правки generated типов.

Прямой avatar upload уже пригоден для native: API выдаёт короткую five-minute single-object HTTPS `PUT` policy,
после чего client передаёт binary непосредственно в object storage. API cookie и multipart DTO не нужны; client
обязан соблюдать exact headers, размер/content type и не сохранять signed URL. Chat/safety file upload отсутствует.

## Native identity и session

Browser contract не заменён. `/auth/context`, browser magic/Telegram exchange, refresh и logout сохраняют
обязательные allowlisted Origin, context cookie, CSRF и `HttpOnly` refresh cookie. Новые endpoints отделены:

- `POST /auth/mobile/magic-links/request` принимает literal `MOBILE`, email, S256 challenge и необязательный
  закрытый destination;
- `POST /auth/mobile/magic-links/consume` принимает одноразовый link secret и verifier, сверяет S256 constant-time
  и выдаёт access плюс rotating refresh в JSON body;
- `POST /auth/mobile/refresh` принимает refresh только в TLS JSON body, никогда из cookie/URL/query;
- `POST /auth/mobile/logout` отзывает одну family нейтрально и идемпотентно.

Verifier имеет достаточную энтропию и создаётся до request. Сервер связывает challenge с link purpose/platform/
destination; wrong verifier/platform, expired, used и revoked дают одинаковый `MAGIC_LINK_INVALID`. Consume
происходит один раз в foreground. Access token живёт только в памяти; refresh и verifier — только в Keychain/
Keystore-backed storage, без AsyncStorage/SQLite/backup/log/crash/analytics/clipboard. Rotation сохраняется
атомарно и сериализуется одним in-flight refresh. Reuse или потерянный refresh response отзывает всю family без
grace/replay и требует новый login.

`ClientPlatform` и consent platform расширены значением `MOBILE`. У authenticated bearer mutations Match MVP
Origin/CSRF стали условными: сервер определяет platform по access credential; для `WEB`/`TMA` оба browser headers
по-прежнему обязательны и валидируются с cookie, для `MOBILE` оба отсутствуют, один без другого запрещён. Caller
не передаёт доверенный platform header. UUIDv4 idempotency, version checks и retry windows не изменены.

Identity link/unlink остаются общими DTO, но native Telegram proof не включён: кнопка остаётся unavailable до
официального server-bound return/provider review. Нельзя передавать TMA `initData`, clipboard proof или связывать
по совпадающим данным. Backend этап обязан либо определить отдельную native replacement-session выдачу для
одобренного Telegram flow, либо сохранять недоступность. Account delete/logout-all принимают mobile bearer;
response `Set-Cookie` только очищает возможный browser credential и не является native session transport.

## Deep link state

`MobileDeepLinkTarget` — закрытый tagged union из Match MVP destinations с opaque UUID. URL, host, query, fragment,
произвольный route и mutation command в DTO отсутствуют. Magic request может привязать только этот target; consume
возвращает его после session issuance. Resolver всё равно выполняет onboarding и resource authorization/refetch.

Production links используют только HTTPS canonical host. До mobile release инфраструктура должна опубликовать и
проверить без redirect/auth/content negotiation:

- `/.well-known/apple-app-site-association` с exact app/team ID и allowlisted paths;
- `/.well-known/assetlinks.json` с exact Android package и production signing certificate digest.

Ownership files не входят в `/v1` OpenAPI и не создаются как фиктивные API endpoints. Custom scheme остаётся
development-only. Magic/invite secrets не являются destination state и не попадают в navigation history, cache,
logs, analytics или push. Unknown/out-of-scope link открывает безопасный not-supported screen без сохранённой
мутации.

## Realtime и reconnect

Добавлен `POST /realtime/tickets`: bearer session выдаёт no-store single-use `ws1_…` ticket не дольше 60 секунд.
Ticket передаётся первой AsyncAPI-командой `session.authenticate.v1`, не URL/query/subprotocol, и потребляется
атомарно с привязкой к user/session/auth epoch. Каждый reconnect получает новый ticket.

Chat subscribe использует opaque REST-issued cursor. Последовательности authoritative в PostgreSQL; cursor expiry,
retention gap или sequence gap ведут к canonical REST snapshot/catch-up, а не к слиянию локальных сообщений.
Background закрывает socket. Access refresh, active resource/unread refetch и новый ticket предшествуют foreground
reconnect. REST/WebSocket command idempotency остаётся UUIDv4 в заданном 24-hour окне и не становится общей
offline mutation queue.

## Installation и push

Существующий `notification-devices` расширен `MOBILE`; installation ID — случайный UUIDv4 purpose-bound к inbox/
push, не hardware/device/ad identifier. `GET /notification-devices` позволяет увидеть собственные bindings без
token и отозвать потерянное устройство. `DELETE /notification-devices/{installationId}` отзывает binding и все
его token registrations. Account switch сначала удаляет старую binding/cache partition.

Token регистрируется отдельно через versioned
`POST /notification-devices/{installationId}/push-registrations`. Request содержит OS, sandbox/production,
app version и opaque token; response возвращает metadata без token/provider identity. Rotation в транзакции
HMAC-deduplicates новый token, шифрует ciphertext и отзывает предыдущий active token того же installation/
environment. UUIDv4 idempotency делает retry стабильным. Provider invalid-token feedback и адресный DELETE
используют ту же идемпотентную revoke transition. Active registration истекает через 90 дней без authenticated
activity; срок должен быть подтверждён privacy/legal review до production.

SQL обеспечивает единственный active token на installation/environment, раздельные sandbox/production keys,
уникальный keyed token, очистку ciphertext при revoke и каскадный revoke при потере device binding. Отдельный
`push_delivery_attempts` даёт один idempotent attempt на logical delivery/registration; provider message key
хранится только keyed/minimized. Provider credentials и adapter payload никогда не выдаются client. Provider не
выбран и adapter остаётся fail-closed до terms/privacy/security/legal/residency review.

`PUSH` добавлен как внешний notification channel, но provider delivery не означает human read. Lock-screen payload
имеет ровно `schemaVersion`, `notificationId`, `OPEN_NOTIFICATION`; display text нейтрален. Chat text, игрок,
площадка/адрес, safety данные, route, URL, secret и mutation запрещены. Tap восстанавливает session, загружает
notification по opaque ID, разрешает closed target и refetches resource. Badge берётся из server unread projection.

## Cache manifest и очистка

Wire DTO не дублируются для mobile. Client cache на следующем этапе обязан иметь envelope
`{schemaVersion, userPartition, resourceKind, resourceVersion, fetchedAt, expiresAt, sensitivity}`. Partition key —
внутренний user ID после подтверждённой session; до этого protected cache не открывается. Encryption key хранится
платформенно и исключён из cloud backup.

| Класс                 | Примеры                                                        | Максимальный TTL | Offline                        |
| --------------------- | -------------------------------------------------------------- | ---------------: | ------------------------------ |
| `PUBLIC_READ`         | venue/public profile cards                                     |          24 часа | stale с временем               |
| `USER_READ`           | match detail, inbox summary, own profile/history/statistics    |            1 час | stale после session restore    |
| `CHAT_READ`           | authorized pages без report evidence                           |         30 минут | stale, затем REST resync       |
| `EPHEMERAL_SECRET`    | access/refresh/verifier, magic/invite/ticket/signed upload URL |                0 | никогда не cache               |
| `RESTRICTED_NO_CACHE` | safety text/evidence, email, provider payload/token            |                0 | никогда не cache               |
| `EPHEMERAL_LOCATION`  | координата одного location-assisted запроса                    |                0 | только память текущего запроса |

Server `Cache-Control: no-store` запрещает shared/browser cache, но не является разрешением native persist:
allowlist выше уже. Unlisted invite secret не сохраняется вместе с match projection. Logout, deletion, account
switch, invalid/reused session и device lost response синхронно очищают access/refresh/verifier, active user
partition, media и local push state. Offline logout локален немедленно и после стирания credential не ставит revoke
в очередь; server family завершается expiry либо `logout-all` из другой session. Общей очереди мутаций нет.

## Lost/stolen device threat model

- При краже разблокированного устройства attacker может читать текущий экран; app background/lock обязан закрыть
  socket и защищённые actions требуют восстановленной session, а OS screen capture/crash attachment не содержит
  secret/restricted text.
- Извлечение app sandbox не даёт refresh/verifier/cache key: secure storage hardware-backed где доступно, backup
  отключён. Root/jailbreak не объявляется полностью нейтрализованным; server revoke и короткий access TTL уменьшают
  окно.
- Владелец с другого устройства видит bindings и отзывает installation либо все sessions. Revoke закрывает refresh
  family и push token; уже выданный access действует максимум 300 секунд при обязательной server revocation check.
- Push token сам по себе не authenticates API и payload ничего не доказывает. Installation ID не является auth,
  tracking или account recovery credential.
- Logout/delete очищают local state даже при недоступном API; provider delivery после revoke считается incident и
  требует kill switch/rotation review.

## Совместимость и незакрытые gates

Web/TMA wire behavior сохраняется: browser cookie/CSRF endpoints и DTO остаются, additive enums/paths не требуют
перевода существующих clients, а условные headers backend обязан продолжать строго требовать по session platform.
Backend реализации новых endpoints и SQL migration принадлежат этапу 03; до него native auth/push нельзя считать
работающими. Expo package/app, secure storage, cache, link resolver и platform UI принадлежат этапу 04.

До production остаются gates: clean/upgrade PostgreSQL migration и race tests; refresh loss/reuse/session revoke;
real iOS/Android Keychain/Keystore/backup checks; provider/legal/residency/retention review и invalid-token feedback;
real AASA/assetlinks ownership; Expo/fetch/WebSocket/object upload build; cold/warm link, cursor gap/background,
lost-device/account-switch cache purge; privacy manifests/store disclosures и physical accessibility/device matrix.
