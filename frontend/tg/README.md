# PickleHub Telegram Mini App

Отдельная React/Vite-оболочка TMA без продуктовых экранов. Telegram SDK подключён только через локальный адаптер
`src/telegram.ts`. Макет окружения активируется исключительно Vite-флагом `DEV`; build-check отклоняет production
bundle, если marker макета попал в артефакт.

```bash
npm run dev --workspace @picklehub/tg
npm test --workspace @picklehub/tg
npm run build --workspace @picklehub/tg
```

Production-конфигурация загружается из `/runtime-config.json` без кеширования и должна соответствовать
`public/runtime-config.example.json`.
