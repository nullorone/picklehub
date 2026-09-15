# Требования к функциональному паритету мобильного приложения

Документ фиксирует продуктовую границу первого React Native/Expo-клиента. Источник поведения — уже реализованные
контракты и интерфейсы Match MVP для web/PWA и TMA; мобильный клиент не создаёт отдельную предметную семантику.
Точные wire-модели, новая mobile-сессия, push-регистрация и universal/app links принадлежат следующему этапу
`14-mobile-parity/02-contract-data.md`.

## Граница релиза и определение паритета

Первый релиз включает identity, onboarding, каталог площадок, матчи, чат, in-app/push-уведомления, профиль,
статистику, отзывы, жалобы и пользовательские блокировки. Паритет означает одинаковые права, серверные состояния,
валидацию, ошибки, временные правила, подтверждения и safety-гарантии, но не одинаковую компоновку интерфейса.

В релиз не входят административная панель, moderation/CMS/ads-manager, клубы, турниры, геймификация, новости,
закладки, рекламные placements и мини-игра. Это явные пробелы относительно текущих web/TMA, но не пробелы
заявленного Match MVP. Не добавляются платежи, бронирование, проверка возраста, загрузка файлов/голоса в чат,
background location, рекламный ID, внешний DUPR API или неподтверждённые map/push/analytics SDK.

## Информационная архитектура и навигация

После завершения onboarding корневая tab-навигация содержит `Матчи`, `Площадки`, `Уведомления`, `Профиль`;
`Безопасность` и `Аккаунт` открываются из профиля. Каждый tab имеет собственный stack и сохраняет позицию при
переключении. Формы создания, результата, жалобы и подтверждения открываются как full-screen stack, а не как
неустойчивый modal. Back закрывает клавиатуру/вложенный экран, затем возвращает в исходный stack; Android system
Back и iOS gesture дают одинаковый доменный результат. Незавершённую мутацию нельзя потерять без подтверждения.

Deep link использует проверенный HTTPS universal/app link канонического домена. Custom scheme допустим только для
внутреннего development и никогда не приходит из email или push production. Любой link проходит один resolver:
нормализация allowlisted host/path, восстановление сессии, обязательный onboarding, авторизация ресурса, затем
навигация. Query/fragment не передаются в логи или аналитику. Секретные token links одноразовы, не сохраняются в
истории навигации, clipboard, notifications или crash report. После входа возвращается только заранее проверенный
внутренний destination; произвольный `next` и внешний redirect запрещены.

## Матрица пользовательских сценариев

| Возможность и состояния web/TMA                                                                | Нативный экран и навигация                                             | HTTPS deep link                                                                | Паритет и offline                                                                                                             |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Email login: neutral request, sent, invalid/expired/used, rate limit, retry                    | `Auth/Email`, затем `Auth/CheckEmail`; link открывает `Auth/Consume`   | `/auth/email` с одноразовым секретом                                           | Magic link — основной native-вход. Request/consume только online; ошибки не раскрывают наличие email.                         |
| Onboarding: profile, preferences, required/optional consents, conflict/resume/completed        | `Onboarding/Profile` → `Preferences` → `Consents`; stack нельзя обойти | Link после auth продолжает сохранённый destination только после completion     | Черновик читается из server/cache, каждый save и completion только online; конфликт требует reload/merge вручную.             |
| Account: identities, link/unlink, logout current/all, consent history/change, deletion         | `Profile/Account` и вложенные экраны с повторным proof                 | Только безопасный `/account`, без proof/token                                  | Мутации online и с явным подтверждением; deletion остаётся необратимым accepted workflow. Telegram link — gated gap ниже.     |
| Venue catalog: map/list/text, filters, loading/empty/stale/error, select                       | `Venues` с Map/List segmented control; detail как stack card           | `/venues` и `/venues/{venueId}` после появления контрактного route             | Последний успешный read-cache доступен offline с временем обновления; provider attribution всегда видима.                     |
| Location-assisted venue search                                                                 | На `Venues` кнопка «Рядом со мной» запускает just-in-time permission   | Deep link никогда не запрашивает location автоматически                        | Отказ/approximate/disabled ведёт к locality/manual map, без блокировки каталога; координата не пишется в analytics/log/cache. |
| Venue candidate, revision, structured report                                                   | Full-screen `VenueCandidate`, `VenueRevision`, `VenueReport`           | Только публичная карточка; формы не открываются из непроверенных params        | Draft формы может жить локально без чувствительных координат дольше session; submit online, без ложного success/queue.        |
| Match search/recommendations: filters, empty/error, public/unlisted                            | `Matches/Search`; detail в stack                                       | `/matches/{matchId}`; invite `/match-invites/{inviteToken}`                    | Последние карточки могут читаться offline как stale; unlisted не попадает в local search/index.                               |
| Create/edit/publish/cancel match, guest places                                                 | `Matches/Create` и organizer actions на detail                         | Формы не deep-link targets                                                     | Все мутации online, идемпотентность сохраняется; локальный draft не считается серверным `DRAFT`.                              |
| Join: auto, approval, team choice, full, FIFO waitlist, withdraw, organizer decision/promotion | Actions и status panel на `MatchDetail`                                | Тот же match link                                                              | Server authoritative; offline action disabled with explanation, no optimistic roster/waitlist success.                        |
| Lifecycle: published, full, in progress, cancelled, completed                                  | `MatchDetail` refetches on focus/reconnect/push                        | `/matches/{matchId}`                                                           | Cached state помечен временем; foreground всегда reconciles version before allowing mutation.                                 |
| Result: scored/no-score, opponent confirm/dispute, moderator outcome                           | `MatchResult/Edit` and `MatchResult/Confirm` full-screen               | Push routes to match result section, not a mutation                            | Submit/confirm/dispute online; biometric/device notification action cannot confirm result.                                    |
| Match chat: snapshot, pagination, ordered realtime, edit/delete window, system events, report  | `MatchDetail/Chat`; composer respects keyboard/safe area               | `/matches/{matchId}/chat`                                                      | Cached read-only pages allowed; send/edit/delete/report online. Reconnect uses cursor, gap triggers REST resync.              |
| Notifications: unread badge/list, preference and quiet hours, open destination                 | `Notifications` and `Profile/NotificationSettings`                     | Allowlisted target derived from server category, never raw provider URL        | In-app list may be cached; read/preferences online. Push delivery/open is not proof of human read.                            |
| Own/public profile, private/not-found/blocked-safe response, edit/avatar, DUPR outbound        | `Profile`, `PlayerProfile`, `Profile/Edit`                             | `/players/{playerId}`; own `/profile`                                          | Cached public/self projection is read-only; edits/avatar online. DUPR only explicit HTTPS handoff, no scraping.               |
| History/statistics: empty/available/updating, all/singles/doubles                              | Sections/screens below profile                                         | Same profile link with local destination hint only                             | Cached generation displays age/state; client never recalculates authoritative statistics.                                     |
| Eligible feedback and no-show report                                                           | `MatchDetail/Feedback/{subject}`                                       | `/matches/{matchId}/feedback/{subjectPlayerId}` after auth                     | Online only; final status comes from server, no local reputation effect.                                                      |
| Safety center: receipts, empty/open/resolved, report, response, appeal                         | `Profile/Safety`, `Safety/Report`, `Safety/Receipt`                    | `/safety/reports/{receiptId}`; generic report only from trusted in-app context | Restricted text is never cached in general read cache; submit/response/appeal online and no background retry.                 |
| Block/unblock and safe inaccessible state                                                      | Player profile action with destructive confirmation                    | Public profile link must not reveal block side                                 | Online, immediately reconciled across search/direct actions; cached cards cannot bypass server authorization.                 |

На каждом read-экране обязательны loading, content, empty, stale-offline и recoverable error. На каждой форме —
validation, submitting, success, conflict, authorization/session expiry и network failure. Server error code определяет
семантику; мобильный текст локализуется, но не превращает `accepted` в `completed` и не раскрывает скрытый объект.

## Аутентификация, Telegram и хранение секретов

Magic link по email — обязательный путь входа. Email открывает universal/app link; если приложение отсутствует,
HTTPS fallback завершает web-сценарий, но не передаёт session приложению. Приложение выполняет явный POST consume,
один раз, в foreground. Повторный tap получает нейтральную invalid-семантику. Link не должен зависеть от того,
запущен ли процесс; cold/warm start проходят один resolver.

Telegram — необязательная identity после email-входа, а не обязательный SDK. Пользователь начинает LINK attempt,
доказывает текущую email identity и явно переходит в официальный Telegram flow. Возврат принимается лишь через
server-bound одноразовый proof, связанный с attempt, session, purpose и сроком. До проверки условий Telegram и
контракта такого возврата кнопка скрыта с объяснимым состоянием unavailable. Нельзя принимать произвольный
`initData`, переданный другим приложением/clipboard, встраивать TMA WebView ради proof или автоматически связывать
аккаунты по совпадающим данным. Unlink оставляет минимум одну identity и отзывает старые сессии.

Текущий контракт непригоден для безопасной native-сессии: `ClientPlatform` содержит только `WEB`/`TMA`, мутации
требуют browser Origin/CSRF context cookie, а rotating refresh credential выдаётся лишь в `HttpOnly` cookie.
Следующий контрактный этап обязан отдельно проверить и описать `MOBILE`, proof-key/PKCE-подобную привязку клиента,
выдачу/rotation/reuse detection/revocation native refresh credential и CSRF boundary. До этого Expo-код входа и
хранения сессии не создаётся; WebView cookie bridge, AsyncStorage и копирование browser cookie запрещены.

После утверждения контракта refresh credential хранится только в iOS Keychain/Android Keystore-backed secure
storage с accessibility «после первого разблокирования» лишь если это нужно background refresh; access token —
только в памяти. Секреты не попадают в AsyncStorage, SQLite, backups, logs, crash/analytics, clipboard или URL.
Одновременно выполняется один refresh; rotation сохраняется атомарно, потерянный ответ или reuse завершает сессию
и требует login. Logout/delete очищают secure storage, push registration и пользовательский cache; server revoke
выполняется online, а при offline локальный logout немедленен и revoke безопасно завершается только по специально
утверждённому credential-free механизму, не общей очередью мутаций.

## Жизненный цикл, realtime и фоновая работа

- Cold start показывает splash только до чтения конфигурации и secure credential, затем восстанавливает session и
  destination. Неизвестная session не открывает защищённый cached экран как авторизованный.
- В foreground приложение проверяет connectivity как подсказку, восстанавливает session, refetches активный
  resource и unread projection, затем подключает WebSocket с новым realtime ticket.
- В background WebSocket закрывается; бесконечные timers, polling, location и keep-alive запрещены. Краткая
  системная background-задача допустима только для завершения уже принятого read/cache write, не мутации.
- Reconnect использует exponential backoff с jitter и верхней границей. Cursor gap/expiry/retention запускает
  canonical REST snapshot; локальные сообщения не сливаются с сервером как подтверждённые.
- OS termination безопасна на любом await. Возвращение после долгого background требует session refresh и полной
  сверки открытого объекта; push — лишь сигнал refetch, не источник состояния.
- Background fetch не является требованием корректности. Silent/data push может только инвалидировать cache при
  разрешённой платформой доставке и не содержит chat text, email, token, точное место или safety evidence.

## Push-разрешение и регистрация устройства

До системного prompt показывается собственный экран после завершения onboarding и первой понятной пользы
(например, join/publish), с категориями `ROSTER`, `REQUESTS`, `MATCH_CRITICAL`, `REMINDERS`, `RESULTS`, `CHAT`.
Pre-prompt можно закрыть; системный prompt вызывается только явной кнопкой, не на первом launch/login и не чаще
одного раза. Отказ не блокирует in-app notifications и ведёт к инструкции открыть системные настройки; приложение
не манипулирует согласием и не обещает гарантированную доставку.

Регистрация push token требует отдельного versioned contract: installation ID случайный и purpose-bound, token
шифруется/хешируется согласно роли, связывается только после auth, обновляется при rotation и удаляется при logout,
delete, provider invalidation или 90 днях неактивности (срок подтвердить на contract/privacy review). Один device
может иметь несколько последовательных tokens, но только один active token на provider/environment; retry
идемпотентен. Sandbox и production credentials разделены. Provider не выбран до terms/residency/privacy review.

Lock-screen notification по умолчанию нейтральна: «В PickleHub есть обновление». Preview chat text, opponent,
venue/address, safety category/evidence и invite token запрещены. Tap не выполняет доменную мутацию: после unlock,
session и authorization открывается allowlisted экран и выполняется refetch. Badge отражает server unread projection
и не увеличивается локально из provider payload.

## Карта, location и offline cache

Location permission запрашивается только кнопкой «Рядом со мной» и только `when in use`: background/always,
geofencing, motion, Bluetooth и contacts не нужны. До prompt объясняются цель, ручная альтернатива и отсутствие
истории перемещений. Approximate location принимается; precise можно попросить только если пользователь отдельно
выбрал сортировку по расстоянию и текущей точности недостаточно. Координата живёт в памяти запроса, округляется
только там, где это требует контракт, и не сохраняется как профиль, cache key, analytics или log. Map продолжает
работать через locality/manual pan при denial/restricted/disabled.

Map tiles, geocoder и attribution включаются только через разрешённые adapters. Offline tile packs, prefetch
областей и сохранение geocoder response запрещены без provider capability. Cache приложения хранит только
server-approved read projections: version/schema, user scope, fetchedAt/expiry и sensitivity class. Допустимы
последние venue/match cards, match detail без секретного invite URL, notification summaries, own/public profile,
history/statistics и chat pages без restricted evidence. Safety text/evidence, magic/invite tokens, точная location,
email, provider payload и analytics buffer без consent не кешируются.

Cache шифруется платформенным ключом, исключён из cloud backup, ограничен размером и TTL, partitioned по user ID;
logout/delete/account switch очищают partition и media. Показ offline всегда имеет метку и время обновления.
Любая мутация — login/onboarding save, venue submission, match/join/roster/result, chat send/edit/delete, preferences,
profile/avatar, feedback/report/block/appeal — требует сети. Общей offline mutation queue нет: повтор выполняется
пользователем после reconcile, с тем же idempotency key только в допустимом контрактом retry window.

## Аналитический паритет

Native использует тот же consent-gated envelope и closed enums, но `platform = MOBILE` нельзя отправлять до
расширения контракта. Источник server events не меняется. Клиент реализует существующие client-owned события:
`onboarding_error_shown`, `venue_selected`, `match_viewed`, `chat_opened`, `chat_resync_required`,
`notification_opened`, `profile_viewed`, `match_history_opened`, `statistics_viewed`, `dupr_link_opened` и
`safety_status_viewed`. `platform.shell_viewed.v1`/`platform.connectivity_changed.v1` являются foundation telemetry,
а не заменой продуктовых событий; их mobile schema также требует contract review.

Все server-owned события сохраняют текущую семантику и дедупликацию: `auth_completed`, `onboarding_started`,
`onboarding_step_saved`, `onboarding_completed`, `identity_link_completed`, `identity_unlink_completed`,
`session_logout_completed`; `venue_search_completed`, `venue_candidate_submitted`, `venue_candidate_qualified`,
`venue_revision_submitted`, `venue_report_submitted`, `venue_moderation_decided`; `match_created`,
`match_published`, `match_search_completed`, `join_requested`, `join_request_decided`, `waitlist_resolved`,
`match_roster_completed`, `match_started`, `match_result_proposed`, `match_result_disputed`,
`match_completed_confirmed`, `match_cancelled`, `match_participant_left`; `chat_message_sent`,
`chat_message_mutated`, `chat_report_submitted`, `notification_preference_changed`; `profile_update_completed`,
`profile_visibility_changed`; `safety_signal_submitted`, `review_submitted`, `safety_appeal_submitted`.

Push permission/registration/delivery failures, app lifecycle and location denial — operational counters only,
агрегированные по OS/app version/reason без token, installation/user ID, location или notification target. Новые
behavioral `permission_*`, `push_received` или background events не добавляются этим этапом. Consent проверяется до
enqueue и перед send; offline-события периода без consent не восстанавливаются. Mobile не меняет главную метрику:
источник подтверждённого матча — immutable server marker, не screen/open/push event.

## Доступность, локализация и матрица устройств

Минимум первого релиза: iOS 16+ и Android 10/API 29+ на поддерживаемых Expo/React Native версиях. Точные верхние
SDK target и store deadlines повторно проверяются по официальным требованиям Apple/Google непосредственно перед
выбором Expo SDK и каждой submission; этот документ не объявляет будущую совместимость проверенной. Телефоны —
обязательны; tablet layouts должны быть usable без горизонтального overflow, но отдельная tablet UX и landscape
optimization не являются release blocker. Проверочная матрица: малый iPhone 320–375 pt, текущий notched iPhone,
iPhone с large Dynamic Type; Android 360 dp/API 29, текущий Android 412 dp с gesture navigation, low-memory device;
минимум одно физическое устройство каждой ОС плюс emulator/simulator. Light/dark, portrait, loss/recovery сети,
cold/warm start и timezone/DST входят в матрицу.

Все действия имеют accessibility label/role/state/hint; порядок VoiceOver/TalkBack следует визуальному, heading и
landmark эквиваленты сохранены. Dynamic Type/font scale до 200% не обрезает данные и действия; screen не зависит от
цвета, карты или swipe. Touch target минимум 44×44 pt iOS и 48×48 dp Android, видимый focus для hardware keyboard,
контраст WCAG AA, reduced motion, достаточный timeout и announce для loading/error/success обязательны. Scores,
timestamps, teams, unread и chart/statistics имеют текстовый эквивалент. Keyboard не закрывает composer/form CTA;
safe area, screen reader, RTL-ready layout и русский plural/date/time через общий i18n проверяются отдельно.

## Приватность и требования магазинов

До beta/submission публикуются реальные privacy policy, support contact, account deletion внутри приложения и
страница удаления без приложения. App Store privacy labels и Google Play Data safety сверяются с фактическим
data inventory: account/contact data, user content, coarse/precise location только ephemeral для функции,
identifiers для push/analytics при соответствующем основании, diagnostics. Tracking, ATT, ad ID, fingerprint,
contacts, background location и cross-app profiling заявлены как неиспользуемые и не добавляются SDK косвенно.

iOS privacy manifest/required-reason APIs и Android permissions/data safety генерируются и проверяются по
фактическим dependencies. `Info.plist`/manifest содержат только нужные camera/photo permissions, если avatar flow
их действительно использует; photo picker предпочтительнее полной медиатеки. Location и notification purpose text
на русском объясняет конкретную функцию. Export encryption declaration, age/content rating, moderation/reporting,
UGC rules, demo/reviewer account, support/privacy URLs, screenshots и store metadata проходят отдельный release
check. Compliance, РФ-residency и provider transfer не считаются доказанными до legal/provider review.

Каждый native SDK проходит allowlist review: назначение, permissions, collected/transferred data, retention,
subprocessors, РФ-residency/трансграничная передача, consent и kill switch. По умолчанию analytics provider,
crash attachments/session replay, ads, social login SDK, map telemetry и push provider выключены. Crash reports не
содержат request body, route params, chat/safety text, email, token, координаты или screenshot.

## Критерии приёмки требований

| ID      | Дано                                                          | Когда                                                  | Тогда                                                                                                                         |
| ------- | ------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| MP-AC1  | Сценарий Match MVP существует в web/TMA                       | Сверяется матрица                                      | Есть native screen/state/navigation и link либо явное обоснованное отсутствие link.                                           |
| MP-AC2  | Пользователь открывает magic/invite/push link cold или warm   | Session отсутствует, expired или onboarding incomplete | Secret обрабатывается один раз; после auth/onboarding открывается только allowlisted authorized destination.                  |
| MP-AC3  | Текущий browser-only identity contract                        | Планируется Expo auth                                  | Native session не реализуется через cookie/WebView/AsyncStorage; contract gate записан до кода.                               |
| MP-AC4  | Пользователь хочет связать Telegram                           | Safe native proof ещё не утверждён                     | Функция unavailable, аккаунты не связываются по clipboard/initData/совпадению атрибутов.                                      |
| MP-AC5  | Location denied/approximate/disabled                          | Открывается каталог                                    | Доступны locality/list/manual map, каталог не блокируется и location не сохраняется.                                          |
| MP-AC6  | Push denied или provider unavailable                          | Происходит match/chat event                            | In-app состояние работает; delivery не обещается, а tap никогда не совершает мутацию.                                         |
| MP-AC7  | Приложение offline                                            | Открывается ранее загруженный read screen или mutation | Read явно stale; mutation disabled/failed без optimistic success и общей фоновой очереди.                                     |
| MP-AC8  | App уходит background и возвращается                          | Открыт chat/match/result                               | Socket закрыт, session/resource reconciled, gap восстанавливается snapshot без дублей.                                        |
| MP-AC9  | Пользователь выходит, удаляет аккаунт или меняет account      | Есть secure/cache/push state                           | User partition, secrets и registration очищены; чужие cached данные не показываются.                                          |
| MP-AC10 | Analytics consent отсутствует/отозван                         | Идёт mobile-сценарий                                   | Behavioral event не буферизуется; доменная операция и operational safety продолжаются.                                        |
| MP-AC11 | VoiceOver/TalkBack, 200% text или reduced motion              | Выполняется любой критический путь                     | Смысл, порядок, ошибки и CTA доступны без карты, цвета, жеста или animation.                                                  |
| MP-AC12 | Планируется store submission                                  | Проверяется release evidence                           | OS/device matrix, permissions, privacy manifests/labels, deletion, provider/legal gates подтверждены актуальными источниками. |
| MP-AC13 | Открывается admin/club/tournament/progress/news/ad/game route | Работает первый mobile release                         | Клиент не обещает экран или скрытую мутацию; gap явно остаётся за пределами Match MVP.                                        |
| MP-AC14 | Mobile-команде удобнее иной DTO/error/state                   | Проектируется клиент                                   | Сначала меняются требования/ADR и TypeSpec/AsyncAPI; generated client не правится вручную.                                    |

## Явные пробелы и gates следующего этапа

1. Утвердить native identity/session contract и добавить `MOBILE` во все допустимые platform/envelope enum.
2. Определить server-bound Telegram return либо оставить link недоступным; provider capability не предполагается.
3. Определить versioned device/push registration, category payload allowlist, invalidation и retention; выбрать
   provider только после privacy/legal/residency review.
4. Проверить, нужны ли канонические venue detail link и mobile-safe auth mutation headers; не кодировать локальные
   endpoint conventions.
5. Зафиксировать cache schemas/TTL/sensitivity, universal/app-link ownership files и threat model lost/stolen device.
6. Синхронизировать analytics schema с `MOBILE`; client event taxonomy не расширять молча.
7. На client/verification этапах подтвердить актуальный Expo SDK, store target SDK/deadlines, реальные устройства,
   VoiceOver/TalkBack, lifecycle/reconnect, provider conditions и disclosures. Сейчас это требования, не evidence.
