# PickleHub web/PWA

Нейтральная React/Vite-оболочка сайта и устанавливаемой PWA. Продуктовых экранов на foundation-этапе нет.

```bash
npm run dev --workspace @picklehub/web
npm test --workspace @picklehub/web
npm run build --workspace @picklehub/web
```

В production приложение загружает типизированную конфигурацию из `/runtime-config.json` с `Cache-Control:
no-store`. При развёртывании замените этот файл валидным объектом по образцу `public/runtime-config.example.json`.
Service worker precache-ит только статическую оболочку; API runtime cache и очередь мутаций не включены.
