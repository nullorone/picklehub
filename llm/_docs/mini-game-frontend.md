# Клиенты мини-игры

Документ фиксирует реализацию этапа [`15-mini-game/04-tma-web.md`](../15-mini-game/04-tma-web.md) поверх
[контрактов](mini-game-data-policy.md) и [backend](mini-game-backend.md). Общий runtime находится в workspace
`@picklehub/mini-game`; web/PWA и TMA монтируют его в собственные shell через один и тот же ленивый импорт.

## Игровой runtime и доступность

Детерминированная state machine использует seed серверного task либо локальный practice seed, три дискретных
направления, bounded counters и опубликованную формулу очков. `STANDARD` рисует корт в Canvas и считает ровно
90 секунд активного времени. `CALM` — DOM-режим из 20 ходов без ограничения реакции; при системном reduced motion
он выбран по умолчанию. Touch/pointer, стрелки/A/D и Space/Enter используют один input path, а постоянно видимый
текст сообщает цель, прицел, ходы и успешные возвраты.

Перед раундом есть три учебные подачи. Visibility loss и blur ставят игру на паузу, останавливают clock/input/audio;
явное продолжение разрешено в том же runtime до 10 минут. Звук выключен по умолчанию. У всех действий есть DOM-
кнопки не меньше 44 CSS px, focus/pressed state, русский текст и безопасный выход. Score остаётся локальным и не
публикуется как спортивная характеристика.

## Сеть, награды и реклама

Online flow вызывает typed session, bounded result, progress и idempotent reward claim API. Challenge, proof и
128-bit nonce передаются только в body; явный UUIDv4 operation key сохраняется на конкретную попытку. Клиент
отправляет aggregate counters, но не score, coordinates, trajectory, input timing или device signals. Ошибка выдачи
session переводит раунд в явно отмеченную тренировку; offline completion не создаёт очередь и не оживает после
reconnect. Ошибка result/claim не показывается как начисленная награда.

Общий advertising slot доступен только до старта и после terminal result. Tutorial, round, pause, submit/claim и
reward announcement устанавливают `data-ad-free`, поэтому существующий critical-state observer удаляет placement.
No-fill и provider outage не являются зависимостью игры. Behavioral events используют закрытую минимизированную
taxonomy без score, IDs, proof, input trace или reward amount; текущий analytics port выключен и не буферизует их.

## Ленивая доставка и mobile WebView

Web и TMA создают отдельные JS/CSS chunks только после входа в `/mini-game`. Build gate требует ровно один игровой
JS chunk не больше 100 KiB; текущий minified artifact около 14 KiB (gzip около 5 KiB). PWA precache включает
versioned chunk, поэтому уже установленный bundle запускает practice offline. Игра не регистрирует отдельный service
worker и не пишет proofs/progress в local storage.

Mobile сначала получает 60-секундную capability обычным native bearer, сверяет возвращённый origin с immutable
Expo config и делает initial POST body на exact HTTPS game origin. URL не содержит capability. WebView использует
incognito/no-cache/no-DOM-storage/no-cookie, запрещает mixed content, popup и новый window, ограничивает top-level
navigation exact origin и в production включает WK app-bound domains. Native не внедряет JavaScript и не передаёт
refresh token, cookie или Telegram init data.

Bridge принимает JSON до 2048 bytes с UUIDv4 message ID, exact keys и только `READY_V1`, `CLOSE_V1`,
`OPEN_SAFE_ROUTE_V1`, `HEALTH_V1`. Duplicate/unknown/oversize закрывает игру без action. Safe route ограничен
`MATCH_LIST`, `MATCH_CREATE`, `PROFILE_SELF`, закрывает WebView и возвращает управление native navigation; URL,
resource ID, query и доменная мутация отсутствуют. Ошибка content process, HTTP/load, origin или bridge показывает
возврат в основной продукт. System back требует подтверждения, а явный `CLOSE` возвращает сразу.

## Не закрытые этим этапом runtime gates

- dedicated game origin обязан применять CSP, Permissions Policy и остальные headers из data policy и обслуживать
  initial POST без redirect/query/cookie fallback; CDN/gateway production deployment в репозитории не заявлен;
- WKWebView и Android WebView должны подтвердить POST body, exact Origin exchange, navigation, process crash,
  logout/revoke и отсутствие capability в native/proxy logs на физических устройствах;
- VoiceOver/TalkBack, keyboard, touch, 200% zoom и contrast требуют device/browser matrix;
- p75 ready ≤2.5 s, отсутствие long task >200 ms, отсутствие memory growth за пять раундов и crash-free ≥99.5%
  остаются измерительными rollout gates, а не выводом из unit/build проверки;
- production rewards остаются зависимы от незакрытых PostgreSQL/Redis, secret rotation и РФ-residency gates backend.
