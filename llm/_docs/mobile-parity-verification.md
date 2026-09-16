# Проверка функционального паритета mobile

Документ фиксирует доступные доказательства этапа `14-mobile-parity/05-verification`. Это release-readiness аудит,
а не разрешение на публикацию. Store submission, внешние сообщения, включение провайдеров, signing и загрузка
сборки не выполнялись.

## Автоматизированные подтверждения

| Область              | Доказательство                                                                                       | Статус         |
| -------------------- | ---------------------------------------------------------------------------------------------------- | -------------- |
| Native session       | unit: body refresh, bearer-only access, single-flight rotation, fail-closed refresh и offline logout | PASS           |
| Links/push schema    | unit: exact HTTPS host, closed paths, secret отдельно от destination, neutral push payload           | PASS           |
| Realtime lifecycle   | unit: ticket первым сообщением, subscribe с cursor, gap → REST resync, close отменяет reconnect      | PASS           |
| Offline mutations    | verification policy проверяет disabled join/chat CTA; cache policy запрещает restricted classes      | PASS           |
| Cold/warm link       | Maestro flows для isolated mailbox, cold magic link и warm/terminated match link                     | READY, NOT RUN |
| Location denial      | Maestro flow отказывает foreground location и сохраняет list/search fallback                         | READY, NOT RUN |
| Logout purge         | Maestro flow проверяет destructive confirmation и возврат к neutral auth                             | READY, NOT RUN |
| Production export    | iOS/Android Expo export и byte-level scan dev endpoints, E2E stubs, private keys и signing files     | PASS           |
| Accessibility/device | semantic unit/static checks плюс обязательная физическая матрица ниже                                | PARTIAL        |

Maestro использует только development application ID и изолированный test mailbox. Скрипт mailbox получает magic
link, созданный запросом с verifier на том же устройстве; production email, реальные адреса и обход session proof не
используются. Flow не встраивается в production bundle. Он запускается командой `npm run test:e2e --workspace
@picklehub/mobile` после предоставления `E2E_EMAIL`, `E2E_MAILBOX_URL`, test data IDs и установленного Maestro.

## Матрица паритета

`PASS` означает выполненную автоматизированную проверку в доступном слое. `BLOCKED` означает, что сценарий нельзя
считать прошедшим; причина и необходимое подтверждение указаны явно.

| Match MVP surface                     | Доступное evidence                                            | Итог                                                                     |
| ------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Email magic link, rotation, logout    | transport/resolver unit; cold-link Maestro готов              | BLOCKED: нет simulator/device и isolated mailbox run                     |
| Onboarding/profile/consents           | native screen, closed contract и online server authority      | BLOCKED: нет device E2E conflict/resume и 200% font run                  |
| Venue list/map/search/location denial | native fallback и permission Maestro готов                    | BLOCKED: no-op revision/report CTA; provider/device run отсутствует      |
| Match search/detail/create/join       | read/offline UI и online/idempotent create/join               | BLOCKED: edit/publish/cancel/roster/result/feedback UI не реализованы    |
| Chat                                  | snapshot/send, ticket/cursor/resync lifecycle unit            | BLOCKED: edit/delete/report UI и background device run отсутствуют       |
| In-app/push notifications             | inbox, closed payload resolver, provider kill switch          | BLOCKED: settings UI и реальный duplicate APNs/FCM delivery не проверены |
| Profile/history/statistics            | native read surfaces, stale cache and server-owned statistics | BLOCKED: edit/avatar/privacy controls не реализованы                     |
| Safety/account                        | non-cached receipts, local logout and account surfaces        | BLOCKED: report/response/appeal/block/delete completion UI отсутствуют   |
| Telegram link                         | unavailable state соответствует утверждённой границе          | PASS: server-bound proof не утверждён, скрытая привязка отсутствует      |
| Post-MVP/admin routes                 | отсутствуют в navigation и policy canary                      | PASS: ожидаемое исключение scope                                         |

Следовательно, критерий «все сценарии Match MVP пройдены» не достигнут. Каждый известный разрыв отражён выше;
этап нельзя использовать как основание для beta/store release. Разрывы являются результатом проверки реализации
этапа 04, а не разрешением расширить текущий verification prompt продуктовыми заглушками.

## Матрица устройств и доступности

Обязательный прогон: iOS 16 на малом iPhone 320–375 pt, текущий notched iPhone, Dynamic Type 200% и физический
iPhone; Android API 29/360 dp, текущий API/412 dp с gesture navigation, low-memory emulator и физическое Android
устройство. Для обеих ОС проверяются light/dark, portrait, keyboard/safe area, cold/warm/terminated links,
loss/recovery сети, timezone/DST и reduced motion.

VoiceOver/TalkBack обязаны подтвердить порядок, headings, role/state/hint, announce ошибок и CTA без карты, цвета,
swipe или animation. Отдельно проверяются touch targets, contrast, 200% font без обрезания, текстовый эквивалент
статистики и отсутствие горизонтального overflow. В этой среде `xcrun simctl` недоступен, `adb` и Maestro не
установлены; физические устройства не подключены. Поэтому VoiceOver/TalkBack, small-screen, font scaling и reduced
motion имеют статус `BLOCKED`, а semantic props и ScrollView не выдаются за device evidence.

## Lifecycle, push и offline

- Unit-тест доказывает, что realtime ticket отправляется до subscribe, cursor берётся из REST snapshot, server gap
  вызывает canonical resync, а explicit/background close не оставляет reconnect timer.
- Возврат приложения в foreground восстанавливает session и snapshot; полный OS termination/cursor retention run
  остаётся device gate. Background polling/location отсутствуют.
- Push payload содержит только schema/action/opaque notification ID и ведёт к refetch. Дубликат не выполняет
  доменную мутацию. Реальный duplicate delivery, tap routing при cold start и invalid-token feedback заблокированы
  выключенным provider adapter и отсутствием одобренных APNs/FCM credentials.
- Cached read явно отмечен stale. Join, create и chat send disabled offline; restricted safety не кешируется. Общей
  mutation queue и optimistic domain success нет.
- Logout очищает user cache partition, push local state и SecureStore до best-effort server revoke. Backup extraction,
  Keychain/Keystore accessibility и lost-device remote purge требуют подписанной сборки и физических устройств.

## Production-упаковка

Production config теперь fail-closed без `EXPO_PUBLIC_API_URL`; development scheme не попадает в production Expo
extra. `build:release:audit` создаёт отдельные Hermes exports iOS/Android, проверяет public Expo config и сканирует
каждый файл на emulator/local URL, development scheme, E2E markers и private-key headers. Дополнительно весь
репозиторий проверяется на `.jks`, `.keystore`, `.mobileprovision`, `.p12`, `.p8` и `.pem`. Это доказывает только
содержимое Expo export, не IPA/AAB: подписанные native archives не создавались.

Crash/performance SDK отсутствует, поэтому screenshot, route params, chat/safety text, email, token и coordinates не
выгружаются внешнему monitor. Одновременно реальные crash-free/performance точки и dashboard имеют статус
`BLOCKED` до provider/privacy/legal/residency review и отдельной реализации redacted adapter. AASA/assetlinks,
privacy manifests/required-reason APIs, Android Data safety, App Store privacy labels, account deletion page,
support/privacy URLs, content rating и export encryption declaration также требуют инфраструктурного/store review.

## Release decision

Решение — `NO-GO`. Доступные unit/static/contract/build проверки зелёные, но incomplete Match MVP surfaces,
device/OS/accessibility evidence, provider review, universal/app-link ownership, privacy metadata, signing и native
archive audit не закрыты. Публикация в App Store/Google Play остаётся отдельно авторизуемым внешним действием и в
рамках этого этапа не выполнялась.
