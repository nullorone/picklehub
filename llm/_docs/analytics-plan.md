# Базовый план продуктовой аналитики

## Воронка

1. `app_opened`
2. `auth_completed`
3. `onboarding_completed` — активация
4. `match_created` или `join_requested`
5. `match_roster_completed`
6. `match_completed_confirmed` — входные данные для основной метрики
7. `second_match_completed` — сигнал удержания

## Защитные метрики

- время до первого намерения сыграть матч и время заполнения состава;
- конверсия подтверждения заявки и очереди ожидания;
- доли отмен, неявок, споров и жалоб;
- показатели доставки уведомлений и отказа от них;
- доли одобренных и дублирующихся площадок-кандидатов;
- возврат на 1-й, 7-й и 30-й день и конверсия во второй матч;
- злоупотребления в чате и жалобах, а также влияние рекламы на критически важную конверсию.

События используют непрозрачные идентификаторы пользователей и матчей, версионируемую схему, политику согласий
и ограничения срока хранения. Никогда не включайте адрес электронной почты, текст чата, данные аутентификации,
точные координаты или произвольный текст жалобы. Требования к функции должны определять условие отправки события,
его свойства, дедупликацию, владельца и применение на панели мониторинга.

## Идентификация и первичная настройка

Источник — [требования identity](product-requirements.md). Владелец определения метрик — продукт PickleHub,
владелец серверной публикации — модуль identity; клиентские события публикуют команды web/TMA. В MVP это зоны
ответственности одного разработчика. Внешний analytics provider не подключается этим документационным этапом.

Все перечисленные события — схема `v1`. Общая allowlist: случайный `eventId`, `schemaVersion`, серверный UTC
`occurredAt`, `platform` (`WEB`/`TMA`), непрозрачный `userId` только после входа и при разрешении аналитики.
Client time не заменяет серверное время. Разрешённые дополнительные свойства заданы таблицей; произвольные
properties запрещены. Email, Telegram subject/username, credentials, URL, отображаемое имя, выбранный город,
координаты, значения профиля и текст ошибок не отправляются.

| Событие                                                 | Условие и источник                                                           | Дополнительные свойства                                                        | Дедупликация                                                | Применение                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------ |
| `auth_completed`                                        | Backend после commit успешного нового входа, не refresh                      | `method`: `TELEGRAM`/`EMAIL`                                                   | Один `eventId` на успешный вход; повтор outbox сохраняет ID | Входы и конверсия во вход среди согласившихся пользователей. |
| `onboarding_started`                                    | Backend при первом сохранении черновика, когда уже есть разрешение аналитики | Нет                                                                            | Один раз на user ID                                         | Размер наблюдаемой воронки настройки.                        |
| `onboarding_step_saved`                                 | Backend после успешного сохранения шага                                      | `step`: `PROFILE`/`PREFERENCES`/`CONSENTS`; `draftVersion`                     | User ID + версия + шаг                                      | Завершение шагов и точки прекращения настройки.              |
| `onboarding_completed`                                  | Backend при единственном commit `DRAFT` → `COMPLETED`                        | `durationBucket`: `LT_5M`/`5_30M`/`30M_1D`/`GE_1D`, от создания черновика      | Один раз на user ID; стабильный event ID в outbox           | Активация, время настройки, последующая конверсия в матч.    |
| `identity_link_completed` / `identity_unlink_completed` | Backend после commit соответствующей операции                                | `method`: `TELEGRAM`/`EMAIL`                                                   | ID операции, повторы ответа не создают событие              | Использование второго способа входа.                         |
| `session_logout_completed`                              | Backend после commit отзыва                                                  | `scope`: `CURRENT`/`ALL`                                                       | ID операции                                                 | Использование управления доступом.                           |
| `onboarding_error_shown`                                | Клиент при показе ошибки настройки, если согласие доступно и действует       | `step` из списка выше, `reason`: `VALIDATION`/`CONFLICT`/`OFFLINE`/`TEMPORARY` | Один ID на показ, повтор render не отправляет снова         | Поиск проблем формы без пользовательского ввода и raw error. |

Согласие проверяется на момент возникновения и повторно перед публикацией; до согласия событие не ставится в
продуктовый outbox и не восстанавливается задним числом после принятия. Если согласие принято в транзакции
завершения, разрешено только текущее `onboarding_completed`, а не прошлые шаги/вход. Повторная доставка использует
тот же event ID, потребитель обеспечивает уникальность; transport exactly-once не предполагается. Отзыв
подавляет ещё не опубликованные события и клиентский буфер. Аналитика необязательна и не блокирует доменную
операцию при недоступности получателя.

`app_opened` подчиняется тому же правилу согласия: до восстановления серверного разрешения клиент не отправляет
событие. Воронка имеет неполное наблюдение: отсутствие `auth_completed` у нового пользователя не означает провал
входа, если согласие появилось позднее. Dashboard показывает размер выборки с согласием, считает переходы только
для пользователей с наблюдаемым началом и отдельно отображает активации без предыдущих наблюдаемых шагов.
Не вычислять общую конверсию продукта по этой смещённой выборке.

Защитные operational metrics без user/session/email/IP IDs и без event-level профиля: количество запросов по
шаблону операции, классам ответа и общему reason class, latency histogram, ошибки доставки, подавление лимитами,
refresh replay и identity conflicts. Ими владеет backend/security; они нужны для доступности и обнаружения атак,
а не скрытого измерения поведения отказавшихся пользователей. Audit связывания, отзыва, изменения согласий и
удаления создаётся независимо от analytics consent, без секретов и значений профиля. Сроки хранения и правовые
основания этих потоков отдельно описаны в [security/privacy](security-privacy.md).

## Площадки

События каталога используют общую consent policy и envelope `v1`, заданные выше. Raw query, bounding box, радиус,
адрес, координаты, provider payload/ID, venue/candidate/source ID, название, текст исправления/жалобы и точное
расстояние запрещены. Разрешены только закрытые enum и buckets из таблицы; произвольные properties не принимаются.

| Событие                     | Условие и источник                                                       | Дополнительные свойства                                                                                  | Дедупликация                                          | Применение                                                         |
| --------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| `venue_search_completed`    | Backend после успешного ответа каталога; не при provider/transport error | `surface`: `MAP`/`LIST`/`TEXT`; `resultBucket`: `ZERO`/`ONE_FIVE`/`SIX_TWENTY`/`GT_TWENTY`; `staleShown` | Один event ID на принятый request ID                  | Доля пустой выдачи и доступность полезного каталога.               |
| `venue_selected`            | Клиент после явного выбора результата при действующем согласии           | `surface`: `MAP`/`LIST`/`TEXT`; `distanceBucket`: `LT_1KM`/`1_5KM`/`5_20KM`/`GE_20KM`/`UNKNOWN`          | Один event ID на действие выбора                      | Конверсия поиска в выбор без сохранения места.                     |
| `venue_candidate_submitted` | Backend после commit создания match-only кандидата                       | `entry`: `MANUAL_PIN`/`ALLOWED_GEOCODER`; `amenitiesCompleteness`: `NONE`/`PARTIAL`/`FULL`               | Candidate operation ID; idempotency replay без дубля  | Использование пути добавления и качество заполнения.               |
| `venue_candidate_qualified` | Backend при единственном переходе после подтверждённого матча            | Нет                                                                                                      | Candidate ID внутри producer; наружу ID не передаётся | Конверсия кандидатов в moderation queue.                           |
| `venue_revision_submitted`  | Backend после commit предложения исправления                             | `fieldGroup`: `LOCATION`/`ACCESS`/`AMENITIES`/`HOURS`/`STATUS`                                           | Revision operation ID                                 | Типы пробелов качества каталога.                                   |
| `venue_report_submitted`    | Backend после commit структурированной жалобы                            | `reason`: `PRIVATE_RESIDENCE`/`DUPLICATE`/`CLOSED`                                                       | Report operation ID                                   | Safety/quality workload без содержания жалобы.                     |
| `venue_moderation_decided`  | Backend после commit одного решения                                      | `subject`: `CANDIDATE`/`REVISION`/`REPORT`; `decision`: `APPROVED`/`REJECTED`/`MERGED`/`WITHDRAWN`       | Decision ID; outbox retry сохраняет event ID          | Approval, duplicate rate и время очереди в агрегированной витрине. |

Dashboard каталога показывает размер consented sample отдельно от operational totals. Основные продуктовые
показатели: переход search → select, доля zero-result по surface, candidate → qualified → approved, медиана и p90
времени модерации, доли `APPROVED`/`REJECTED`/`MERGED` и распределение структурированных причин. Они не измеряют
перемещение пользователя и не позволяют восстановить посещённые места.

Operational quality metrics не являются продуктовой аналитикой и работают без пользовательских идентификаторов:
доступность/latency и error class отдельно для catalog, geocoder и tiles; доля опубликованных карточек с валидной
координатой и полным разрешённым provenance; покрытие обязательной атрибуцией; доля stale >180 суток; размер и
возраст moderation/refresh очередей; число upstream `REMOVED`/`UNREACHABLE`; число privacy quarantine; доля
подтверждённых дубликатов и исправлений после публикации. Любое сохранение external result при capability
`storageAllowed = false`, публичная карточка без координаты/provenance или пропущенная обязательная атрибуция —
инцидент качества с целевым значением ноль, а не допустимый процент.

Backend/venues владеет server events и operational metrics; клиенты владеют только `venue_selected` и показом
UI-состояний. Повтор outbox сохраняет event ID, consumer применяет уникальность. Недоступность analytics не
блокирует поиск, публикацию, privacy quarantine или audit; события до согласия не буферизуются и не
воспроизводятся после него.

## Матчи

Проекции в behavioral analytics используют consent policy и envelope `v1` раздела identity. Доменный marker и
минимальный внутренний event обязательного агрегата главной метрики создаются независимо от optional analytics
consent и не экспортируются провайдеру без него. Raw invite token/URL, описание, booking note, venue
ID/адрес/координаты, search origin, точные расстояние/время, ID других игроков, очередь, значение уровня, счёт и
причина спора запрещены. Разрешены только закрытые enum и buckets ниже.

| Событие                     | Условие и источник                         | Дополнительные свойства                                                                           | Дедупликация                     | Применение                                 |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------- | ------------------------------------------ |
| `match_created`             | Backend после первого commit черновика     | `format`, `visibility`, `joinMode`: разрешённые значения либо `UNSET`                             | Один event ID на match ID        | Первое намерение и mix правил.             |
| `match_published`           | Единственный `DRAFT` → `PUBLISHED`         | Те же enum; `leadTimeBucket`: `LT_6H`/`6_24H`/`1_7D`/`GT_7D`                                      | Match ID + transition            | Конверсия черновика в доступный матч.      |
| `match_search_completed`    | Backend после успешной публичной выдачи    | `resultBucket`: `ZERO`/`ONE_FIVE`/`SIX_TWENTY`/`GT_TWENTY`; `hasTimeWindow`; `hasLocation`        | Принятый request ID              | Полезность выдачи без слежения.            |
| `match_viewed`              | Клиент при осмысленном показе карточки     | `entry`: `SEARCH`/`INVITE`; `format`; `visibility`                                                | Match + screen session           | Search/invite → view в consented sample.   |
| `join_requested`            | Commit заявки, auto join или FIFO entry    | `path`: `AUTO_JOINED`/`AUTO_WAITLISTED`/`APPROVAL_PENDING`; `format`; `teamChoice`: `A`/`B`/`ANY` | ID доменной операции             | Намерение сыграть и путь вступления.       |
| `join_request_decided`      | Терминальное решение организатора          | `decision`: `APPROVED_TO_ROSTER`/`APPROVED_TO_WAITLIST`/`REJECTED`                                | Request ID                       | Approval conversion.                       |
| `waitlist_resolved`         | `PROMOTED`/`WITHDRAWN`/`SKIPPED`/`EXPIRED` | `outcome`; `waitBucket`: `LT_30M`/`30M_2H`/`2_12H`/`GE_12H`                                       | Entry ID + outcome               | Конверсия/время очереди без позиции.       |
| `match_roster_completed`    | Вычисляемый переход незаполнен → заполнен  | `format`; `hoursToStartBucket`: `PAST`/`LT_2H`/`2_24H`/`GE_24H`                                   | Match ID + completion sequence   | Время заполнения без status drift.         |
| `match_started`             | Единственный переход в `IN_PROGRESS`       | `format`; `roster`: `MINIMUM`/`FULL`                                                              | Match ID + transition            | Доля публикаций, дошедших до игры.         |
| `match_result_proposed`     | Commit новой версии предложения            | `mode`: `SCORED`/`PLAYED_WITHOUT_SCORE`; `submissionBucket`: `LT_6H`/`6_24H`/`1_3D`               | Match ID + result version        | Потери между началом и предложением.       |
| `match_result_disputed`     | Единственный переход версии в `DISPUTED`   | `mode`; `responseBucket`: `LT_6H`/`6_24H`/`1_2D`/`GE_2D`                                          | Match ID + result version        | Доля споров без содержания.                |
| `match_completed_confirmed` | Транзакция immutable confirmed marker      | `mode`; `format`; `confirmationPath`: `PLAYER`/`MODERATOR`; `responseBucket`                      | Match + `CONFIRMED_MATCH` marker | Главная недельная метрика и пилот.         |
| `match_cancelled`           | Терминальный переход до начала             | `stage`: `DRAFT`/`PUBLISHED`; `leadTimeBucket`: `PAST`/`LT_2H`/`2_24H`/`GE_24H`                   | Match ID + transition            | Доля/момент отмен без текста.              |
| `match_participant_left`    | Участие переходит в `LEFT`                 | `timing`: `LATE`/`NOT_LATE`                                                                       | Participant ID + transition      | Late-exit guardrail и нагрузка на очередь. |

Immutable confirmed marker — единственный источник главной метрики; одноимённый analytics event является его
consent-filtered проекцией. Внутренняя витрина дедуплицирует marker, использует серверный `confirmedAt` для
UTC-недели и разделяет `PLAYER`/`MODERATOR`. Пилотная конверсия строится из
серверных фактов: знаменатель — уникальные опубликованные матчи хотя бы с заявкой, auto join или waitlist;
числитель — их marker. Результат показывается при выборке от 30. Клиентские события и analytics consent не
определяют этот operational KPI.

Продуктовая панель показывает create → publish → first intent → computed roster complete → start → propose →
confirm, медиану/p90 заполнения и подтверждения, approval и waitlist promotion rates, доли late exit, cancel и
dispute. Для consented funnel показывается размер выборки; агрегированный marker не используется для профилирования.

Operational metrics без user IDs: capacity/version/idempotency conflicts, конкурентные проигрыши, превышение
team capacity (цель ноль), активные/просроченные offer/result confirmation, возраст очереди, invalid transitions,
latency join/promotion/confirmation, outbox lag/retry и расхождение матча с result/marker (цель ноль). Audit и эти
счётчики не зависят от analytics consent и не содержат token, состав, текст или географию. Недоступность analytics
не откатывает транзакцию; retry сохраняет event ID, consumer обеспечивает уникальность.

## Чат и уведомления

Behavioral events подчиняются общей consent policy. Текст/ревизия сообщения, message/chat/match/user/notification
ID, имена и состав, invite token/route, причина и evidence жалобы, блокируемый пользователь, locale/timezone,
точное время чтения, email/Telegram subject и provider payload/ID запрещены. Ни длина отдельного текста, ни граф
«кто с кем общается» не экспортируются. Разрешены только enum/buckets ниже.

| Событие                           | Условие и источник                                    | Дополнительные свойства                                                                  | Дедупликация                                  | Применение                                      |
| --------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| `chat_opened`                     | Клиент после успешного foreground snapshot            | `entry`: `MATCH`/`NOTIFICATION`; `unreadBucket`: `ZERO`/`ONE_FIVE`/`SIX_TWENTY`/`GT_20`  | Chat + screen session внутри producer         | Использование чата и вход из уведомления.       |
| `chat_message_sent`               | Backend после commit пользовательского текста         | `matchPhase`: `BEFORE_START`/`IN_PROGRESS`/`AFTER_TERMINAL`                              | Message operation ID, наружу ID не передаётся | Доля матчей с коммуникацией, без содержания.    |
| `chat_message_mutated`            | Backend после commit edit/delete                      | `action`: `EDITED`/`DELETED`; `ageBucket`: `LT_1M`/`1_5M`/`5_15M`                        | Message + revision внутри producer            | Проверка понятности политики исправлений.       |
| `chat_resync_required`            | Клиент получил protocol resync и начал REST recovery  | `reason`: `CURSOR_EXPIRED`/`RETENTION`/`GAP_LIMIT`                                       | Один event на recovery attempt                | Качество reconnect без cursor/sequence.         |
| `chat_report_submitted`           | Backend после commit структурированной жалобы         | `reason`: `SPAM`/`HARASSMENT`/`HATE`/`THREAT`/`OTHER`                                    | Report operation ID                           | Abuse workload без текста или автора.           |
| `notification_preference_changed` | Backend после commit настроек при действующем consent | `channel`: `TELEGRAM`/`EMAIL`; `category`; `enabled`; `quietHours`: `ON`/`OFF`           | Preference version + changed tuple            | Opt-in/out и настройка канала.                  |
| `notification_opened`             | Клиент открыл in-app item/deep link в foreground      | `channel`: `IN_APP`/`TELEGRAM`/`EMAIL`; `category`; `ageBucket`: `LT_5M`/`5M_1H`/`GT_1H` | Notification + channel внутри producer        | Полезность категорий без обещания read receipt. |

`chat_message_sent` не создаётся до analytics consent и не восстанавливается задним числом; обязательная запись
сообщения от этого не зависит. Blocking — safety preference и не является behavioral event. Жалоба создаёт
обязательный restricted case/audit независимо от consent, а одноимённая аналитическая проекция появляется только
с consent и содержит только reason enum. Клиентский `chat_opened` не считается прочтением:
источником unread остаётся серверная монотонная позиция.

Transport health измеряется только operational metrics без recipient/source IDs: количество logical notifications
и attempts по закрытым category/channel/outcome, queue age, quiet-hour deferral bucket, retry count, provider
availability/latency, acceptance/bounce/suppression, failover и duplicate estimate. `ACCEPTED`/`DELIVERED` —
transport status, не human read; гарантированная доставка и exactly-once не выводятся из dashboard. Provider
metrics не соединяются с профилем или чатом.

Chat operational metrics без текста и пользовательских labels: send/edit/delete throughput, authorization/rate
denials по reason class, sequence conflicts (цель ноль), duplicate event suppression, reconnect gap/resync,
connection queue overflow, unread projection lag, report count и retention cleanup lag. Агрегаты публикуются с
минимальным размером когорты и ограниченной размерностью, чтобы не восстановить участие в малом матче. Audit,
abuse detection и delivery reliability не зависят от analytics consent, но не используются для скрытой продуктовой
аналитики. Недоступность analytics/provider не блокирует сообщение, in-app item, жалобу или доменную операцию.
