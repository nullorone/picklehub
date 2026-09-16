# PickleHub mobile

Нативный клиент Match MVP на React Native/Expo. В него входят email magic link, onboarding, матчи, площадки,
чат, уведомления, профиль, статистика, account и safety surfaces. Admin, клубы, турниры, геймификация, контент,
реклама и мини-игра намеренно не входят в первый mobile release.

## Окружения

- `APP_ENV=development` использует dev bundle ID/package и разрешает только внутреннюю схему `picklehub-dev`.
- `APP_ENV=production` использует `ru.picklehub.mobile`, только HTTPS universal/app links и production channel.
- `EXPO_PUBLIC_API_URL` задаёт публичный base URL API; секреты в Expo config запрещены.

Команды запускаются из корня: `npm run dev --workspace @picklehub/mobile`, `npm run typecheck --workspace
@picklehub/mobile`, `npm test --workspace @picklehub/mobile` и `npm run build --workspace @picklehub/mobile`.
Подписывающие данные и provider credentials не хранятся в репозитории.

Production export проверяется отдельно командой `npm run build:release:audit --workspace @picklehub/mobile`: без
явного HTTPS API URL production config завершается ошибкой, а готовые iOS/Android bundles проверяются на dev URL,
test stubs, private keys и signing artifacts. Device E2E лежат в `.maestro/flows`; они требуют изолированный mailbox,
подготовленные test data и установленный Maestro и не входят в production bundle.

## Security boundary

Refresh credential и login verifier находятся только в SecureStore с device-only accessibility, access token —
только в памяти. Read-cache шифруется XChaCha20-Poly1305 отдельным SecureStore key и partitioned по server user ID.
Safety text, email, tokens, invite secret, signed URL и location не кешируются. Logout/account switch очищают
partition, secure credentials и local push state до сетевого результата.

Любая мутация требует сети и server response. Deep links проходят closed resolver; magic/invite secret не
становятся navigation params. Push содержит только opaque notification ID и не выполняет действие. WebSocket
закрывается в background, каждый reconnect получает новый single-use ticket, а cursor gap требует REST snapshot.

## Release gates

До production обязательны реальные AASA/assetlinks, выбранный и одобренный push/map provider, privacy/legal/
residency review, store disclosures и privacy manifests, signing outside Git, а также device-matrix проверки iOS
16+/Android API 29+, VoiceOver/TalkBack, 200% font scale, lifecycle, offline, backup exclusion и lost-device purge.
