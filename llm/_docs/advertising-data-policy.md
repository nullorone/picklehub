# Контракты и данные рекламы

Документ фиксирует решения этапа [`13-advertising/02-contract-data.md`](../13-advertising/02-contract-data.md). Он
не подтверждает правовое основание рекламного показа, договор, маркировку/ОРД/ЕРИР, разрешение рекламодателя,
готовность backend или выбор внешней сети. Provider fallback остаётся выключенным до отдельных legal, security,
privacy и commercial review.

## REST и границы доступа

TypeSpec `contracts/rest/advertising.tsp` — редактируемый REST source. Клиентская поверхность содержит три разные
операции:

- `POST /advertising/decisions` выбирает approved snapshot и возвращает `DIRECT`, `EXTERNAL_FALLBACK`, `HOUSE` или
  явный `NO_FILL`;
- `POST /advertising/impressions` принимает short-lived delivery token только после 50% непрерывной видимости в
  foreground в течение 1000 ms;
- `POST /advertising/clicks` принимает отдельный click token после trusted activation и возвращает idempotent
  receipt с точным approved HTTPS destination.

Все три операции требуют browser Origin/CSRF и UUIDv4 idempotency key даже для anonymous session. Token находится
в request body, помечен секретным и не должен попадать в URL или лог. Fetch/render не является impression;
повторный impression/click возвращает ту же квитанцию либо закрытый replay outcome, но не создаёт списание.
No-fill, cap, budget, timeout и выключенный provider не блокируют контент и не требуют внешнего запроса.

`/admin/advertising` имеет bearer, fixed `x-admin-capability`, `private, no-store` и browser integrity. `ADS_MANAGER`
управляет placement, campaign revision, creative, review/pause и читает только aggregate report. Approval требует
другого reviewer; SQL запрещает совпадение submitter/reviewer. `SUPERADMIN` получает только provider governance;
доступ к user, safety, CMS и raw delivery не появляется. Report принимает диапазон в body и подавляет cohort меньше
20; export и raw-trail endpoint отсутствуют.

## Контекст, placement и внешний fallback

`AdDecisionContext` физически представляет только placement/surface, client kind, locale, крупный form factor,
public object/category class, connectivity и country/region/city. `criticalState=true` даёт закрытый отказ/no-ad.
URL/query, object ID, GPS/search origin/координаты, IP locality, identity, role, DUPR/XP, club/opponent graph,
история матчей/поиска/просмотров/кликов, inferred interests, ad/device ID и fingerprint не представлены.

`capToken` — purpose-bound signed first-party capability, а не targeting dimension. Raw token не хранится: БД
сохраняет только keyed hash в `DeliveryCounter`. Anonymous context не объединяется между клиентами. При отсутствии
допустимого durable counter backend обязан использовать session maximum one и не вызывать provider.

`AdProviderPolicy` append-only и deny-by-default. Enable требует четыре `APPROVED` review, evidence и неистёкший
review interval, проверяемый backend до запроса. Поле provider request ограничено тем же enum allowlist. Identity,
cap subject, IP, точная география, URL/object identity и история не становятся допустимыми после consent. Неизвестный
script/iframe/pixel/remote tracker не имеет wire-представления и означает no-ad.

## Campaign revision, creative и targeting

`Campaign` — mutable lifecycle/budget root с указателями current и approved. `CampaignRevision`, `Creative` и
`TargetRule` append-only; trigger проверяет принадлежность указателя и наличие approval. Revision фиксирует billing
model/rate, priority, пределы, placement/creative IDs, legal label/token, policy version и SHA-256 snapshot. Изменение
landing, redirect hosts, creative, targeting, schedule, budget/rate или маркировки создаёт новую revision и снимает
допуск до review.

Creative — только first-party static AVIF/JPEG/PNG/WebP до 1 MiB либо text-image card, с SHA-256, alt text и HTTPS
landing. Executable HTML, script, iframe, pixel, audio/autoplay, remote embed и download отсутствуют в DTO. Redirect
hosts и конечный URL входят в immutable approval; backend обязан проверять exact normalized chain и safe referrer.

`AdTargetDimension` — закрытый enum: surface, client kind, locale, form factor, public object class/content category,
country/region/city и connectivity. SQL не принимает произвольное имя измерения, поэтому точные и поведенческие
сигналы нельзя добавить JSON-полем. Значения остаются кодами allowlist, а не исходным текстом или URL.

## Бюджет, frequency и события доставки

`campaigns_budget_guard` всегда удерживает `reserved_minor + spent_minor <= budget_minor`. Вставка `ISSUED` под
row lock резервирует максимум списания только для active campaign, точной approved revision и полуоткрытого UTC
schedule. `VIEWABLE_IMPRESSION`/`VALID_CLICK` финализируют предусмотренный моделью расход, а timeout release снимает
резерв один раз. Уникальная пара `(delivery_id, kind)`, уникальные token hashes и encrypted idempotency receipt
защищают replay. Точную CPM/CPC/fixed семантику и cleanup реализует следующий backend-этап.

`DeliveryCounter` уникален по campaign и keyed cap subject. Trigger блокирует строку перед viewable increment и
проверяет approved limits, не превышающие 3 за rolling 24h и 10 за 7d. Session counter ограничен единицей для
conservative fallback. Counter не участвует в eligibility, pricing, report или export.

`AdDeliveryEvent` — append-only short-lived факт одного из `ISSUED`, `VIEWABLE_IMPRESSION`, `VALID_CLICK`,
`INVALID_CLICK`, `RESERVATION_RELEASED`. Он содержит только inventory revision references, coarse timing bucket,
money reservation/finalization и closed invalid reason. Нет user/session/device/ad ID, cap hash, IP/coordinates,
URL/query, creative body или истории. AsyncAPI публикует только три положительных committed facts с opaque IDs;
fraud detail и token hashes не покидают owning boundary.

## Агрегаты и retention

`AdReportDaily` агрегирует campaign/creative/placement/day: eligible, served, viewable, valid click, invalid count и
spend. API не раскрывает строку малой cohort. Product report не содержит exact timestamp, subject, locality, URL,
object/content identity или fraud evidence.

- cap state истекает не позднее восьми суток после последнего viewable impression;
- raw issuance/token dedupe/fraud facts и operation receipts истекают не позднее 30 суток;
- daily aggregate и approved legal snapshot могут храниться до трёх лет только после legal policy/hold review;
- очистка должна охватывать PostgreSQL, Redis, queue/DLQ, logs, CDN и backup cycle; бесконечный user trail запрещён.

Текущие static policy tests подтверждают форму TypeSpec/AsyncAPI/Prisma/SQL, но не заменяют применение migration,
параллельные transaction tests, clock/rolling-window tests, provider deletion evidence и юридическую проверку.
