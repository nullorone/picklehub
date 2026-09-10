# PickleHub web/PWA

React/Vite web-клиент и устанавливаемая PWA. Реализованы вход по одноразовой email-ссылке, возобновляемая
первичная настройка, согласия и управление способами входа и сессиями.

```bash
npm run dev --workspace @picklehub/web
npm test --workspace @picklehub/web
npm run build --workspace @picklehub/web
```

В production приложение загружает типизированную конфигурацию из `/runtime-config.json` с `Cache-Control:
no-store`. При развёртывании замените этот файл валидным объектом по образцу `public/runtime-config.example.json`.
Service worker precache-ит только статическую оболочку; API runtime cache и очередь мутаций не включены.
Access credential существует только в памяти вкладки, refresh передаётся браузером в HttpOnly cookie. Ссылка из
письма подтверждается явной кнопкой: открытие страницы или проверка ссылки почтовым сканером не погашает token.

Каталог площадок всегда имеет доступное списочное представление. Карта включается только при наличии блока `map`
в runtime-конфигурации: `styleUrl` должен указывать на совместимый с MapLibre style разрешённого провайдера, а
`attributionText` и `attributionUrl` — содержать требуемое им авторство. Значения `example.invalid` из образца
неработоспособны намеренно; production-конфигурация допускается только после legal/terms/residency review.
