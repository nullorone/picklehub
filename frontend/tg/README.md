# PickleHub Telegram Mini App

Отдельный React/Vite-клиент TMA с автоматическим обменом свежих Telegram init data через backend, первичной
настройкой, согласиями и управлением доступом. Telegram SDK подключён только через локальный адаптер
`src/telegram.ts`. Init data не записываются в storage, аналитику или логи. Макет окружения активируется
исключительно Vite-флагом `DEV`; build-check отклоняет production bundle, если marker макета попал в артефакт.

```bash
npm run dev --workspace @picklehub/tg
npm test --workspace @picklehub/tg
npm run build --workspace @picklehub/tg
```

Production-конфигурация загружается из `/runtime-config.json` без кеширования и должна соответствовать
`runtime-config.example.json`.

Карта площадок включается блоком `map` с MapLibre-compatible `styleUrl` и обязательными текстом и HTTPS-ссылкой
атрибуции. Значения `example.invalid` — безопасные заглушки, а не выбранный провайдер. Без одобренной конфигурации
TMA явно показывает доступный список; legal/terms/residency review остаётся production gate.

Единственный production Mini App URL — `https://tma.picklehub.ru/` из `deploy/client-production.json`; он вручную
задаётся в BotFather только после подтверждения владения TLS/DNS и Telegram review. Bot username не придуман и не
записывается до назначения. Magic/match deep links принадлежат web origin, Telegram init data принимает только
backend. TON/TON Connect отсутствуют. CSP разрешает embedding только Telegram, runtime API остаётся same-origin
`/v1`, HTML/config не кешируются, source maps не публикуются, а release manifest связывает файлы с commit SHA.
