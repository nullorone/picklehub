# Проверка мини-игры

Документ фиксирует доступные доказательства этапа `15-mini-game/05-verification`. Это аудит готовности, а не
подтверждение production-развёртывания, физической device-матрицы, применения миграций или размещения данных в
России. Пока перечисленные ниже runtime gates не закрыты, решение для persistent rewards — `NO-GO`; сама игра
может оставаться доступной только как явно обозначенная тренировка без наград.

## Автоматизированные подтверждения

| Область                | Доказательство                                                                              | Статус              |
| ---------------------- | ------------------------------------------------------------------------------------------- | ------------------- |
| Детерминизм и очки     | engine unit replay, misses/streak и чистая опубликованная формула                           | PASS                |
| Ввод и доступный режим | component keyboard/buttons, быстрые ходы `CALM`, reduced-motion default                     | PASS                |
| Пауза, фон и звук      | component blur → pause, input freeze, explicit resume и opt-in Web Audio                    | PASS                |
| Offline                | component завершает practice без session, claim, очереди и последующей отправки             | PASS                |
| Web/TMA                | production-build Playwright сценарий на 1280 px и 360 px использует общий workspace         | READY, BLOCKED HERE |
| Bundle                 | build gate: один lazy JS chunk, максимум 100 KiB; PWA precache содержит его версию          | PASS                |
| Impossible result      | backend unit matrix проверяет арифметику, fixed duration/turn count и coarse rate           | PASS                |
| Replay и caps          | SQL unique/trigger, advisory locks, keyed nonce/task и static verification policy           | PARTIAL             |
| XP registry            | opaque grant reload через `reconcileMiniGameGrant`, source-time и append-only ledger policy | PARTIAL             |
| WebView                | unit origin/message attacks плюс static POST-body/ephemeral/no-injection policy             | PARTIAL             |
| Реклама                | component и browser canary удаляют placement в tutorial/play/pause/submit/claim             | PASS                |
| FPS/load/memory        | build size проверен; representative device profiling отсутствует                            | BLOCKED             |

`CALM` не имеет ограничения скорости реакции: verification выявила и устранила применение 450-миллисекундного
интервала, предназначенного только для `STANDARD`. Это закреплено component и browser сценарием из 20 быстрых
ходов. Formula unit test подтверждает, что локальные очки зависят только от successful returns, target hits и
streak bonuses; изменение количества attempts само по себе очки не меняет.

## Награды, повторы и границы времени

Result API принимает только агрегированные bounded counters. В DTO и browser request отсутствуют score,
траектория, координаты, per-input timing, device fingerprint, победитель, DUPR и рейтинг. Невозможная арифметика,
неверная конфигурация/режим, более 180 попыток `STANDARD`, не 90 секунд либо не 20 ходов `CALM` получают terminal
reject. Expired challenge, повтор task/nonce и terminal session закрываются до выдачи награды.

Уникальные session result, processed task/nonce и semantic reward state дополняются row/advisory locks. Дневное
окно строится по UTC, неделя начинается в понедельник 00:00 UTC. Retry после полуночи использует `acceptedAt`
исходной квитанции, а не время повтора. `GLOBAL_XP` создаётся максимум один раз за UTC-сутки, пять раз за UTC-неделю
и 30 раз за 84-дневный сезон; один grant равен 10 XP. Mini-game публикует opaque grant и не пишет XP ledger либо
balance напрямую. Consumer перечитывает grant как `MINI_GAME_DAILY_COMPLETION`, дедуплицирует событие/revision и
использует append-only reversal/reinstatement.

Эти проверки не заменяют живую конкурентную проверку. На PostgreSQL 16/PostGIS необходимо применить обе миграции
на чистую и обновляемую базу и одновременно выполнить: две result submission одной session, общий nonce у разных
session, несколько claims одной receipt, последнюю пятую/шестую недельную и 30/31 сезонную выдачу, retry по обе
стороны 00:00 UTC, reversal/reinstatement и повтор outbox после restart. Затем ledger, balance, grant и progress
сверяются по source event и сумме. До этого отсутствие превышения награды доказано декларативными ограничениями и
unit-моделью, но не реальным планировщиком PostgreSQL.

## Клиенты, offline и реклама

Web и TMA лениво импортируют один `@picklehub/mini-game`; build gate требует ровно один versioned chunk не больше
100 KiB. Production-browser canary запускает одинаковый `CALM` flow при reduced motion в web 1280×720 и TMA
360×720, проверяет pause/resume, отсутствие horizontal overflow, result body и claim proof. Размеры 320, 375, 412,
768 и 1440 px, 200% zoom, keyboard-only, touch/pointer, screen reader и high contrast остаются обязательной ручной
матрицей, даже если CSS и semantic component checks зелёные.

Offline round создаётся только локально, явно помечен «Тренировка», не вызывает reward API и не сохраняется в
localStorage, IndexedDB или очередь. Уже установленный PWA precache содержит versioned chunk; первое открытие игры
без ранее загруженного bundle не обещается. Потеря сети во время результата заканчивается без ложного успеха и без
фонового replay.

Общий рекламный slot допустим на entry и terminal result. `data-ad-free`, dialog и `aria-busy` закрывают tutorial,
активный раунд, pause, submit/claim и объявление награды. Component test проверяет критические фазы, а Playwright —
исчезновение уже показанного объявления при входе в tutorial. No-fill, broken asset или provider outage не входят
в игровой state и не блокируют завершение.

## WebView security

Mobile передаёт 60-секундную capability только initial POST body на immutable exact HTTPS origin. URL/query,
cookie, native refresh token, Telegram init data и injected JavaScript не используются. Unit attacks отклоняют
другую scheme/origin, похожий subdomain, invalid URL, unknown version/type, extra field, arbitrary route/URL,
невалидный UUID и payload больше 2048 bytes. Повтор message ID закрывается screen-level seen set; safe navigation
сначала закрывает WebView, повторно bootstrap-авторизует native session и допускает только три закрытых route code.

Статические и unit checks не подтверждают реальные заголовки dedicated origin. На WKWebView и Android WebView
нужно проверить initial POST без redirect, exact `Origin` exchange, CSP/Permissions-Policy/COOP/CORP/referrer,
отсутствие capability в proxy/native/crash logs, logout/revoke, back/new-window/download/file navigation, content
process crash и возврат в основной продукт. Wildcard, HTTP fallback, query/cookie fallback и arbitrary bridge
должны завершать запуск fail closed.

## Производительность и release decision

Автоматически проверяются lazy isolation и 100 KiB minified budget; этот контроль защищает основной startup
bundle. Он не измеряет FPS, p75 ready, long tasks, heap growth, thermal throttling или crash-free rate. Обязательный
профиль: low-end Android API 29, актуальный Android, малый iPhone/iOS 16, актуальный iPhone, Telegram WebView обеих
платформ и desktop/mobile browsers. Для пяти последовательных раундов нужны p75 ready ≤2.5 s, отсутствие long task
больше 200 ms, устойчивые FPS/heap без роста и crash-free ≥99.5% на privacy-reviewed telemetry.

Решение для production rewards — `NO-GO`: не закрыты живые PostgreSQL/Redis/outbox races, secret rotation,
dedicated-origin headers, физические WKWebView/Android и accessibility/performance matrix, retention/deletion/backup
cycle и подтверждение российского размещения. Эти блокировки не влияют на спортивную статистику, матчи и остальной
Match MVP: reward switch обязан оставаться выключенным, а отказ игры, рекламы или reward storage ведёт только к
тренировке либо безопасному возврату в PickleHub.
