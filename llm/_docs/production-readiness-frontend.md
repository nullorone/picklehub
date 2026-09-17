# Доставка web/PWA, TMA и release supply chain

Документ фиксирует локальную реализацию `16-production-readiness/04-tma-web.md`. Он не является свидетельством
production-деплоя, настройки DNS/CDN/BotFather, прохождения Telegram review или store publication.

## Артефакты и конфигурация

Web/PWA и TMA собираются раздельно и обслуживаются отдельными non-root Nginx images. Release build требует
semantic version, полный SHA проверенного commit и `SOURCE_DATE_EPOCH`; `release.json` содержит identity,
совместимость REST/AsyncAPI и SHA-256 всех публичных файлов. Проверка отклоняет source maps, localhost/test markers,
development Telegram mock, private-key markers, TON Connect и неподтверждённые `example.invalid` значения.

Оба образа используют общий `frontend/nginx.conf`: PID и все пять HTTP temporary paths находятся в `/tmp`,
логи направлены в stdout/stderr. Это позволяет запускать стандартный nginx image как `USER nginx` без записи
в root-owned `/var/run` и `/var/cache/nginx`. Docker build выполняет `nginx -t` уже от `nginx`, проверяя
конфигурацию и доступ к временным каталогам. Статус Compose `Started` означает только запуск процесса;
доступность подтверждается `Healthy` и HTTP-проверкой, а причину остановки показывают `docker compose logs web tg`.

Оба клиента используют точный same-origin API path `/v1`; perimeter обязан маршрутизировать его в backend без
широкого CORS. Backend production startup принимает только список точных HTTPS origins web и TMA, без `*`,
localhost и `.invalid`. Канонические значения находятся в `deploy/client-production.json`: web
`https://picklehub.ru`, TMA `https://tma.picklehub.ru`, magic link `https://picklehub.ru/auth/email`. TMA URL
настраивается в BotFather вручную после внешних gates; bot username намеренно не выдуман. TON не входит в продукт.

Web CSP запрещает embedding. TMA разрешает frame ancestors только Telegram. Оба сервера задают HSTS, nosniff,
referrer/permissions policy; TMA намеренно не получает `X-Frame-Options: DENY`. HTML, runtime config, release
manifest, PWA manifest/service worker не кешируются либо revalidate-ятся. Только content-hashed assets имеют годовой
immutable cache. Поэтому при выпуске очищаются только mutable shell paths, а versioned assets не purge-ятся. Карты
остаются выключены без reviewed runtime block; CSP заранее ограничивает разрешённый asset host
`tiles.picklehub.ru`.

## CI, происхождение и mobile

PR workflow не имеет write/deployment permissions. Обязательные jobs разделяют contracts, affected workspaces,
живые PostgreSQL/PostGIS+Redis integration, browser E2E, Compose/Docker, production dependency audit, license audit,
secret history scan, CycloneDX inventory и mobile export. Любой job failure блокирует merge/release через required
checks репозитория; настройка branch protection остаётся внешним административным gate.

Ручной `Build release candidate` checkout-ит именно введённый полный commit SHA, повторяет gates, выпускает два
архива и два deployable OCI image archive, сверяет manifest digests, репетирует атомарное переключение/rollback и
создаёт GitHub build provenance для каждого артефакта. Workflow не содержит deployment job и не может запускаться
из PR. До сборки GitHub API обязан найти успешный полный `Required verification` именно для этого SHA, поэтому
провал contracts/integration/browser/container/supply-chain/mobile job блокирует candidate. Registry push/signing
требуют отдельного одобрения и настройки environment.

Функция 14 завершена, поэтому CI делает production-mode Expo export для iOS/Android и проверяет public config,
development endpoints/stubs, private keys и signing material. Export остаётся неподписанным; `eas.json`, store
credentials и автоматическая публикация отсутствуют.

## Канарейка, smoke и откат

`scripts/release/rollout-clients.mjs` — provider-neutral orchestration поверх двух явно установленных absolute-path
адаптеров: traffic/deployment и cache purge. Manifest требует immutable web/TMA image digests, полный commit,
точные HTTPS public/canary URLs и canary 1–10%. Порядок: установить canary → проверить shell/security headers,
runtime config, release/backend compatibility и readiness → promote → повторить smoke → очистить только mutable
paths. Любая ошибка smoke вызывает adapter rollback. Ручной rollback использует ту же reviewed manifest и затем
требует smoke предыдущего release и наблюдение C0/C1 burn-rate.

Запуск выполняется только оператором после approvals: `npm run release:rollout -- /absolute/release.json` либо
`npm run release:rollback -- /absolute/release.json`; `CLIENT_ROLLOUT_ADAPTER` и `CLIENT_CACHE_PURGE_ADAPTER`
указывают на reviewed executable без credentials в arguments или manifest.

До rollout оператор обязан закрыть migration/legal/РФ/provider gates этапов 01–03, проверить provenance и digests,
снять baseline/backlog, назначить incident/release owners и подтвердить предыдущий immutable artifact. Cache purge
не исправляет несовместимость; backend и клиенты поддерживают текущий и соседний REST v1 artifact, а breaking API
идёт новым major с overlap. Фактический canary/rollback на провайдере не выполнен и остаётся release evidence gate.
