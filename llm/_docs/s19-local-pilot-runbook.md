# S19: временный стенд с локальным API

Этот стенд нужен для проверки Mini App с тестовыми Telegram-аккаунтами до появления хостинга. Mini App
публикуется на GitHub Pages по адресу `https://nullorone.github.io/picklehub/`; API, PostgreSQL и worker
работают на локальной машине. Cloudflare Quick Tunnel выдаёт временный публичный HTTPS-адрес API. При остановке
машины или туннеля стенд недоступен. Туннель не выполняет критерий S19 о работе без ноутбука и не подходит
для реальных участников без отдельной проверки обработки персональных данных и условий провайдера.

## Подготовка

Нужны Node.js и npm из проекта, Docker и `cloudflared` (на macOS: `brew install cloudflared`). Проверить
наличие программы командой `cloudflared --version`. Никаких токенов или реальных данных в Git не добавлять.

1. Выполнить `npm ci`, затем `cp backend/.env.example backend/.env`. В `backend/.env` задать
   `NODE_ENV=production`, `HOST=127.0.0.1`, `PORT=3000`, `DATABASE_URL` для локальной БД,
   `FRONTEND_ORIGINS=https://nullorone.github.io`, `TELEGRAM_APP_URL=https://nullorone.github.io/picklehub/`,
   настоящий `TELEGRAM_BOT_TOKEN` и случайный `TELEGRAM_WEBHOOK_SECRET` (1–256 символов ASCII из
   `A-Z`, `a-z`, `0-9`, `_`, `-`). Файл игнорируется Git. Секреты не вводить как аргументы команд и не
   передавать в переписке. Для тестовых аккаунтов локальный compose использует только локально доступную БД.
2. Выполнить `docker compose -f backend/docker-compose.yml up -d --wait`,
   `npm run prisma:migrate:deploy --workspace @picklehub/backend` и
   `npm run prisma:generate --workspace @picklehub/backend`.
3. Выполнить `npm run backend:build`. В отдельных терминалах запустить `npm run pilot:api` и
   `npm run pilot:worker`. Проверить `curl --fail http://127.0.0.1:3000/health/ready`.
4. В третьем терминале запустить `npm run pilot:tunnel`; записать выданный адрес вида
   `https://<random>.trycloudflare.com`. Проверить `curl --fail https://<random>.trycloudflare.com/health/ready`.
   Сохранить адрес только для этой сессии. Не открывать порт 3000 на маршрутизаторе.

## Frontend и Telegram

В настройках GitHub репозитория `nullorone/picklehub` задать Actions variable `VITE_API_URL` равной
текущему HTTPS-origin туннеля без завершающего `/`; `VITE_TELEGRAM_BOT_USERNAME` — публичное имя бота без `@`.
Вручную запустить workflow `Deploy static content to Pages` для ветки `master` и дождаться успешной публикации.
Workflow отклонит HTTP API. Проверьте, что открытая Mini App действительно использует новый адрес: старый
кэш или сборка не подходят для проверки. При каждом новом адресе туннеля повторить этот шаг; GitHub Pages
встраивает `VITE_API_URL` в сборку. Production-сборка исключает dev HTTP mock worker и сохраняет публичный
манифест. `HashRouter` сохраняет ссылки вида `/#/matches/<uuid>`.

После готовности Pages выполнить `npm run pilot:webhook -- set https://<random>.trycloudflare.com` и
`npm run pilot:webhook -- info`; последний выводит только адрес и число ожидающих обновлений. Команда
`set` указывает Telegram путь `/telegram/webhook`, секретный заголовок и `allowed_updates=["message"]`.
В BotFather Main Mini App URL должен быть `https://nullorone.github.io/picklehub/`. Проверить в Telegram
вход, список, создание и открытие тестовой игры, ссылку на игру, а также доставку уведомления тестовому
аккаунту. Если пользователь ещё не отправлял боту `/start`, уведомление ему не придёт.

## Резервная копия и восстановление

Перед изменениями создать каталог `backups/` (он исключён из Git) и выполнить:

```sh
docker compose -f backend/docker-compose.yml exec -T postgres pg_dump -U picklehub -Fc picklehub > backups/picklehub.dump
docker compose -f backend/docker-compose.yml exec -T postgres createdb -U picklehub picklehub_restore
docker compose -f backend/docker-compose.yml exec -T postgres pg_restore -U picklehub -d picklehub_restore --exit-on-error < backups/picklehub.dump
docker compose -f backend/docker-compose.yml exec -T postgres psql -U picklehub -d picklehub_restore -Atc "SELECT count(*) FROM games"
```

Сравнить количество игр в восстановленной и исходной БД и выборочно проверить нужные тестовые записи.
Восстановление выполняется только в `picklehub_restore`; основную БД не перезаписывать. Хранить dump как
закрытый файл и удалять по согласованной политике хранения. Если `picklehub_restore` уже существует,
использовать новое уникальное имя тестовой БД и подставить его в обе команды.

## Остановка и откат

Сначала выполнить `npm run pilot:webhook -- delete`, затем остановить worker, API и туннель через `Ctrl+C`.
Команда удаления сохраняет накопленные Telegram updates; при длительной остановке проверить их перед
повторным запуском. Остановить БД без удаления volume: `docker compose -f backend/docker-compose.yml down`.
При неудачном выпуске вернуть прежнюю версию кода и сборку Pages, направить webhook только на здоровый API.
Миграции с изменением данных автоматически назад не откатывать: сначала восстановить dump в отдельную БД,
проверить записи и только затем переключать подключение. Фиксировать версию кода, URL, список применённых
миграций и результаты проверок в журнале без секретов.
