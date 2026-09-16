# Backend-поддержка mobile parity

Документ фиксирует реализацию этапа `14-mobile-parity/03-backend.md` поверх утверждённого
[mobile contract/data policy](mobile-parity-contract-data.md). Он не подтверждает готовность Expo-клиента,
universal/app-link ownership, push-провайдера, store review или production-размещение данных.

## Native identity и browser compatibility

- `/auth/mobile/magic-links/request` сохраняет только S256 challenge, `MOBILE` и закрытый structured destination;
  ответ остаётся нейтральным и использует те же address/IP limits, что browser magic link.
- Consume сравнивает вычисленный S256 challenge constant-time, атомарно потребляет link и выдаёт access/rotating
  refresh только в no-store JSON. Refresh принимает credential только из body, проверяет `MOBILE`, а replay
  отзывает всю session family. Native logout нейтрален для неизвестного credential.
- Browser login/refresh/logout по-прежнему требуют allowlisted Origin, context cookie и CSRF. Browser endpoints не
  принимают mobile refresh family; native endpoints отвергают Origin, CSRF и browser auth cookies.
- Для bearer mutation platform берётся только из проверенной access session. `WEB`/`TMA` проходят прежнюю
  Origin/CSRF проверку, `MOBILE` обязан не присылать эти browser headers. Это применено к identity, площадкам,
  матчам, чату/уведомлениям, профилям и trust/safety.
- Native Telegram proof остаётся fail-closed unavailable: mobile session не может начать Telegram LINK или
  передать TMA `initData`. Email proof, unlink и deletion используют общие domain rules.

Logout mobile отзывает все активные mobile installation bindings пользователя; logout-all и deletion отзывают все
его bindings. Database trigger этапа 02 очищает token key/ciphertext у связанных push registrations. Это
privacy-консервативно: повторное включение push требует нового случайного installation ID и явной регистрации.

## Realtime ticket

`POST /realtime/tickets` создаёт `ws1_…` secret на 60 секунд, сохраняет в Redis только HMAC-keyed lookup и binding
`user/session/authEpoch`, а idempotent response хранится существующим зашифрованным receipt. Gateway принимает
ticket первой командой, атомарно выполняет Redis `GETDEL` и заново проверяет session revoke, expiry, status и auth
epoch в PostgreSQL. Browser Origin остаётся allowlisted; отсутствие Origin допустимо для native WebSocket, но не
даёт доступа без одноразового ticket. Cursor gap по-прежнему ведёт к REST snapshot/resync.

## Installation и push

- Self-list не возвращает token/provider identity. Bind принимает случайный UUIDv4; отозванный installation ID не
  реактивируется и не может перейти другому account.
- Register требует активный `MOBILE` binding. Token получает environment-separated HMAC subkey и randomized
  authenticated ciphertext. В одной транзакции прежний active token данного installation/environment отзывается и
  стирается, новый создаётся с 90-дневным expiry. Idempotency receipt делает retry стабильным.
- User revoke, installation revoke, logout, logout-all, deletion, inactivity expiry и provider invalid-token
  feedback сходятся к одному состоянию: `revokedAt/reason` и `NULL` для token key/ciphertext.
- Push payload содержит только `{schemaVersion: 1, notificationId, action: OPEN_NOTIFICATION}`. Notification API
  строит закрытый `MATCH`/`MATCH_CHAT` target из server-owned route; произвольный URL или mutation отсутствуют.
- Provider port создан, но production adapter намеренно `enabled = false`. Поэтому provider outage/отсутствие
  подавляет только асинхронную delivery, никогда не откатывает доменную операцию или persistent in-app inbox.

## Метрики и эксплуатационные границы

Счётчики mobile auth frequency, rate-limit bucket family, push outcome/invalid-token и realtime protocol errors
используют только фиксированные low-cardinality labels. Installation ID, token/key, IP/address hash, route, location
и device attributes в labels/logs не попадают.

Остаются незакрытыми: реальный PostgreSQL/Redis integration и race evidence в текущей среде, выбор и legal/privacy/
residency review push provider, реальные invalid-token callbacks, AASA/assetlinks, Expo secure storage/backup,
physical-device lifecycle/reconnect и store disclosures. До закрытия provider gate push остаётся fail-closed.
