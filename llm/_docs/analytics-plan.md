# Базовый план продуктовой аналитики

## Мобильный клиент

React Native/Expo повторяет существующую consent policy, дедупликацию и closed enum taxonomy Match MVP согласно
[матрице mobile parity](mobile-parity-requirements.md). Server-owned события не дублируются клиентом; mobile
реализует только уже определённые client-owned события соответствующего сценария. До contract review значение
`MOBILE` нельзя подставлять в текущий allowlist `WEB`/`TMA`, а новые события разрешений, lifecycle, push receipt или
location не являются behavioral analytics. Техническое качество этих функций измеряется только агрегированными
operational counters без user/device/push token, route target или координат. Отсутствие consent не создаёт offline
буфер и не влияет на доменную операцию или immutable marker подтверждённого матча.

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

## Профиль и статистика

Источник — [требования профиля](product-requirements.md). Behavioral events используют consent/envelope `v1` и
только закрытые enum/buckets. Subject profile ID, match/result/club ID, имя, населённый пункт, форматы профиля,
значение самооценки, DUPR URL/домен, счёт, points, wins/losses/win rate, reliability/no-show значения, block side и
причина недоступности запрещены. Viewer ID допустим только как общий consented opaque `userId` envelope; событие не
строит граф просмотров игроков.

| Событие                      | Условие и источник                                         | Дополнительные свойства                                                                                 | Дедупликация                        | Применение                                           |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------- |
| `profile_viewed`             | Клиент после осмысленного успешного показа                 | `ownership`: `SELF`/`OTHER`; `entry`: `MATCH`/`HISTORY`/`DIRECT`; `visibility`: `PUBLIC`/`PRIVATE_SELF` | Subject + screen session у producer | Полезность профиля без графа viewer → subject.       |
| `profile_update_completed`   | Backend после commit разрешённых полей при consent         | `changed`: непустая битовая маска `NAME`/`LOCALITY`/`FORMATS`/`SELF_ASSESSMENT`/`DUPR`                  | Profile version                     | Понятность редактирования и востребованность полей.  |
| `profile_visibility_changed` | Backend после commit перехода видимости                    | `visibility`: `PUBLIC`/`PRIVATE`                                                                        | Profile version + transition        | Доля явного открытия/закрытия профиля.               |
| `match_history_opened`       | Клиент показал первую успешную страницу                    | `ownership`: `SELF`/`OTHER`; `resultBucket`: `ZERO`/`ONE_FIVE`/`SIX_TWENTY`/`GT_TWENTY`                 | Subject + screen session у producer | Использование истории и качество пустого состояния.  |
| `statistics_viewed`          | Клиент показал согласованную проекцию или пустое состояние | `ownership`; `format`: `ALL`/`SINGLES`/`DOUBLES`; `state`: `EMPTY`/`AVAILABLE`/`UPDATING`               | Subject + format + screen session   | Использование детализации и частота lag-состояния.   |
| `dupr_link_opened`           | Клиент подтвердил переход по разрешённой внешней ссылке    | `ownership`: `SELF`/`OTHER`; `surface`: `PROFILE`                                                       | Subject + screen session у producer | Нужность интеграции без URL, ID или результата DUPR. |

Ошибочный/запрещённый просмотр, block и закрытый профиль не создают `profile_viewed`: иначе событие раскрыло бы
существование subject. Operational access-denial counters агрегируются только по безопасному reason class и без
viewer/subject labels. Отзыв consent прекращает новые behavioral events; прошлые открытия/изменения не
восстанавливаются при повторном согласии и не влияют на профиль или расчёт статистики.

Продуктовая панель показывает self/other profile → history/statistics и долю нейтральных empty states, update
completion по маске полей, переходы visibility и DUPR outbound intent. Она не строит leaderboard, skill/no-show
когорты, пары viewer–subject или сегменты по точному значению статистики. Для малых когорт применяется минимальный
порог публикации и подавление комбинаций, способных восстановить конкретного игрока.

Обязательная статистическая проекция работает без analytics consent, потому что является функцией продукта, но
её telemetry не является behavioral analytics. Разрешены только агрегированные counters: число apply/retract/no-op
по outcome, duplicate/stale revision suppression, consumer lag bucket, generation age/state, rebuild duration,
source/contribution/aggregate count mismatch и checksum/reconciliation result. User/match/result IDs и сами
totals запрещены как metric labels. Цели: duplicate current contribution, отрицательный total, `wins + losses >
played`, `ALL != SINGLES + DOUBLES` и переключение неполного generation — ноль. Analytics outage не блокирует
сохранение профиля, privacy invalidation, чтение истории или rebuild.

## Доверие и безопасность

Behavioral events подчиняются общей consent policy и envelope `v1`. Report/review/case/decision/appeal ID,
reporter/subject/moderator ID, их пары, match/content/venue ID, rating, tags, текст, evidence, block side, emergency
number, точное время/место, sanction scope и internal reason запрещены. Не отправляются события просмотра формы,
набора текста, показа emergency warning или открытия статуса конкретного case: они создали бы чувствительный граф.

| Событие                   | Условие и источник                                         | Дополнительные свойства                                                                                   | Дедупликация                          | Применение                                    |
| ------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- |
| `safety_signal_submitted` | Backend после commit сигнала при действующем consent       | `kind`: `NO_SHOW`/`SAFETY`/`CONTENT`/`VENUE`/`RESULT`; `entry`: `MATCH`/`CHAT`/`PROFILE`/`VENUE`/`STATUS` | Signal operation ID                   | Доступность путей обращения без содержания.   |
| `review_submitted`        | Backend после первой eligible review revision              | `timing`: `LT_24H`/`1_7D`/`8_14D`                                                                         | Review ID; updates не создают событие | Использование отзыва без rating/subject.      |
| `safety_status_viewed`    | Клиент показал список receipt без открытия отдельного case | `state`: `EMPTY`/`HAS_OPEN`/`RESOLVED_ONLY`; `countBucket`: `ZERO`/`ONE`/`TWO_FIVE`/`GT_FIVE`             | User + screen session у producer      | Находимость квитанций без категории и связей. |
| `safety_appeal_submitted` | Backend после commit допустимой апелляции                  | `decisionKind`: `NO_ACTION`/`ACTION_TAKEN`/`ROUTED`/`CANNOT_REVIEW`; `timing`: `LT_24H`/`1_7D`/`8_14D`    | Appeal operation ID                   | Понятность решений и пути пересмотра.         |

Блокировка/разблокировка, ответ затронутого игрока, moderator action, emergency warning и автоматический quarantine —
обязательные safety/security операции, а не behavioral analytics. Они не экспортируются как пользовательские
events даже при consent. `safety_signal_submitted` не содержит узкую reason taxonomy: малые категории и context
могут деанонимизировать пострадавшего. Существующие `chat_report_submitted` и `venue_report_submitted` после
перехода на единый lifecycle считаются source-specific проекциями той же операции и не должны одновременно
увеличивать общий report total; единый event ID обеспечивает дедупликацию.

Operational dashboard работает независимо от analytics consent и только на агрегатах: received/resolved по broad
kind, queue-age buckets, assignment/reassignment, duplicate/link rate, decision outcome class,
time-to-first-human-action и time-to-close buckets, appeal/uphold/change, expired temporary restrictions, effect
apply/retract/replay, notification deferral, restricted-read denial и retention cleanup lag. Нельзя использовать
reporter/subject/case ID, точный timestamp, venue/match, moderator identity или свободный policy reason как labels.
Размеры малых когорт подавляются; dashboard не строит рейтинг сотрудников, карту инцидентов или профиль игрока.

Guardrails: pending report, число reports и withdrawal не публикуются как подтверждённое нарушение; один final
no-show даёт один effect; reversal полностью компенсирует публичную/статистическую проекцию; restricted evidence
read без assignment, просроченный temporary effect, пропущенный cleanup и canary text/contact/coordinate в любом
запрещённом sink имеют целевое значение ноль. Analytics outage не блокирует report, review, block, decision,
appeal, audit или cleanup, а события периода без согласия не буферизуются и не воспроизводятся.

## Административная панель

Административные действия не являются behavioral analytics и не зависят от пользовательского или staff consent.
Role/capability checks, user lookup, queue/card read, decision, venue moderation, restriction, audit search и
break-glass не отправляются внешнему analytics provider как event-level поток. Запрещены actor/user/reporter/
subject/case/venue IDs и пары, email/identity query, IP, exact time, safety reason на малой выборке, narrative/
evidence, before/after, policy note, cursor, request ID и correlation ID.

Operational dashboard получает только агрегаты с role, action enum, broad object class, safe outcome и buckets:

- admin login, MFA/re-auth, session revoke, authorization deny и rate-limit/dependency fail-closed;
- role grant/revoke, active grant age bucket и просроченный review без actor/target;
- case queue depth/age, claim/reassignment conflict, first-action/close time и appeal age/outcome class;
- venue candidate/revision/report queue age, approve/reject/merge class и stale/concurrent conflict;
- restriction apply/retract/expiry lag и duplicate/idempotency suppression;
- audit write/read/search failure, restricted-read denial и break-glass grant/read/revoke/expiry;
- попытки запрещённого MVP export и обнаруженные export artifacts, целевое значение последних — ноль.

Точные counts малых когорт подавляются, интервалы округляются до buckets, labels имеют закрытый allowlist.
Dashboard не ранжирует сотрудников, не показывает incident map и не восстанавливает граф reporter–subject или
историю пользователя. Audit — отдельный security record и не заменяется метрикой. Недоступность metrics/provider
не блокирует безопасную операцию, а недоступность обязательного audit блокирует мутацию. Будущие CMS/ad product
events определяются их требованиями; этот этап не собирает просмотры экранов редактора или менеджера рекламы.

## Клубы

Club behavioral analytics использует общий consent envelope `v1` и не влияет на доменную операцию. Запрещены
название/описание клуба, club/user/invite/request/match/venue IDs, invitation token, состав и его размер на малой
выборке, role target, причина исключения/блокировки, поисковая строка, точное место и время расписания. Для distinct
club в защищённом внутреннем расчёте допустим ротируемый keyed pseudonym; он не экспортируется как dimension и не
позволяет восстановить membership graph.

| Событие                          | Условие и источник                                                       | Дополнительные свойства                                                                                                | Дедупликация                   | Применение                                 |
| -------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------ |
| `club_created`                   | Backend после атомарного создания клуба и owner membership               | `initialPolicy`: `OPEN`/`APPROVAL`/`INVITE_ONLY`; `venueBucket`: `ZERO`/`ONE`/`TWO_PLUS`                               | Club creation operation ID     | Создание и стартовая конфигурация.         |
| `club_search_completed`          | Клиент показал первую успешную страницу или пустое состояние             | `resultBucket`: `ZERO`/`ONE_FIVE`/`SIX_TWENTY`/`GT_TWENTY`; `filter`: `NONE`/`LOCALITY`/`VENUE`; без query и origin    | Search session у producer      | Находимость клубов и пустые выдачи.        |
| `club_membership_intent_created` | Backend после open join, заявки или выдачи приглашения при consent actor | `path`: `OPEN`/`REQUEST`/`INVITE`; `actor`: `PLAYER`/`MANAGER`; без target, policy reason и delivery identity          | Membership intent operation ID | Знаменатель воронки по механизму.          |
| `club_membership_activated`      | Backend после первого активного membership, кроме creator-owner          | `path`; `latency`: `IMMEDIATE`/`LT_24H`/`1_7D`/`GT_7D`; без роли target                                                | Club + user activation marker  | Конверсия вступления без повторного счёта. |
| `club_match_confirmed`           | Backend после уникального confirmed club match metric marker             | `origin`: `ONE_OFF`/`RECURRING`; `format`: `SINGLES`/`DOUBLES`                                                         | Match metric marker            | Завершённые клубные матчи.                 |
| `club_recurring_fill_captured`   | Backend один раз на scheduled start materialized recurring-встречи       | `format`; `fillBucket`: `EMPTY`/`PARTIAL`/`FULL`; `ratioBucket`: `ZERO`/`LT_HALF`/`HALF_TO_LT_FULL`/`FULL`; без roster | Recurring occurrence marker    | Заполнение встреч серии.                   |

Open conversion = число уникальных membership activations после допустимого open intent / число допустимых open
intents. Request conversion = принятые и активированные memberships / валидные отправленные requests. Invite
conversion = принятые и активированные memberships / выданные приглашения, отдельно показывая revoked/expired
как outcomes, а не удаляя их из знаменателя. Общая конверсия не усредняет эти разные знаменатели; creator-owner,
идемпотентные replay, blocked/invalid попытки и восстановление прежнего membership исключаются. Срезы строятся по
когорте создания intent и окнам 24 часа, 7 и 28 суток; незрелая когорта помечается, а не считается отказом.

Активный клуб за скользящие 28 суток — неархивный клуб хотя бы с одним committed human action: новым membership,
решённой заявкой, принятым приглашением, созданным пользователем клубным матчем либо подтверждённо завершённым
клубным матчем. Просмотр, поиск, автоматическая материализация серии, системный retry и изменение карточки не
делают клуб активным. Публикуются daily snapshot distinct count и доля активных среди неархивных клубов без
рейтинга и exact member count малой когорты.

Завершённый клубный матч считается один раз по confirmed match marker с неизменяемой club attribution; recurring
встреча входит и в общий club match count, и в recurring cohort, но не удваивает общий count. Fill фиксируется для
каждой неотменённой materialized встречи в её scheduled start: число активных registered participants и guest
slots / вместимость формата; pending requests и waitlist не входят. Хранится metric snapshot, поэтому поздний
выход или изменение roster не переписывает прошлое. Dashboard показывает средний ratio, распределение buckets и
долю `FULL`, срезы только по format/origin и крупным временным когортам.

Archive/restore, ownership/role change, exclusion, club block, invite revoke и venue detach — обязательные
domain/security actions, а не behavioral events. Operational counters разрешают только action/outcome enum,
membership-policy/role class, conflict/duplicate suppression, recurring generation lag/pause reason class и
orphan-owner invariant violation. IDs, names, member graph, invitation token, reason text, coordinates и exact
timestamps запрещены как labels; orphan-owner target равен нулю. Analytics outage или отсутствие consent не
блокирует клуб, membership, серию или матч, а события пропущенного периода не буферизуются и не воспроизводятся.

## Турниры

Tournament behavioral analytics использует общий consent envelope `v1` и не является источником bracket,
standings или completion. Запрещены tournament/club/venue/user/entry/team/match IDs, название/описание, roster и
pairing graph, waitlist position, payment state/price, score, seed/rating, no-show identity, exact schedule/location,
challenge pair и correction reason. Формат, strategy major version, play mode, закрытые count/time buckets и
безопасный outcome разрешены; малые когорты подавляются. Внутренний operational marker может содержать opaque ID
для дедупликации, но он не экспортируется как analytics dimension.

| Событие                           | Источник после commit                                   | Разрешённые свойства                                                                                          | Дедупликация                          |
| --------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `tournament_published`            | Backend после первого перехода в `PUBLISHED`            | `format`, strategy major, `playMode`, `capacityBucket`, `clubAttributed`, `priceMode`: free/informational     | Tournament publication marker         |
| `tournament_registration_started` | Backend после первого eligible intent при consent actor | `format`, `entryKind`: individual/team/partner, `source`: direct/waitlist                                     | Registration operation ID             |
| `tournament_entry_eligible`       | Backend после готового entry до seeding                 | `format`, `entryKind`, `path`: direct/paired/promoted, `latencyBucket`                                        | Tournament + entry eligibility marker |
| `tournament_check_in_completed`   | Backend после terminal check-in entry                   | `format`, `outcome`: arrived/withdrawn/no-show, `leadTimeBucket`                                              | Entry check-in transition             |
| `tournament_started`              | Единственный переход в `IN_PROGRESS`                    | `format`, strategy major, `entrantBucket`, `fillBucket`, `courtBucket`                                        | Tournament start marker               |
| `tournament_completed`            | Immutable tournament completion marker                  | `format`, strategy major, `entrantBucket`, `roundBucket`, `durationBucket`, `correctionBucket`, `pauseBucket` | Tournament completion marker          |

Registration conversion считается по когорте первого допустимого intent: число уникальных eligible entries до
seeding / уникальные direct/team/partner intents, отдельно по entry path и окнам 24 часа, 7 дней и до registration
close. Idempotent replay, invalid/blocked request и organizer-created test draft исключаются. Один paired entrant
не считается как два entrants, но player-level partner funnel отдельно показывает долю opt-in игроков, вошедших в
полную пару. Waitlist promotion rate — принятые offers / выданные offers; expiry и decline остаются outcomes.

Fill snapshot фиксируется один раз перед seeding: eligible entrants / preset capacity. Check-in rate использует
только eligible registered players или полные teams и не включает waitlist/pairing pool. Started rate — доля
published tournaments, достигших `IN_PROGRESS`; completion rate — доля started с immutable completion marker.
Completion режется по format/strategy major и крупным entrant/round buckets, но не по venue, club или organizer.
Tournament completion, отдельный tournament match и bye не увеличивают основную метрику confirmed ordinary matches.

Product dashboard показывает published → first intent → eligible minimum → seeded → started → completed,
withdrawal/no-show, partner formation, FIFO promotion, completion duration, operational pause и result correction
rate. Цена и ручная payment отметка не измеряются поведенчески. Форматные guardrails: unresolved tie, duplicate
entrant/slot, impossible dependency, standings checksum mismatch и duplicate completion marker имеют target zero.

Operational metrics не требуют consent: command outcome, active tournaments by lifecycle bucket, generation lag,
strategy duration, round/match counts in buckets, court scheduling backlog, idempotency/version conflict, waitlist
race suppression, correction type, pause reason enum, projection checksum mismatch, outbox retry/quarantine и
recovery outcome. Labels не содержат IDs, score, roster, payment, exact time/place или free-text reason. Analytics
outage не блокирует регистрацию/проведение; пропущенные behavioral events не восстанавливаются из domain history.

## Геймификация

XP ledger и leaderboard consent — доменные records, а не behavioral analytics. Расчёт XP, cap, reversal,
achievement и rank работает при отсутствии analytics consent/provider и никогда не восстанавливается из
клиентской телеметрии. Behavioral события используют общий consent envelope `v1`; запрещены user/club/season/
source/match/review/case IDs, display name/avatar, XP exact value, opponent graph, score/outcome, DUPR, reason,
текст, точное время/место и device/advertising identifiers.

| Событие                        | Условие после факта                                             | Разрешённые свойства                                                              | Дедупликация                    |
| ------------------------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------- |
| `gamification_progress_viewed` | Клиент показал свой согласованный progress                      | `scope`: global/club; `state`: active/frozen; `levelBucket`; без balance          | View session у producer         |
| `achievement_presented`        | Владелец впервые увидел posted/reinstated achievement           | `family`: play/organize/review; `thresholdBucket`; `state`: earned/reinstated     | Achievement presentation marker |
| `leaderboard_consent_changed`  | Backend committed explicit opt-in/opt-out при analytics consent | `scope`; `action`: opt_in/opt_out; `seasonPhase`: active/closed                   | Consent revision                |
| `leaderboard_viewed`           | Клиент показал первую согласованную страницу                    | `scope`; `seasonPhase`; `resultBucket`; `viewerState`: participant/nonparticipant | View session у producer         |

Primary evaluation cohort — зарегистрированные игроки с первым confirmed participation, которым функция была
доступна, против сопоставимой временной/экспериментальной когорты без неё. 28-day retained confirmed player — тот,
у кого есть другой confirmed фактический матч на 22–35-й день после первого; login/view/XP retry не считается.
Показываются absolute cohort sizes, доверительный интервал, зрелость окна и доля consented coverage. Rollout не
рандомизирует safety/XP eligibility между игроками одного матча и не скрывает уже заработанный прогресс.

Каждый retention срез обязан иметь тот же период и cohort definition для guardrails:

- safety reports на 100 уникальных confirmed участников и доля substantiated outcomes отдельно;
- no-show participants / всех ожидаемых зарегистрированных participants;
- доля award chains с hold, reversal и moderator-confirmed manipulation;
- concentration: доля posted play XP из повторяющейся пары и замкнутой группы в coarse buckets;
- leaderboard opt-in/opt-out rate и privacy/block cache violations с target zero.

Рост views, opt-in, XP volume или leaderboard rank не является success metric. Запуск успешен только при заранее
заданном minimum sample, положительном/неотрицательном доверительном интервале retention и отсутствии статистически
значимого ухудшения любого safety guardrail; иначе результат inconclusive/harmful. Жалобы не трактуются как
доказанные нарушения, а малые когорты подавляются. Срезы разрешены по global/club scope, rule major, крупной
activity cohort и rollout arm, но не по конкретному клубу, сезону, игроку или паре.

Operational metrics не требуют behavioral consent: source outcome class, award status/reason enum, processing lag,
cap/duplicate/reversal/reinstatement count, projection checksum mismatch, pending age, review/appeal age/outcome,
leaderboard cache invalidation и blocked-row leak. Labels не содержат IDs, точный XP/time, pair graph или evidence.
Targets: duplicate net award, over-cap post, compensation over original, XP-to-DUPR/stat mutation, opt-out leak,
blocked identity leak и unreviewed automatic sanction — ноль. Analytics outage не блокирует source workflow/XP;
metrics outage не разрешает invariant violation, а пропущенные behavioral events не replay из ledger.

## Контент и новости

Publication, revision, source policy, takedown и bookmark — доменные records, а не behavioral analytics. CMS и
reader flows работают без consent/provider; пропущенные поведенческие события не восстанавливаются из access logs,
article history или bookmarks. Запрещены article/source/candidate/revision/user/bookmark IDs, title/body/excerpt,
slug/URL, search query, category/tag с малой выборкой, author/publisher, rights evidence, recipient/contact, точное
время и device/advertising identifiers.

| Событие                        | Условие после факта                                     | Разрешённые свойства                                                             | Дедупликация                    |
| ------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| `content_feed_viewed`          | Клиент показал первую успешную страницу или empty state | `locale`, `surface`: web/tma; `resultBucket`; `filterKind`: none/category/tag    | View session у producer         |
| `content_article_viewed`       | Публичная article projection стала видима               | `locale`; `originKind`: original/derived; `ageBucket`; без category/tag identity | Article view session у producer |
| `content_search_completed`     | Клиент показал первую страницу результата               | `locale`; `resultBucket`; `queryLengthBucket`; без query/token/result identity   | Search session у producer       |
| `content_bookmark_changed`     | Backend committed add/remove при consent actor          | `action`: add/remove; `originKind`; без article/bookmark ID                      | Bookmark operation ID           |
| `content_share_intent_created` | Клиент вызвал share/copy для public canonical           | `method`: native/copy/tma; `surface`; без URL, article и recipient               | Share interaction у producer    |

Feed→article rate использует только согласованные view sessions; auto-prefetch, crawler, preview, editor, retry и
offline cache refresh исключаются. Search success показывает распределение result buckets и последующий article
view в рамках ephemeral client session, не сохраняя query или выбранную article identity. Bookmark/share —
намерения, а не доказательство прочтения или отправки. Метрики режутся только по locale, surface, origin kind,
крупному age/result bucket и rollout arm; малые когорты подавляются.

Продуктовые показатели сопоставляют публикационный cadence и reader usefulness с guardrails: takedown/correction,
источник без актуального review, missing attribution, external-full-text violation, preview/draft leak и cache/search
leak имеют target zero. Рост просмотров, поиска, bookmarks или shares не оправдывает копирование, clickbait,
автопубликацию или расширение трекинга.

Editorial operational metrics не требуют behavioral consent: candidate outcome/age, adapter success/status class,
retry/backoff, duplicate key class, rights hold, source review expiry, draft→review→publish latency buckets,
self-review count, scheduler duplicate suppression, correction/takedown reason class, cache/search invalidation lag и
audit failure. Labels не содержат source/article/staff IDs, endpoint, body/excerpt/title, evidence, exact time или
free-text reason. Dashboard не ранжирует редакторов и не восстанавливает историю их работы; audit остаётся
отдельным security record. Fetch/analytics outage не может автоматически опубликовать либо сохранить запрещённый
контент.

## Реклама

Campaign delivery, budget, frequency и fraud decisions — доменные/операционные records и работают независимо от
behavioral analytics consent. Consented события не содержат campaign/creative/advertiser/placement/user/session/
device/ad/object IDs, URL/query, profile/activity history, exact time/place, IP, coordinates, cap subject, creative
content, spend или fraud evidence. Разрешены только surface/client/locale, coarse geo/form-factor, context/priority
class и крупные count/time/result buckets; малые когорты подавляются.

| Событие                        | Условие                                              | Разрешённые свойства                                                       | Дедупликация               |
| ------------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------- |
| `ad_slot_resolved`             | Client применил direct/fallback/house/no-ad decision | `surface`, `client`, `sourceClass`, `resultBucket`, `contextClass`         | Placement resolve session  |
| `ad_viewable_presented`        | Viewability fact принят при consent actor            | `surface`, `sourceClass`, `formatClass`, `coarseGeo`, `frequencyBucket`    | Delivery fact marker       |
| `ad_click_intent_accepted`     | Trusted click fact принят при consent actor          | `surface`, `sourceClass`, `formatClass`, `destinationClass`                | Delivery click marker      |
| `ad_external_fallback_outcome` | Проверенный adapter вернул terminal outcome          | `surface`, `outcomeClass`, `latencyBucket`; без provider/campaign identity | Provider request operation |

Revenue, served/viewable/click/spend и invalid traffic отчёт строится из restricted authoritative facts, а не из
этих событий. Viewable означает ≥50% creative в foreground не менее 1 секунды; fetch/render/background/preview не
считаются. CTR использует valid click / viewable impression и показывается рядом с absolute suppressed counts,
invalid share и consent coverage; он не оптимизирует targeting или priority.

Rollout выполняется на read-only placements с заранее закреплённым placement-level holdout. Сравниваются зрелые
когорты и одинаковые периоды: published match → eligible join intent, intent → confirmed participant, match create,
score entry/confirmation, report completion и confirmed matches per active player. Performance/accessibility
guardrails: LCP, CLS, client error, no-fill/timeout, focus loss, screen-reader/keyboard failure и critical-state ad
leak. Privacy guardrails: forbidden targeting, provider without consent, exact geo, cap bypass и over-budget имеют
target zero. Статистически значимое ухудшение основной воронки либо любое privacy/safety нарушение требует pause;
доход, CTR и impressions вред не компенсируют. Недостаточная выборка означает inconclusive, не success.

Operational metrics не требуют behavioral consent: campaign state/age, approval latency/outcome, budget reserve/
finalize/release, pacing, cap/duplicate suppression, served/viewable/valid-invalid buckets, no-fill reason, provider
review expiry/latency/error, media/policy reject, audit failure, reporting lag и emergency pause. Labels не содержат
IDs, content, exact money/time/geo или actor. Dashboard не ранжирует staff и не восстанавливает user journey.

## Mobile transport parity

Общий `ClientChannel` допускает `mobile`; taxonomy Match MVP не расширена. Native отправляет только уже
утверждённые client-owned события после analytics consent. Magic/verifier/refresh, installation/push token,
notification/deep-link target, URL/query, точная location и cache identity не являются аналитическими полями.

Push permission/registration/provider outcome, session refresh/reuse, lifecycle/reconnect и cache purge — только
агрегированные operational counters по OS/app-version/reason class без user/installation/session/object IDs.
Delivery/open не означает read или доменный success; confirmed match по-прежнему считается только immutable
server marker. Подробная граница — в [mobile contract/data policy](mobile-parity-contract-data.md).
