# Базовые требования безопасности, конфиденциальности и права

Этот документ задаёт обязательный baseline. Он не является заключением о соответствии закону: публичный запуск
блокируется до юридической и security-проверки обработки данных и каждого внешнего провайдера.

## Классификация и минимизация данных

- `secret`: session credentials, Telegram init data, magic links, ключи подписи и credentials провайдеров. Они не
  сохраняются в открытом виде, не покидают предназначенный канал и никогда не попадают в логи, трассировки,
  аналитику, аудит или клиентские ошибки. URL запрещены, кроме строго ограниченного fragment magic-ссылки,
  описанного ниже.
- `restricted personal`: email, связи identity, IP-адрес, точные координаты и история перемещений, текст чата и
  жалоб, приватные профили. Доступ даётся только конкретному use case по least privilege; значения шифруются при
  передаче и в хранилище, а экспорт и удаление аудируются.
- `internal`: технические непрозрачные ID, агрегированные метрики и служебные состояния. Публичность не
  предполагается, доступ ограничен средой и ролью.
- `public`: только явно опубликованные поля профиля, матча, клуба, турнира, статьи или разрешённой площадки.
  Публичный статус поля задаёт продуктовый контракт, а не наличие API endpoint.

Новая функция до реализации перечисляет собираемые поля, цель, правовое основание, получателей, место хранения и
срок удаления. Если срок или основание не одобрены, сбор в production запрещён. Возраст и документы не собираются;
отсутствие age verification остаётся явным legal/safety risk. Частные домашние адреса площадками быть не могут.

## Размещение и жизненный цикл данных

- Основная production-база, Redis, object storage, backups, disaster-recovery copies, логи, трассировки, error
  reports, аналитика и support exports с персональными данными размещаются в России. Трансграничная передача
  запрещена до документированного правового основания и отдельного одобрения.
- `local` и `test` используют только синтетические данные; `staging` — синтетические либо необратимо обезличенные.
  Production snapshots нельзя копировать в эти среды. У каждой среды отдельные credentials и хранилища.
- Backups шифруются, доступ к ним отделён от доступа к основной базе, операции восстановления тестируются и
  аудируются. Выбор региона и сервиса подтверждается при выборе провайдера, а не предполагается этим документом.
- До production каждая категория получает утверждённый retention schedule и автоматическую проверяемую очистку,
  включая производные данные и backups. До утверждения расписания данные этой категории в production не
  собираются. Legal hold приостанавливает только адресное удаление и оставляет аудиторскую запись.
- Экспорт пользователя содержит только его разрешённые данные в машиночитаемом формате. Удаление отзывается из
  активных сессий, выполняется идемпотентно, распространяется на производные хранилища и не стирает обязательный
  минимальный audit/legal record без подтверждённого основания.

## Идентификация, доступ и секреты

- Telegram init data проверяется backend по официальному алгоритму и ограниченному сроку. Magic links одноразовы,
  короткоживущи и хранятся только как хеш. Refresh credentials хешируются, ротируются, обнаруживают повторное
  использование и могут быть отозваны семейством.
- RBAC платформы и scoped-роли клуба/турнира проверяются внутри application use case вместе с доступом к ресурсу.
  Скрытая кнопка, угаданный URL или один общий controller guard не считаются авторизацией.
- Привилегированные пользователи применяют отдельную усиленную аутентификацию до production. Повышение роли,
  массовый экспорт, destructive moderation и replay фонового события требуют re-authentication и аудита.
- Секреты не хранятся в Git, image, frontend bundle или общих `.env` файлах. Они выдаются минимальному workload,
  ротируются, имеют владельца и немедленно отзываются при подозрении на раскрытие.
- Интеграции Telegram, email, OSM/Overpass, карт, геокодинга, DUPR, новостей, рекламы, аналитики и object storage
  остаются выключенными в production до проверки официальных условий, лицензии, стоимости, data residency и
  минимально нужных разрешений. Заглушка не должна сообщать ложный успех.

## Структурированные логи и корреляция

Каждая запись — структурированный JSON с allowlist-полями: UTC timestamp, severity, service, environment,
version, event name, `request_id`, `correlation_id`, при наличии `trace_id`, безопасный route template, HTTP method,
status class, duration, error code и непрозрачные идентификаторы сущностей. Raw URL, query string, headers, cookies,
request/response body и queue payload по умолчанию не записываются.

- На входе API генерируется криптографически случайный `request_id`; корректный входящий correlation ID можно
  продолжить после ограничения длины и алфавита, иначе создаётся новый. `request_id` возвращается в ответе.
- `correlation_id` и `causation_id` переносятся в транзакцию, outbox, BullMQ metadata и исходящий вызов. Они не
  заменяют trace context и не содержат user data.
- Уровни: `debug` только для локальной диагностики без payload, `info` для жизненного цикла и агрегированного
  результата, `warn` для ожидаемого ухудшения, `error` для требующего реакции сбоя. Успешные health probes и
  ожидаемые ошибки валидации не создают шум на `error`.
- В production запрещено логировать Telegram init data, access/refresh credentials, magic links, cookies,
  authorization headers, email, текст чата/жалобы, точные координаты и историю перемещений, рекламные
  идентификаторы, provider secrets и произвольный пользовательский ввод.
- Исключения нормализуются: наружу и в лог идут класс, безопасный error code и stack только в защищённом server
  sink. Объекты ошибок, SDK provider responses и SQL parameters целиком не сериализуются.

Redaction применяется в HTTP logger, exception filter, tracing/error reporting, queue instrumentation и provider
adapters. Она рекурсивна, нечувствительна к регистру ключа, ограничивает глубину/размер и заменяет значение
маркером, не хешем. CI содержит негативные fixtures для всех запрещённых классов и падает, если canary secret
появился в captured log. Доступ к production-логам ролевой, выгрузки аудируются, срок хранения задаётся одобренным
retention schedule.

## Проверки работоспособности

- `/health/live` отвечает только о том, что процесс и event loop способны обслужить запрос. Он не обращается к
  внешним сервисам и используется для перезапуска зависшего процесса.
- `/health/ready` проверяет с коротким timeout обязательные для роли зависимости: API — PostgreSQL/PostGIS и Redis,
  worker — PostgreSQL/PostGIS, Redis/BullMQ и возможность безопасно принимать задания. Включённый обязательный
  adapter также участвует в readiness только если без него роль не может корректно обслуживать свой контракт.
- `/health/startup` остаётся отрицательным до валидации конфигурации, применения ожидаемой версии схемы и запуска
  внутренних consumers; он защищает медленный старт от преждевременного рестарта.
- Ответ не раскрывает DSN, hostnames, версии компонентов, stack traces и provider responses. Публично доступны
  общий статус и `request_id`; детали видны только авторизованной эксплуатации и в метриках.
- Readiness не изменяет данные и не отправляет внешние сообщения. После SIGTERM процесс снимает readiness,
  перестаёт принимать новую работу, завершает запросы/leases в ограниченный grace period и только затем выходит.

## Ограничение частоты и злоупотреблений

- Rate limiting применяется на perimeter и в backend. Backend использует атомарный распределённый счётчик с
  отдельными бюджетами по нормализованному IP/network, аутентифицированному субъекту, session и ресурсу; raw ключи
  не попадают в логи и analytics.
- Для login, Telegram verification, magic-link request/consume, refresh, WebSocket connect, поиска, мутаций, чата,
  жалоб и административных операций задаются разные ненулевые лимиты и burst. Точные значения и измеримое
  обоснование добавляет owning feature до открытия endpoint.
- Превышение возвращает `429` со стабильным error code и `Retry-After`, не подтверждает выполнение мутации и
  учитывается безопасной метрикой. Распределённый лимит тестируется на конкуренцию и TTL.
- При недоступном Redis чувствительные authentication/admin endpoints закрываются безопасной временной ошибкой.
  Для низкорискового публичного чтения допустим малый локальный аварийный лимит и сигнал деградации; бесконечный
  fail-open запрещён.
- Лимит дополняет, но не заменяет idempotency, authorization, размер payload, timeout, блокировку пользователя,
  abuse detection и квоты внешнего провайдера.

## Аудит

Audit trail — append-only запись, создаваемая атомарно с критическим изменением либо через тот же надёжный outbox.
Она содержит UTC time, непрозрачный actor ID и actor type, действие, target type/ID, безопасное summary изменённых
полей без секретных значений, результат, reason code, `request_id`, `correlation_id` и источник операции.

Обязательно аудируются вход и неуспешная попытка привилегированного доступа, изменение ролей/consent, связывание и
разрыв identity, отзыв сессий, экспорт/удаление данных, moderation actions, просмотр restricted data сотрудником,
изменение конфигурации, применение миграции, replay/quarantine outbox и изменение retention policy. Текст чата,
жалобы, email, credentials и полные значения до/после в audit не копируются.

Application role не может обновлять или удалять audit rows. Доступ к чтению отделён от операционной роли,
фильтруется и сам аудируется. Целостность, резервное копирование, экспорт и retention проверяются до production;
неудачная запись обязательного audit event не должна превращать критическую операцию в неаудированную успешную.

## Правовые и продуктовые ограничения

- OSM требует атрибуции и соблюдения ODbL. Кэширование или сохранение данных иного геокодера разрешено только
  актуальными официальными условиями выбранного поставщика.
- DUPR автоматически не собирается и не выдаётся за подтверждённый без официального доступа. Внешние статьи не
  автопубликуются; используются только одобренные источники с авторством и ссылкой.
- Реклама требует маркировки, ограничения частоты и legal review; чувствительное профилирование и точная история
  перемещений для таргетинга запрещены.
- Встроенные платежи, бронирование кортов, age verification, произвольный JavaScript, файлы/голос в чате и иные
  исключения из [обзора проекта](../00-project-overview.md) не добавляются инфраструктурным решением.

## Политика площадок и геоданных

Публичный точный адрес и координата допустимы только для прошедшего модерацию общедоступного спортивного объекта.
До одобрения адрес/точка кандидата являются `restricted personal`: их видят авторизованные участники исходного
матча и модераторы по конкретному use case, но не общий каталог, поисковый индекс, аналитика или публичный cache.
Жалоба `PRIVATE_RESIDENCE` немедленно снимает публичную проекцию и инвалидирует caches до review. Исторический
матч после quarantine не раскрывает скрытый адрес через snapshot или merge alias.

Точная search origin, геолокация устройства, raw текстовый запрос и bounding box могут описывать намерение или
перемещение пользователя. Они обрабатываются в памяти на время запроса, не сохраняются в PostgreSQL, Redis key,
логах, трассировках, error reporting или аналитике и не связываются в историю. Клиент запрашивает геолокацию только
после явного действия и сохраняет работоспособный ручной поиск при отказе. Provider adapter получает минимальную
точность и набор полей; передача provider учитывается в privacy notice и разрешается только после legal/data
residency review. IP и provider request metadata не маскируются обещанием отсутствия внешней передачи.

### Разрешение источников и атрибуция

Фактический статус capabilities и checklist доказательств ведутся в
[`venue-provider-register.md`](venue-provider-register.md). Запись в этом реестре не заменяет приложенное
доказательство и явное approval.

- Для каждого OSM/Overpass, tile и geocoding adapter ведётся versioned registry: официальные условия и дата
  проверки, лицензия, регион/endpoint, получатели и residency, допустимые purpose/fields, показ, кеширование,
  долговременное хранение, refresh/deletion, rate/usage policy и обязательная атрибуция. Production capability
  включается только явной конфигурацией после legal/security approval; неизвестное значение закрывает функцию.
- ODbL и требования OpenStreetMap проверяются до seed. Import batch сохраняет stable element ID/version и
  достаточно provenance для атрибуции и исполнения удаления/refresh, но не сырой Overpass response без отдельной
  необходимости. Tile usage не предполагает право хранить геокодерные данные и наоборот.
- Внешняя подсказка transient по умолчанию. Сохранение выбранных полей разрешено только при machine-readable
  `storageAllowed` capability и записи source/policy version. Если условия изменились или источник удалён,
  refresh закрывает дальнейшее использование, ставит карточку на review и планирует очистку запрещённых полей;
  наличие старой копии не создаёт право продолжать показ.
- Публичная атрибуция формируется из активных source records на карте и карточке. Opaque contributor ID,
  moderator ID, внутренние evidence и provider credentials не публикуются. История provenance/merge доступна
  модератору и аудиту по least privilege.

### Минимизация, злоупотребления и retention

Кандидат содержит только название, публичный адрес, точку, locality и выбранные структурированные признаки.
Заявитель отдельно подтверждает, что это спортивный объект, а не дом; bulk submission, scraping API и частые
геокодерные запросы ограничиваются по user/IP без координат в rate-limit key. Исправления и жалобы используют
закрытые reason/field enums. Если поздний контракт разрешит свободный evidence text, он будет restricted,
ограниченным по размеру, исключённым из логов/аналитики и потребует отдельной moderation/retention policy.

Сроки ниже — предложения до юридического утверждения; production-сбор реальных данных закрыт без решения:

| Категория                                      | Цель и доступ                                                                                            | Предлагаемый срок                                                                                                               |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Transient query, origin и provider suggestions | Ответ на текущий поиск; память клиента/backend и минимальный одобренный provider                         | До завершения запроса/экрана; технический cache только если разрешён provider policy и не дольше 15 минут.                      |
| Match-only candidate и contributor link        | Проведение матча, последующая квалификация; участники матча и venues moderators                          | Неквалифицированный кандидат — 90 суток после финального состояния матча; qualified — до решения и 1 год для appeal/audit.      |
| Публичная venue и разрешённое происхождение    | Каталог общественных спортивных объектов; публичная проекция и PostgreSQL/PostGIS в РФ                   | Пока объект опубликован; после закрытия — hidden history для ссылок матчей, затем минимизация по утверждённому schedule.        |
| Revision, report и moderation evidence         | Исправление, privacy/quality review и защита от повторного злоупотребления; ограниченная роль модератора | Предложение: 1 год после решения; обязательный audit хранится отдельно по общему утверждённому сроку.                           |
| Source и merge history                         | Лицензия, attribution, разрешение хранения и стабильность ссылок; публичная часть минимальна             | Пока данные используются плюс срок, обязательный лицензией/спором; запрещённые source fields удаляются без удаления audit fact. |

Удаление аккаунта убирает contributor link там, где он больше не нужен, но не удаляет разрешённую публичную
площадку, происхождение источника или ссылки состоявшихся матчей; вклад обезличивается. Privacy quarantine,
обязательная атрибуция, source-policy violation, очередь stale review, доля внешних результатов без provenance и
ошибки cache invalidation имеют operational alerts. Заметки модератора, адрес кандидата и координаты не входят в
audit payload: аудит хранит target ID, действие, outcome и безопасный reason code.

## Политика матчей

Основание — [требования матчей](product-requirements.md). Публичны только опубликованные поля карточки и публичные
проекции участников. Join requests, FIFO-позиции, withdrawn/rejected причины, match-only candidate, raw booking
note до публикации и внутренние версии результата — `restricted/internal` по конкретному use case. Состав
показывает только необходимые публичные профильные поля; email, Telegram identity и контакты не раскрываются.

Token `UNLISTED` — capability secret не менее 128 бит. Сервер хранит keyed hash и версию, сравнивает безопасно,
ротирует с немедленным отзывом и не включает raw token/URL в log, analytics, audit, outbox, error report, sitemap,
push/email preview или cache key общего доступа. Страница не загружает сторонние ресурсы с capability URL и задаёт
`Referrer-Policy: no-referrer`. Ответ по отсутствующему/отозванному/чужому token одинаков; ссылка разрешает только
просмотр и не заменяет аутентификацию/авторизацию мутаций.

Описание, guest label и booking note — недоверенный plain text: Unicode normalize, ограничение длины, запрет
control characters/HTML/ссылок для гостя и output escaping. Booking note не принимает цену, payment/booking
credential или payment link и явно маркируется как непроверенное внешнее бронирование. Эти поля, счёт, очередь,
причина отказа/спора и точная search origin не попадают в analytics/log/audit summary. Точное место публично лишь
пока разрешает venues privacy state; quarantine закрывает адрес в карточках и caches.

Стартовые rate limits одновременно применяются по authenticated user, match и IP/network: публичный поиск
60/минуту на IP; detail/invite 120/минуту на IP и 60/минуту на пользователя; create/publish/edit/cancel/start/result
20/минуту на пользователя и 60/минуту на IP; join/request/withdraw/leave 30/минуту на пользователя, 60/минуту на
match и 120/минуту на IP; organizer decisions/promotion 30/минуту на organizer + match; confirm/dispute 10/час на
user + match. Это типизированная стартовая policy, не результат нагрузочного теста. Недоступность distributed
limiter закрывает мутации 503; публичное чтение допускает только ограниченный local fallback с метрикой.

Предлагаемый для legal review retention: неактивный draft — 30 суток; rejected/withdrawn/expired requests и
waitlist — 90 суток после терминала, затем агрегирование/удаление actor link; cancelled/voided match — один год;
confirmed match и минимальный состав/result outcome — пока нужен истории/статистике пользователя и не более трёх
лет после удаления последнего связанного аккаунта без отдельного основания; raw result versions и dispute
evidence — один год после решения; invite hashes — до terminal match плюс 24 часа; idempotency responses — 24
часа; consented raw analytics — 90 суток. Guest label/booking note удаляются или обезличиваются при terminal
retention и не становятся бессрочным audit. Production сбор закрыт до утверждения основания и очистки/backups.

Audit атомарно фиксирует publish/cancel/start, organizer decisions, late leave, invite rotation, result proposal,
confirm/dispute и moderator resolution только с opaque actor/target ID, enum действия и outcome. Клиентские
мутации не показывают optimistic success. Security tests обязаны использовать canary token/text и гонки capacity,
FIFO, idempotency и confirmation, доказывая отсутствие утечки и единственность эффекта.

## Политика профиля и статистики

Основание — [требования профиля](product-requirements.md). Публичность — явное состояние проекции, а не разрешение
читать строку profile storage целиком. `PUBLIC` раскрывает только имя, населённый пункт, форматы, помеченную
самооценку, несинхронизируемую DUPR-ссылку и разрешённую подтверждённую статистику. `PRIVATE` оставляет владельцу
все данные, а другим — минимальное имя и при необходимости самооценку только внутри уже доступного им общего
матча. Email, Telegram subject, timezone, consents, access history, заявки, очередь, точные перемещения, report и
moderation evidence никогда не входят в публичную проекцию.

Изменение visibility и запрос удаления после commit немедленно инвалидируют CDN/application/browser caches и
поисковую проекцию. Profile/statistics responses задают подходящий private/no-store cache для owner и
viewer-dependent блокировки; общий public cache допустим только для действительно `PUBLIC` ответа без capability
URL и после проверки невозможности подмешать owner fields. Cache key не содержит имя, DUPR URL или block side.
Закрытый, blocked, отсутствующий и удаляемый профиль дают неразличимый direct response; rate/timing не должны
становиться oracle. Минимальная match projection авторизуется отдельно и не открывает standalone profile.

Блокировка скрывает direct-профили в обе стороны для вошедших пользователей, но не обещает удалить уже
опубликованные данные из знания получателя и не может отличить того же человека среди анонимных посетителей
`PUBLIC` URL. UI до блокировки честно объясняет: конфиденциальность обеспечивает `PRIVATE`; block управляет
взаимодействием авторизованных аккаунтов. Из общего матча не исчезают обязательные системные факты, иначе состав
и история стали бы противоречивыми. Ответ и analytics не раскрывают, кто инициировал block.

DUPR — недоверенная пользовательская HTTPS-ссылка, не credential и не verified claim. До документированной
allowlist/capability/legal проверки внешний переход выключен. Запрещены server-side fetch/scraping, preview,
автоматический import, tracking redirect, query/fragment, referrer и выдача значения внешней страницы за
проверенный рейтинг. Клиент использует новый browsing context и `noopener noreferrer`; CSP и allowlist не дают
ссылке открыть произвольную схему или домен. Raw URL/ID не попадает в log, analytics, audit, outbox или cache key.

Avatar upload использует только server-generated private key
`profiles/{userId}/avatars/{assetId}/original`. Пятиминутная подписанная политика разрешает один `PUT`, связывает
точный media type, длину не более 5 MiB и SHA-256; wildcard prefix/list/delete и клиентский object key запрещены.
Подписанный URL не хранится и не логируется. Исходник не выдаётся публично: asset становится активным только после
проверки фактической длины/hash, безопасного decode/re-encode, удаления metadata и malware/content policy check;
неполные и отклонённые объекты очищаются bounded retention job.

История другого игрока минимизируется до подтверждённых `PUBLIC` матчей и разрешённых venue/result projections.
`UNLISTED`, cancelled, voided, disputed/proposed версии, invite token, точный private venue, booking note,
reports/no-show evidence и состав закрытых профилей не выдаются. Канонические contributions и aggregates —
restricted данные продукта, даже если отдельные totals разрешены публичным профилем. Statistics job получает
только opaque source/revision references и дочитывает источник с least privilege; raw score или профиль не
копируется в generic outbox/BullMQ.
`profile.events.v1` дополнительно запрещает locality, level, avatar key, block direction, report/evidence и totals;
rebuild lifecycle содержит только generation, snapshot revision и закрытый outcome.

Публичная attendance/reliability появляется только после не менее пяти окончательных commitments и содержит
только aggregate. Pending/rejected/withdrawn report не влияет ни на UI, ни на projection; подтверждённая неявка
не раскрывает reporter, evidence, match или причину. Доступ к исходным trust decisions — отдельный auditable use
case. Rebuild создаёт shadow generation с теми же row-level правами, шифрованием и retention; незавершённое
поколение недоступно API и очищается bounded job. Operational metrics не имеют user/match labels.

Предлагаемый до legal review retention: профиль и активные настройки — до удаления аккаунта; публичность
снимается сразу, online-поля очищаются до 30 суток; подтверждённые contributions/history — пока нужны доступной
пользователю истории и не более трёх лет после удаления последнего связанного аккаунта без иного основания;
rebuild generations после переключения — 7 суток, failed generation — 24 часа; consumer receipts — максимум
90 суток либо дольше документированного replay window; consented raw analytics — 90 суток. Aggregate не служит
обходом удаления: после очистки источника он пересчитывается/анонимизируется, а backup restore сначала применяет
реестр удалений. Production закрыт до legal review основания, РФ-размещения, сроков и удаления из caches/backups.

Rate limits применяются к owner read/update, public profile/history/statistics и DUPR redirect отдельно по
authenticated user и IP/network; enumeration-safe direct reads имеют единый бюджет и ответ. Конкретные значения
задаёт контрактный этап после abuse/load review. Audit атомарно фиксирует изменение visibility, DUPR и удаление,
но не хранит old/new URL, имя, уровень или totals. Последующие тесты используют canary profile/URL/score/evidence
и доказывают redaction, cache invalidation, block symmetry, отсутствие enumeration и невозможность переключить
неполный rebuild.

## Политика чата и уведомлений

Основание — [требования коммуникации](product-requirements.md). Текст, revisions, evidence жалобы, блокировки,
позиция чтения и связь recipient–channel относятся к `restricted personal`. Системный type, transport outcome и
агрегированные счётчики — `internal`, пока не позволяют восстановить социальный граф. Публичных чатов нет;
capability матча не является credential чата.

### Минимизация и доступ

- Сообщение хранится только в PostgreSQL communications в РФ и передаётся авторизованным участникам через REST/
  WebSocket. Оно запрещено в application/access logs, traces, error reports, audit, analytics, metrics labels,
  generic outbox, BullMQ job data, push preview, email subject/body и Telegram notification. Уведомление содержит
  только закрытый template type, безопасный route и факт нового сообщения.
- Системная запись не копирует booking note, описание матча, score, dispute/report reason, адрес/координаты,
  participant names или invite token. UI разрешает display-поля отдельным авторизованным read-port, когда это
  действительно нужно, и экранирует их как недоверенные.
- Авторизация проверяет session, onboarding, block/access state и membership boundary на каждом use case и resume.
  Выход немедленно отзывает stream; 30-дневный former-member read разрешает только прежнюю sequence. Admin/service
  role не получает массовый поиск текста; moderation читает только evidence конкретной назначенной жалобы, а
  доступ и экспорт аудируются без самого текста.
- Текст шифруется at rest на уровне storage/backup; evidence дополнительно шифруется отдельным ротируемым ключом.
  Transport — только TLS. Ключи не находятся в БД/репозитории, rotation и уничтожение входят в production runbook.

Внешний notification adapter получает recipient address/Telegram subject только в памяти на границе отправки,
локализованный allowlisted шаблон без текста чата и стабильный provider idempotency key. Contact не сохраняется в
outbox/job/delivery record. Tracking pixels, click/open tracking, link rewriting и рекламное профилирование
отключены. Provider acceptance/delivery receipt не считается прочтением. Webhook проверяет подпись, timestamp,
replay marker и allowlist outcome, не принимает произвольный текст; неизвестное событие quarantined.

Стартовые одновременные rate limits: snapshot/history 120/минуту на user + chat и 240/минуту на IP; send 30/минуту,
300/сутки на user + chat и 1 000/сутки на chat; edit/delete/read marker 60/минуту на user + chat; report 5/сутки на
user и 20/сутки на chat; block/unblock и preferences 20/час на user; WebSocket connect/resume 20/5 минут на user и
60/5 минут на IP. Размер сообщения — 2 000 символов, страницы — максимум 50, connection queue и catch-up gap
ограничены контрактом. Недоступность distributed limiter закрывает send/edit/delete/report/preferences 503;
read-only история может использовать bounded local fallback без текста в key/metric. Значения требуют
нагрузочной и abuse-проверки до production.

Предлагаемый для legal review retention: chat/revisions/read positions — 180 суток после terminal матча; доступ
former participant — 30 суток; notifications — 90 суток; transport metadata/provider IDs — 30 суток; preference
до удаления аккаунта; report evidence — один год после решения. Raw queued delivery payload живёт только до
terminal attempt, максимум 7 суток; chat text в нём запрещён. Tombstone очищается с сообщением. Legal hold имеет
case ID, scope, owner и review date и сохраняет только конкретное evidence; он не продлевает весь чат. После
удаления аккаунта автор отображается обезличенно, активные deliveries подавляются, contact link удаляется, а
обязательное evidence сохраняется только до своего срока. Backups 35 суток и при restore сначала применяют
deletion/suppression ledger. Реальные данные и провайдеры запрещены до утверждения основания, residency,
трансграничной передачи и проверяемых cleanup jobs.

Audit хранит только opaque actor/target, действие `SEND`/`EDIT`/`DELETE`/`REPORT`/`BLOCK`/`PREFERENCE_CHANGE`,
outcome и reason enum; текст, длина, адрес, participant list и before/after отсутствуют. Operational alerts:
authorization denial spikes, rate-limit suppression, cursor gaps/resync, queue overflow, provider retry/quarantine,
invalid webhook/replay, retention lag и появление canary text/contact/token в запрещённом sink. Негативные тесты
проверяют HTTP/WS logs, traces, error SDK, audit, analytics, outbox, BullMQ, provider template и dead-letter data.

Основной и резервный провайдер каждого канала проходят отдельный реестр: договор/terms, РФ-residency и subprocessors,
purpose/fields, encryption, credential rotation, idempotency, rate/bounce/suppression feedback, incident process,
retention/deletion и выключение tracking. Failover разрешён только при одинаковом allowlist payload и том же
логическом delivery ID; без одобрения конфигурация fail-closed. Email и Telegram не подменяют друг друга, а их
недоступность не откатывает match/chat/in-app транзакцию и не маскируется сообщением об успешной доставке.

## Политика доверия и безопасности

Reports, review text/responses, evidence, assignment и moderation notes относятся к `restricted personal`;
safety-сведения о здоровье, угрозе или дискриминации могут стать специальной категорией после legal review и
обрабатываются по более строгому режиму. Rating, broad category, timestamps и opaque references являются
`internal`, пока не соединены с человеком; соединённый набор restricted. Публичны только агрегат отзывов после
пороговой проверки и безопасный outcome собственного обращения. Неподтверждённый report никогда не является
публичным фактом.

### Сбор, шифрование и доступ

- Сначала собираются allowlisted category/source revision; plain text появляется только там, где структурированного
  ответа недостаточно. Report text ограничен 2 000, review text — 500 символами. Вложения, URL ingestion,
  документы, изображения, аудио и точная текущая геопозиция запрещены.
- Existing content evidence создаётся сервером как immutable snapshot точной revision. Evidence и responses
  хранятся в PostgreSQL trust/safety в РФ как authenticated ciphertext с отдельным key version/AAD; searchable
  metadata не содержит текст, contact или координаты. Ключи разделены по среде и workload и ротируются.
- Игровой API читает только собственную receipt projection. Moderator repository требует активную роль,
  assignment к case и отсутствие conflict marker на каждом запросе. Reviewer апелляции отличается от автора
  решения. Ни superadmin, ни support не получают bulk evidence read неявно.
- Break-glass требует incident ID, case scope, владельца, причины и expiry; каждое чтение аудируется и вызывает
  review. Массовый поиск текста, выгрузка в локальные файлы, использование evidence для обучения/аналитики и
  production snapshots в non-production запрещены.
- Target notification, provider message, frontend telemetry и error SDK получают только receipt/status/outcome
  class и локальный route. Reporter, текст, evidence, число сигналов, moderator identity и sanction detail не
  покидают in-app restricted boundary. Внешний safety-канал запрещён до проверки residency, terms, tracking,
  retention, escalation hours и удаления.

При подозрении на непосредственную угрозу до формы показывается 112 для России либо совет обратиться в местную
экстренную службу. Это только предупреждение: событие не означает triage, связь с оператором или вызов службы.
PickleHub не определяет местоположение и не пересылает сведения полиции автоматически. Конкретный текст, номер по
рынку и обязательства ответа требуют legal/operations approval; production нельзя запускать с фиктивным контактом
или заявлением о 24/7.

### Злоупотребления, решения и блокировки

Стартовые лимиты: create report/no-show — 5/сутки на пользователя и 20/сутки на subject-context; review revisions —
10/сутки и один effective review на author + subject + match; block/unblock — 20/час; status list/read — 60/минуту;
response/appeal — 10/сутки; moderator queue/read — 120/минуту, decision/export/break-glass — отдельные низкие
лимиты с re-authentication. Keys используют opaque IDs/keyed network prefix, не текст. Недоступность distributed
limiter закрывает create/block/response/appeal/moderator mutation 503; собственный read-only receipt list может
использовать bounded fallback. Значения требуют abuse/load review.

Idempotency и уникальные subject constraints дополняют rate limit. Несколько reports не создают автоматическую
вину, приоритет или санкцию. Разрешённые автоматические меры ограничены rate limiting, spam/privacy quarantine и
собственной блокировкой; human-impacting решение требует versioned approved policy, assignment и audit. Temporary
restriction максимум на 72 часа без нового human review, имеет expiry job и alert. Decision effect и reversal
идемпотентны и применяются owning-модулем; очередь не содержит evidence. Failure/retry сохраняет один effect ID и
не изображается завершённым решением.

Direct block deny проверяется в обе стороны перед profile/search/invite/join/request/waitlist/promotion и будущим
direct channel. Cache положительного разрешения не является авторитетным; при недоступности block port новая
чувствительная связь закрывается. Target не уведомляется о block, а ответ не раскрывает сторону. Общий существующий
матч и системные факты сохраняются в минимальной проекции. Unblock не восстанавливает заявки, promotion, удалённый
контент или чужой block.

### Аудит, удаление и retention

Audit содержит opaque receipt/case/decision/policy revision, actor/subject, действие, access basis, outcome и
timestamp; rating, text, evidence, contact, IP, coordinates, moderator display name, notification body и
before/after отсутствуют. Аудируются create/link/assign/read restricted evidence/response/decision/effect/reversal,
notification deferral, appeal, export, break-glass, legal hold и cleanup. Доступ к audit отделён от moderator
evidence role; поиск/экспорт audit сам аудируется.

Предлагаемые до legal review сроки:

| Категория                                       | Получатель/хранилище                                        | Предлагаемый срок                                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Receipt и структурированный signal metadata     | Trust/safety PostgreSQL в РФ; игрок — только своя проекция  | До 1 года после окончательного решения; без case — 90 суток после закрытия                                |
| Report text, responses и immutable evidence     | Encrypted restricted records в РФ; назначенные reviewers    | До 1 года после окончательного решения или апелляции; затем криптоудаление и проверяемая очистка          |
| Review revisions и текст                        | Encrypted trust/safety records; автор/назначенный reviewer  | Текст 180 суток после effective/withdrawn review; минимальная eligible revision до 3 лет для пересчёта    |
| Moderation case/decision/effect/appeal metadata | Restricted case store; owning module получает только effect | 3 года после окончательного закрытия; subject link удаляется раньше, если он не нужен для safety/legal    |
| Block preference                                | Communications PostgreSQL в РФ; только владелец и deny port | До unblock или удаления владельца; revoked metadata 30 суток для replay/audit                             |
| Public review aggregate/contributions           | Profiles projection в РФ                                    | Пока нужен профилю; скрыть сразу при privacy/deletion, максимум 3 года после удаления связанных аккаунтов |
| Trust/safety audit                              | Изолированное append-only хранилище в РФ                    | Предложение 3 года после закрытия case; partition cleanup, не бессрочно                                   |
| Operational metrics/behavioral analytics        | Агрегаты в РФ/одобренный provider                           | Raw operational 90 суток; consented analytics 90 суток; анонимные пороговые агрегаты до 1 года            |

Удаление аккаунта сразу скрывает профиль/reputation, отзывает block-owned direct links и удаляет contact mapping.
Active case не удаляется каскадно: identity заменяется case-local pseudonym, а минимальное evidence живёт только до
своего срока. Адресный legal hold указывает case, конкретные records, основание, owner, expiry/review date; он не
продлевает все отзывы, чат или аккаунт. Withdrawal не является удалением. Cleanup охватывает primary/read models,
search/cache, queues/DLQ, exports и encryption keys; backups истекают за 35 суток, а restore сначала применяет
deletion/suppression ledger. Late retry не должен оживлять очищенный payload.

Operational alerts без пользовательских labels: restricted read denial, assignment conflict, duplicate effect,
expired temporary restriction, queue/appeal age bucket, deferred target notice, key/decryption failure, cleanup
lag и canary text/contact/coordinate/rating в logs, traces, error reports, audit, analytics, outbox, BullMQ или DLQ.
Реальные safety-данные запрещены до утверждения правового основания, privacy notice, сроков, РФ-размещения,
процесса доступа, staffing/escalation и проверяемых delete/recovery jobs.

## Политика identity и онбординга

Основание — [обзор identity](../02-identity-onboarding/00-overview.md) и
[детальные требования](product-requirements.md). Значения ниже — проектные требования MVP для контрактного этапа,
а не подтверждение production-согласования. Возраст и документы не собираются; риск отсутствия age verification
остаётся открытым. Проверки перечислены как обязательные будущие тесты, не как уже исполненные проверки.

### Доказательства, доставка ссылок и браузер

- Telegram проверяется backend по официальному алгоритму, с constant-time сравнением подписи, правильным bot
  context, строгим parsing и отклонением повторных ключей. Возраст доказательства ограничен 5 минутами, clock skew
  в будущее — 30 секундами. Отпечаток одноразового доказательства погашается атомарно с эффектом и остаётся до
  конца окна возможной валидности; сырой payload не сохраняется. Неподписанный `initDataUnsafe` не является входом.
- Magic-секрет и refresh имеют не менее 256 случайных бит и хранятся только как криптографические хеши.
  Назначение и TTL нельзя изменить клиентским параметром. Magic TTL — 10 минут; access TTL — 5 минут; refresh
  inactivity TTL — 7 суток, absolute family TTL — 30 суток. Ротация и replay detection сериализуются в БД.
  Доказательства связывания действуют 5 минут внутри одноразовой попытки на 10 минут.
- Письмо доставляет magic-секрет исключительно во fragment HTTPS URL фиксированной доверенной landing page,
  без email в URL. Это единственное исключение из запрета credentials в URL: fragment не передаётся HTTP-серверу.
  Страница немедленно убирает fragment через `history.replaceState`, хранит секрет только в памяти до явного
  подтверждения и отправляет его POST body. GET, preview и mail scanner не выполняют погашение.
- Landing page не содержит внешних ресурсов, рекламы, аналитики, error SDK или service worker interception;
  применяет CSP, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`. Redirect разрешён только на заранее
  разрешённый локальный маршрут без query/fragment. Провайдер почты должен отключать click tracking и переписывание
  magic URL; неподдерживающий это провайдер не допускается. Секрет неизбежно доступен почтовому каналу — это
  явно учитывается при проверке провайдера и текста уведомления пользователя.
- Отправка email получает секрет в памяти; raw secret не записывается в outbox, очередь или idempotency body.
  Сбой отправки не откатывает уже погашенную identity и не выдаётся за доставку: новый запрос создаёт новый
  секрет. Способ надёжной отправки без сохранения raw secret обязан определить контрактный/backend этап.
- Refresh cookie — host-only, `Secure`, `HttpOnly`, `SameSite=Lax`, с минимальной областью пути; access никогда не
  попадает в local/session storage, IndexedDB или cookie. Web и TMA публикуют API через свой same-origin proxy,
  чтобы не зависеть от third-party cookies в Telegram WebView. Если cookie недоступна, показывается ошибка с
  предложением открыть поддерживаемый браузер; fallback в URL/localStorage запрещён.
- Изменяющие auth/session запросы защищены точным allowlist origin и CSRF-токеном, включая anonymous login и
  magic consume; pre-auth контекст не становится authenticated session. CORS не использует wildcard вместе с
  credentials. Ответы auth, me, drafts, consent и identity имеют `no-store`; персональные данные не кеширует PWA.
- Связывание требует двух свежих доказательств, отвязывание — оставшейся identity, удаление — текущей identity.
  Proof привязан к субъекту, операции, попытке и сессии; его погашение, uniqueness и аудит входят в транзакцию.
  Generic idempotency не воспроизводит token exchange. Успех чувствительного изменения отзывает старый доступ.
- Уникальность provider subject и нормализованного email обеспечивается ограничениями БД, а минимум одного
  способа входа — сериализацией изменений пользователя в транзакции. Ни предварительный SELECT, ни Redis lock
  отдельно не защищают эти инварианты. Проверяется race с удалением, завершением онбординга и logout-all.

### Защита от enumeration и лимиты

Для любого синтаксически допустимого email запрос возвращает одинаковые 202, тело и набор заголовков независимо
от существования аккаунта, статуса удаления, адресного лимита и результата доставки. Проверка регистрации не
влияет на синхронный ответ: доставка выполняется после универсального подтверждения принятия запроса, которое
не обещает доставку. Глобальная недоступность обязательной инфраструктуры даёт общий 503 до lookup.
Ошибка связывания также не различает занятую identity; публичного endpoint проверки регистрации нет.

Стартовые лимиты — атомарные rolling windows, все указанные окна действуют одновременно. Burst равен лимиту
короткого окна, дополнительного запаса нет. IP определяется только через доверенный proxy; IPv6 агрегируется
по /64. Ключ email — keyed hash нормализованного адреса, ключ Telegram — keyed hash проверенного subject;
сырые значения и хеши в логи/аналитику не попадают. Redis TTL равен соответствующему окну.

| Операция                                                        | Бюджеты                                                               | Поведение                                                                                                      |
| --------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Запрос magic-ссылки                                             | 10/10 минут и 30/час на IP; 1/60 секунд и 5/час на адрес и назначение | IP-limit даёт 429; адресный limit молча подавляет отправку и сохраняет тот же 202 без адресного `Retry-After`. |
| Погашение magic-ссылки                                          | 10/5 минут и 30/час на IP                                             | 429 до поиска секрета; все причины невалидности имеют общий 401.                                               |
| Telegram exchange/proof                                         | 20/5 минут на IP; 10/5 минут на проверенный subject                   | 429; subject limit проверяется только после подписи, до эффекта.                                               |
| Refresh                                                         | 30/5 минут на семейство; 120/5 минут на IP                            | 429 до ротации, replay при разрешённом запросе отзывает семейство.                                             |
| Связывание, отвязывание, re-auth proof attempts                 | Общий бюджет 5/час на пользователя и 20/час на IP                     | 429; email/Telegram proof дополнительно подчиняется своим лимитам.                                             |
| Выход и выход везде                                             | Общий бюджет 10/минуту на пользователя и 30/минуту на IP              | 429 без ложного сообщения об отзыве; обычный выход повторяем.                                                  |
| Сохранение/завершение черновика, изменение согласий             | Общий бюджет 30/минуту на пользователя и 120/минуту на IP             | 429, без частичного сохранения.                                                                                |
| История, текущий пользователь, черновик и список способов входа | Общий бюджет 60/минуту на пользователя и 240/минуту на IP             | 429; чтение только собственных данных.                                                                         |
| Запрос удаления                                                 | 3/час на пользователя и 10/час на IP                                  | 429; принятый запрос остаётся идемпотентным.                                                                   |

Эти консервативные бюджеты позволяют обычный вход, двойную проверку и ручное сохранение шагов, ограничивают
почтовый spam и guessing. Это стартовые параметры, а не результаты нагрузочного эксперимента; verification
проверяет конкурентное соблюдение окон, shared-IP сценарии и отсутствие обхода через разные replicas.
Изменения значений требуют измерений и security review. При недоступном Redis auth и чувствительные мутации
закрываются 503. `Retry-After` показывает остаток только публичного IP/session/user окна, не адресного бюджета.

### Реестр данных и сроки очистки

Все сроки в таблице — предлагаемый retention schedule для юридического утверждения перед production. До
утверждения оснований, сроков, получателей и механизмов очистки разрешены только синтетические данные.
Основные хранилища, производные данные и backups размещаются в РФ; external transfer требует отдельного решения.

| Категория                                       | Цель и предполагаемое основание для review                                                     | Получатели/хранилище                                                                                  | Предлагаемый срок                                                                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Email и Telegram subject, связи identity        | Вход и восстановление доступа; исполнение условий сервиса и утверждённое основание обработки   | Identity PostgreSQL в РФ, минимальный email/Telegram adapter; оператор провайдера только после review | До удаления аккаунта; очистка online-хранилищ в течение 30 суток после запроса.                                      |
| Поля черновика, timezone, предпочтения          | Первичная настройка и поиск; условия сервиса/отдельное согласие на обработку                   | Profiles PostgreSQL в РФ; черновик видит только владелец                                              | Неактивный незавершённый аккаунт удаляется через 90 суток после последнего входа; завершённый — до запроса удаления. |
| Публичные имя, населённый пункт, уровень и DUPR | Представление игрока; явное подтверждение публикации при завершении с legal review основания   | Профиль в РФ, другие игроки через публичную проекцию                                                  | Скрытие сразу при закрытии/удалении, online-очистка до 30 суток после удаления.                                      |
| История и статистические вклады/агрегаты        | Подтверждённая история игрока и воспроизводимый расчёт; основание и публичность требуют review | Profiles PostgreSQL в РФ; другим — только разрешённый aggregate/подтверждённая публичная история      | Пока нужны истории; не более 3 лет после удаления последнего связанного аккаунта, затем очистка/анонимизация.        |
| Хеши magic/proof, attempts и replay markers     | Предотвращение повторного входа; безопасность сервиса                                          | Identity PostgreSQL в РФ, без raw payload                                                             | Magic/attempt metadata до 24 часов после терминального состояния; Telegram marker до конца окна валидности.          |
| Refresh hashes и семейства                      | Управление доступом и replay detection; безопасность сервиса                                   | Identity PostgreSQL в РФ                                                                              | Ротированные хеши до абсолютного истечения семейства, затем очистка в течение 24 часов.                              |
| Ключи лимитов IP/email/subject                  | Защита от злоупотреблений; безопасность сервиса                                                | Redis в РФ, keyed hashes, не raw IP/email                                                             | TTL окна, максимум 1 час для этой функции.                                                                           |
| История обязательных документов и audit         | Доказательство принятия и безопасности; конкретное правовое основание утверждает юрист         | Изолированное хранилище в РФ с ограниченным чтением                                                   | Предложение: 3 года после закрытия аккаунта, только минимальная запись без контактов; не бессрочно.                  |
| Необязательные согласия и аналитика             | Измерение активации/разрешённые сообщения; отдельное согласие                                  | Согласия в РФ; analytics/provider только после review                                                 | Raw analytics 90 суток, история optional consent до 30 суток после удаления; анонимные агрегаты до 1 года.           |
| Логи и backups                                  | Диагностика/восстановление; одобренное основание эксплуатации                                  | Защищённые sinks и encrypted backups в РФ                                                             | Логи 30 суток, backups 35 суток; после restore сначала повторяется реестр удалений, потом открывается доступ.        |

Очистка online-данных и backup expiry — разные сроки; UI не обещает исчезновение из backups за 30 суток.
Адресный legal hold сохраняет только необходимые записи с отдельным основанием, владельцем и сроком пересмотра.
Задачи удаления повторяемы, имеют безопасный ID, контроль завершения по каждому хранилищу и сигнал просрочки.
Append-only audit не отменяет retention: очистку разделов выполняет отдельная привилегированная retention role,
а не application role. Продуктовые метрики не заменяют обязательный security audit и не служат обходом согласия.

### Обязательная последующая проверка

Backend/verification должны доказать AC-01–AC-17 из требований: в том числе unique constraints и rollback при
гонках, одноразовость proof/token, немедленный отзыв access, origin/CSRF, отсутствие enumeration через тело,
статус, заголовки и timing. Проверка времени выполняется управляемыми часами на границах TTL; для ответа на запрос
письма сравниваются пути и распределения задержек существующих/новых/подавленных адресов при одинаковых условиях.
Canary secrets проверяются в HTTP, audit, trace/error sinks, очередях, редиректах и analytics; отдельно проверяются
GET сканера, потеря ответа refresh, конкурентные вкладки и восстановление backups после удаления. Успешная
проверка документации не заменяет эти тесты или юридическое согласование провайдеров.
