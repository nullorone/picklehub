# Expo-клиент mobile parity

Документ фиксирует реализацию `14-mobile-parity/04-tma-web.md`. Он не подтверждает store submission, production
provider review, владение universal/app-link доменом или проверку на физических устройствах.

## Архитектура клиента

`frontend/mobile` — отдельный Expo/React Native workspace без WebView и общего UI с browser-клиентами. Он
использует generated DTO только как типы и собственный native transport. Root stack содержит full-screen формы и
detail screens, а нижние tabs — матчи, площадки, уведомления и профиль. Account и safety открываются из профиля;
admin и возможности после Match MVP отсутствуют.

Native session реализует S256 verifier, body-only refresh, один in-flight rotation и memory-only access token.
Refresh/verifier/cache key находятся в device-only SecureStore. При rotation новый refresh сохраняется до выдачи
access state вызывающему коду. Logout/account switch синхронно очищают encrypted user partition, credentials и
local push state; недоступный logout endpoint не возвращает локальный доступ.

Read-cache имеет versioned envelope, user partition, fetched/expiry timestamps и sensitivity. XChaCha20-Poly1305
payload хранится в AsyncStorage, а key — в SecureStore. TTL: public 24 часа, user 1 час, chat 30 минут. Secret,
restricted safety/email и ephemeral location classes не имеют persistent adapter. Offline UI помечает возраст
данных, а мутации отключает без optimistic success и background queue.

Universal/app links разбираются вручную до навигации: exact HTTPS host, closed paths и UUID; development scheme
разрешён лишь в non-production config. Magic/invite secrets живут только в памяти, push принимает только neutral
schema и refetches inbox по opaque ID. Неизвестная ссылка ведёт к безопасному unsupported state. AASA/assetlinks
не подменены API endpoint и остаются infrastructure gate.

Chat получает single-use realtime ticket, отправляет его первым AsyncAPI envelope, подписывается с REST cursor,
использует bounded exponential backoff с jitter и REST resync. Background закрывает socket; foreground сначала
refreshes session/snapshot и получает новый ticket. Push registration следует pre-prompt в account screen, но
runtime kill switch выключен до provider review; in-app inbox работает независимо.

Location permission запрашивается только кнопкой «Рядом со мной» и только foreground. Denial сохраняет list/text/
manual map; координата живёт в памяти запроса и не становится cache/analytics key. Native map имеет текстовый list
fallback и attribution. Базовые компоненты задают accessible roles/states/live regions и минимальные touch targets;
physical VoiceOver/TalkBack и Dynamic Type evidence остаются verification gate.

## Проверки и открытые gates

Policy tests доказывают отсутствие browser cookie/CSRF transport, закрытые link/push targets, SecureStore session
и отсутствие safety в cache allowlist. Unit tests покрывают native refresh headers/rotation, resolver и realtime
lifecycle. После восстановления registry access Expo dependencies установлены в единый lockfile; совместимость
версий подтверждена `expo install --check`, а lint, strict typecheck, unit tests и Hermes export для iOS/Android
проходят. Simulator/physical-device launch и native accessibility по-прежнему не объявляются проверенными.

Verification evidence, production export audit и список незакрытых Match MVP/device/store gates зафиксированы в
[проверке mobile parity](mobile-parity-verification.md). Наличие готовых Maestro flows не означает их успешный
device-run.
