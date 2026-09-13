# Контракты и данные контента

Документ фиксирует решения этапа [`12-content-news/02-contract-data.md`](../12-content-news/02-contract-data.md).
Он не подтверждает права какого-либо внешнего источника, готовность RSS/API, backend, поиска, object storage или
публичного клиента. Все источники остаются выключенными до отдельной юридической, security, privacy и commercial
проверки.

## REST-поверхности и границы доступа

TypeSpec-файл `contracts/rest/content.tsp` — редактируемый источник DTO. Публичный reader API содержит только:

- `GET /content/articles` и `GET /content/articles/{locale}/{slug}` для committed `PUBLISHED` projection;
- `POST /content/search`, чтобы query не попадал в URL и access logs;
- self-only `GET|PUT|DELETE /content/bookmarks`, где пара `(user_id, article_id)` уникальна.

Feed и article можно кратко кешировать как публичную projection. Search, bookmarks, preview и весь admin API имеют
`private, no-store`; preview дополнительно рендерится с `noindex` и привязан к staff session, а не к публичному
capability URL. Любое непубличное состояние статьи даёт одинаковый `ARTICLE_NOT_AVAILABLE`. Bookmark снятой статьи
сохраняет только opaque article ID и признак недоступности, без title, summary или body.

Маршруты `/admin/content` используют bearer, fixed role/capability marker, browser integrity и UUIDv4 idempotency
для мутаций. `EDITOR` получает source proposal/read/pause, candidate review, revision/preview/publication workflow.
`SUPERADMIN` получает только source governance/read и emergency unpublish с re-authentication; он не редактирует
body. `MODERATOR` и `ADS_MANAGER` CMS-доступа не имеют. Backend обязан дополнительно проверять актуальный grant,
purpose, expected aggregate version и аудит; наличие маршрута или кнопки не является авторизацией.

## Источник и кандидат

`ContentSource` — identity и текущий pointer на append-only `ContentSourcePolicy`. Policy отдельно хранит разрешённые
use classes, excerpt limit, terms/version, validity, attribution, territory/languages, четыре review state и
зашифрованное evidence. `ENABLED` допускается только при четырёх актуальных `APPROVED`, непустом evidence и
неистёкшем validity/review interval. Full text и media use classes требуют отдельного evidence ID. Никаких real
sources или seed `ENABLED` миграция не создаёт.

Fetcher принимает только endpoint активного registry record. Он не принимает URL кандидата/редактора, не выполняет
HTML crawling/fallback scraping и не обходит redirects на private, loopback, link-local или metadata networks.
Полученный item создаёт только `IngestCandidateRevision`; trigger требует текущий enabled policy, allowlisted fetch
и соблюдение excerpt limit. Raw response, credential, полный HTML, paywalled body и media по умолчанию не хранятся.

Canonical URL hash, provider ID и fingerprint индексируются как сигналы дедупликации, но намеренно не уникальны
между кандидатами: совпадение обязано сохранить оба provenance и сформировать duplicate group. Уникальны revision
number и source hash внутри кандидата, поэтому повтор одной доставки не создаёт второй входной snapshot, а
изменившийся upstream item создаёт новую immutable revision.

## Статья, публикация и URL

`Article` содержит lifecycle/version и четыре явных pointer: draft, approved, scheduled и published.
`ArticleRevision`, `ArticleOrigin`, source policy, candidate revision и `ContentPublicationDecision` append-only.
Deferred trigger проверяет, что каждый pointer принадлежит тому же article. SQL state machine разрешает только
описанные требованиями переходы; восстановление из `ARCHIVED` возвращает в `DRAFT` и требует новую revision и
решение.

`APPROVE`, `SCHEDULE` и `PUBLISH` требуют полного versioned checklist. `SCHEDULE` фиксирует точную revision и UTC
instant; `operation_id` и encrypted 24-hour receipt делают retry идемпотентным. Scheduler не выбирает новую revision
и не одобряет материал. Публичная projection допустима только когда root находится в `PUBLISHED`, pointer, decision,
revision, locale и slug взаимно согласованы, а каждый derived origin ссылается на действующую одобренную policy.
Unpublish удаляет projection/search/cache до дальнейшей очистки тела.

Пара `(locale, slug)` уникальна в canonical registry и публичной projection. Старый slug становится одним redirect
на новый, не переиспользуется другой статьёй и не образует цепочку. Feed индексирован по
`published_at DESC, article_id DESC`; opaque cursor связывается с filter и snapshot. Search `tsvector` строится
только из активной public revision и удаляется в той же транзакции при unpublish.

## Безопасный rich text и медиа

Единственный хранимый формат — `SAFE_RICH_TEXT_V1`: JSON document из paragraph, heading уровня 2/3, list и quote;
inline node содержит только текст, `STRONG`/`EMPHASIS`/`CODE` и необязательный HTTPS link. TypeSpec не имеет raw
HTML, script, style, iframe, embed, arbitrary attributes или event handlers. PostgreSQL-функция повторно проверяет
тип каждого узла, exact allowlist ключей, длины, структуру list и HTTPS scheme до записи. Неизвестный узел или поле
отклоняются; renderer обязан создавать DOM из typed nodes и никогда не применять `innerHTML`.

Media record принимает только проверенные AVIF/JPEG/PNG/WebP до 10 MiB, server-generated immutable object key,
SHA-256, alt text, rights policy/evidence и approval time. Реальный adapter дополнительно обязан проверить declared
и decoded type, dimensions/decompression limit, malware, metadata removal и re-encode до публикации. External URL
не является media object.

## Происхождение, SEO и события

Derived revision обязана иметь минимум один immutable `ArticleOrigin`: source и точная policy, исходные title,
author/publisher при наличии, canonical URL/hash, source/receive timestamps, transformation kind, rights basis,
attribution и license notice. Original revision использует `ORIGINAL_EDITORIAL` и редакционное авторство; она не
создаёт фиктивный внешний origin. Backend publication guard дополняет SQL проверкой количества и соответствия
origin kind, category/tag locale, SEO canonical и media rights.

SEO DTO содержит явные title, description, canonical URL, indexability и подтверждённое OG media. Sitemap,
`hreflang`, JSON-LD и share/deep link строятся только из public projection. Candidate, admin, preview, search,
bookmarks и любое unpublished состояние имеют `noindex`; URL не содержит user/bookmark/candidate/preview/ad ID.

AsyncAPI-события `content.article.published.v1` и `content.article.unpublished.v1` содержат только article/revision
UUID, aggregate version и closed outcome. Body, title, excerpt, slug/URL, author/publisher, source/evidence, staff/user
identity и bookmark graph запрещены. Событие создаётся в transactional outbox вместе с pointer/projection change;
consumer дедуплицирует `messageId` и перечитывает разрешённую projection.

## Retention и удаление

- transient raw fetch body не сохраняется; network buffers очищаются после parsing/validation;
- dismissed/duplicate candidate excerpt очищается не позднее 30 суток, если legal hold не зафиксирован адресно;
- selected candidate metadata сохраняется через immutable origin, а лишняя выдержка очищается после публикации;
- staff preview capability живёт не более 15 минут и не хранится raw; operation receipt живёт не более 24 часов;
- bookmark живёт до удаления владельцем или удаления аккаунта и не копирует статью;
- published revision/origin/checklist/audit и rights evidence хранятся по применимой редакционной/правовой политике;
  точный срок и backup erasure требуют legal approval до production;
- takedown/истечение права очищает запрещённые body/media из primary, cache, search, queue и затем backup по
  утверждённой процедуре, сохраняя минимальный невосстановимый receipt без текста.

Логи, traces, jobs и operational metrics не содержат title/body/excerpt/query/URL, source/article/candidate/user IDs,
evidence, автора или точное время читателя. Реализация retention worker, content sanitizer/renderer, source adapter,
publication transaction и cache purge относится к следующему backend-этапу; текущая миграция и static policy tests
не заменяют применение SQL и конкурентные integration tests на PostgreSQL.
