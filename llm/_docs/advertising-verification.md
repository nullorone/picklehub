# Проверка рекламы

Документ фиксирует доступные доказательства и незакрытые runtime/legal gates этапа
`13-advertising/05-verification`. Он не подтверждает правовое основание показа, регистрацию рекламы,
маркировку/ОРД/ЕРИР, договор с рекламодателем, production-развёртывание или разрешение внешнего провайдера.

## Реестр внешних провайдеров

| Проверяемое состояние          | Фактическое значение | Подтверждение                                                                     |
| ------------------------------ | -------------------- | --------------------------------------------------------------------------------- |
| Включённые внешние провайдеры  | 0                    | Миграции не создают policy; backend регистрирует `DisabledAdvertisingProvider`    |
| Выбранные SDK/сети             | 0                    | В зависимостях и клиентах нет provider SDK, iframe, script или remote tracker     |
| Подтверждённые review evidence | 0                    | Admin wire не принимает evidence; `enabled=true` закрыт `LEGAL_EVIDENCE_REQUIRED` |
| Реальные placements/campaigns  | 0                    | Advertising migrations не содержат production seed                                |

Техническая доступность сети или публичный SDK не является разрешением. До отдельной версионированной реализации
нельзя заменять disabled adapter, добавлять identifier/storage, создавать реальные provider policy или передавать
контекст. Legal, security, privacy и commercial review должны независимо подтвердить актуальные условия, data
roles, consent, subprocessors, трансграничную передачу и размещение в России, retention/deletion, категории,
brand/age policy, стоимость и срок повторной проверки. Неполный либо истёкший комплект означает `NO_FILL`.

## Матрица автоматизированных подтверждений

| Риск или сценарий                            | Подтверждение                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Eligibility, priority и стабильный tie-break | verification policy и `AdvertisingService.compareCandidates`; integration fixture          |
| Полуоткрытое UTC-расписание и IANA timezone  | contract/static policy; PostgreSQL runtime boundary остаётся gate                          |
| Hard budget и параллельная выдача            | SQL row-lock/constraint; `advertising-backend.integration-spec.ts`                         |
| Cap 3/24h, 10/7d, refresh и разные session   | SQL trigger и integration rolling-cap scenario                                             |
| Impression/click replay и invalid click      | unique delivery facts, integration replay cases и runnable rate-limiter unit tests         |
| Немедленная пауза и immutable approval       | integration pause case, SQL snapshot trigger и independent-review policy                   |
| Redirect, XSS, MIME/размер и broken asset    | closed backend validator, verification policy и web component canaries                     |
| No-fill/provider outage                      | disabled adapter unit/static policy, component и browser no-fill checks                    |
| Каждый экран и критические действия          | единый slot после client router, critical selector/route policy, component и browser tests |
| Viewability, background и one-shot           | deterministic component scheduler и `test/e2e/advertising.spec.ts` на production builds    |
| Данные запросов и событий                    | exact OpenAPI context field set, AsyncAPI negative policy и browser request assertion      |
| Aggregate report                             | SQL funnel constraint, integration source-fact assertion, suppression floor 20             |
| Доступность и reduced motion                 | semantic label/link/alt component checks, CSS policy и reduced-motion browser context      |
| Match-funnel experiment                      | immutable placement holdout definition и одинаковые guardrail periods в analytics plan     |

Decision передаёт только placement/surface, client kind, locale, крупный form factor, connectivity, закрытые
public object/category codes, country/region/city и purpose-bound cap capability. Точные координаты, IP locality,
URL/query, identity/profile, DUPR/XP, история, inferred interest, device/ad ID и fingerprint отсутствуют в DTO и
событиях. Токены находятся только в защищённом body; policy-тест не допускает user/session/token/context detail в
AsyncAPI delivery facts.

## Семантика отчёта и сверка

`ISSUED` увеличивает `eligible/served`, принятый `VIEWABLE_IMPRESSION` — `viewable`, `VALID_CLICK` — `validClicks`,
а отклонённая trusted-activation проверка — `invalidEvents`. `spendMinor` финализируется один раз по модели:
округлённая стоимость viewable для CPM, valid click для CPC, ноль для fixed. Replay возвращает ту же квитанцию и не
создаёт второй факт. Reservation timeout создаёт единственный `RESERVATION_RELEASED`, но не вычитается из spend,
потому что не был финализирован.

Maintenance worker пересобирает суточный `AdReportDaily` из restricted append-only events последних 30 суток.
Integration-проверка сопоставляет один issued/viewable/valid-click набор с сохранёнными `served=1`, `viewable=1`,
`validClicks=1`, `invalidEvents=0` и CPC spend; публичный административный ответ для этой cohort обязан скрыть
creative/placement и нулевать измерения/расход при `served < 20`. Runtime-сверка worker, clock boundary и repair
после частичного отказа требуют живого PostgreSQL и не заменяются статическим чтением SQL.

## Проверка защитного эксперимента

Rollout допускается только на read-only placement с заранее закреплённым placement-level holdout. Treatment и
holdout используют одинаковый период, зрелость окна и cohort definition. Сопоставляются published match → eligible
join intent, intent → confirmed participant, создание матча, ввод/подтверждение результата, завершение жалобы и
confirmed matches per active player. Рядом обязательны LCP, CLS, client error, no-fill/timeout, focus loss,
screen-reader/keyboard failure и critical-state ad leak.

Forbidden targeting, provider without consent, exact geo, cap bypass и over-budget имеют target zero. Любое
privacy/safety нарушение или статистически значимое ухудшение основной воронки/доступности требует паузы placement;
доход, CTR и impressions не отменяют stop rule. Недостаточная выборка фиксируется как inconclusive. Репозиторий
определяет эксперимент и техническую emergency pause, но не содержит production sample, threshold calibration,
дашборд или подтверждение проведённого эксперимента.

## Незакрытые gates

- Обе advertising migrations должны примениться на чистом и обновляемом PostgreSQL 16/PostGIS. Живой
  PostgreSQL/Redis suite обязан пройти concurrent budget, rolling windows ровно на 24h/7d, refresh 5 минут,
  разные session/cap capability, half-open schedule и timezone/DST, pause propagation, click replay/rate limit,
  reservation release и aggregate reconciliation.
- Production-build Chromium и реальные Telegram WebView должны подтвердить 320/360 px, CLS, keyboard/screen reader,
  foreground/background, one-second viewability, trusted navigation, expired token, slow/no-fill и broken asset.
  Component/jsdom и скомпилированный Playwright suite не заменяют этот запуск.
- Нужны CSP и first-party asset gateway проверки: MIME sniffing, фактический размер/хеш, декодирование AVIF/JPEG/
  PNG/WebP, malware scan, cache purge и запрет remote redirect/pixel. DTO validation сама по себе не проверяет файл.
- Перед первым реальным campaign/placement обязательны legal basis, договор и категория рекламодателя,
  маркировка/ОРД/ЕРИР, consent/notice, РФ-residency и проверяемое retention/deletion evidence для PostgreSQL, Redis,
  queue/DLQ, logs, CDN и backup cycle.
- Защитный holdout должен быть заранее зарегистрирован и проверен на обезличенной production-like выборке. Этот
  этап не выдумывает результаты эксперимента или юридические подтверждения.

До закрытия этих gates доступные static/unit/component/type/build доказательства подтверждают fail-closed форму
системы, но не доказывают production-конкурентность, browser/WebView accessibility или законность реального показа.
