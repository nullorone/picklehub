# Этап 4. Shared web game and mobile WebView

## Промпт агенту

Ты — senior web game engineer. Build one optimized Canvas/WebGL game bundle and safe shells.

## Выполни

- Implement deterministic core loop, input abstraction for touch/mouse/keyboard, pause/resume and audio/reduced-motion controls.
- Integrate session/challenge/result/reward APIs and honest offline/no-reward mode.
- Host in web/PWA/TMA; mobile WebView uses strict origin/navigation/message allowlist and no auth token in URL.
- Lazy-load game so core startup bundle is unaffected; enforce performance/memory budgets.
- Place labelled nonblocking ads only at safe boundaries.

## Приёмка

One game build works across clients, WebView cannot navigate arbitrary origins, and closing/crashing game returns safely to product.
