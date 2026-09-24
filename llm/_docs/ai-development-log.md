# Журнал учебной AI-разработки

## 2026-09-18 — подготовка ветки пересборки

### Контекст

- Активная ветка: `learning/fullstack-rebuild`, исходная точка — `adcec3a`.
- Полная современная реализация сохранена в `reference/current-2026-09-18` на коммите `05385ab`.
- Исходный UI сохранён в `reference/legacy-ui-adcec3a` и используется только как визуальный ориентир.
- Активный промпт: `llm/01-platform-foundation/01-requirements.md`.

### Выполнено

- Добавлены локальные исключения для секретов, кэшей, coverage и результатов браузерных тестов.
- Перенесены правила репозитория, обзор проекта, шаблоны и промпты `01`–`16`.
- Готовые документы, контракты, backend, миграции, тесты и сгенерированные клиенты из эталонной ветки не
  переносились.

### Проверки

- `npm ci` — успешно, установлено 411 пакетов по legacy lock-файлу.
- `npm run build` — успешно; Vite предупредил об `eval` в legacy-зависимости `eruda` и чанках больше 500 kB.
- `npm run lint` — ошибка исходной конфигурации: preset `recommendedTypeChecked` включён без TypeScript project
  service. Исправление относится к активному промпту основы платформы.
- `git diff --check` — успешно.
- Markdown lint — не выполнен: после `npm ci` пакет отсутствует в legacy workspace, а временная установка
  недоступна в текущем сетевом окружении.

### Следующий шаг

Выполнить `llm/01-platform-foundation/01-requirements.md`: самостоятельно описать архитектуру и ADR до создания
нового продуктового кода.

## 2026-09-24 — интервью и задачи Telegram MVP

### Контекст и решения

- По итогам интервью активный релиз сужен до Telegram bot + Mini App, пилот в Москве.
- Бюджет владельца — три дня по восемь часов, работа шагами по 30–60 минут.
- Встреча на время с лимитом участников; запись автоматическая. Организатор может не участвовать,
  удалять участников и отменять игру; ротация выполняется вручную на площадке.
- Бот уведомляет об изменениях и отмене, напоминает за два часа до начала.
- Текущий интерфейс — визуальная основа, Tailwind — способ стилизации; полная дизайн-система после MVP.
- Порядок реализации: frontend-first с TypeSpec, затем NestJS/Prisma; web/PWA и native отложены.

### Выполнено

- Обновлены `llm/00-project-overview.md`, `llm/README.md` и `_docs/legacy-prototype.md`.
- Созданы `_docs/adr-001-telegram-first-mvp.md` и `_docs/telegram-mvp-plan.md`.
- По просьбе владельца созданы `llm/tasks/README.md` и 20 отдельных файлов задач S01–S20
  с зависимостями, границами, критериями готовности и проверками.
- Согласованные ответы отделены от рабочих допущений. Старые каталоги `01`–`16` сохранены
  как отложенный контекст. Старый архитектурный промпт не отмечен как выполненный.
- Продуктовый код, зависимости и конфигурация запуска не менялись; публикация не выполнялась.

### Наблюдения и ограничения

- `start:https` по `package.json`/`vite.config.ts` запускает Vite с mkcert; туннель не настроен этой командой.
- `deploy` публикует статический frontend в GitHub Pages; backend/БД/worker требуют отдельного размещения.
- Первый аналог заблокирован прокси; у PIKLB доступен только экран входа и ссылка на бота;
  у PICKLEBALL Events изучены публичные страницы. Полный обзор закрытых Telegram-сценариев не заявляется.
- Хостинг не выбран. 20 часовых задач и четыре часа резерва — предварительный бюджет, не гарантия срока.
- Фактическое время этой сессии инструментально не измерялось.

### Проверки документов

- После добавления команд в журнал повторная проверка Prettier выявила форматирование самого журнала;
  исправлено командой `./node_modules/.bin/prettier --write llm/_docs/ai-development-log.md`,
  затем полный `prettier --check` и `git diff --check` повторены успешно.
- `./node_modules/.bin/prettier --write 'llm/tasks/*.md' llm/00-project-overview.md llm/README.md llm/_docs/legacy-prototype.md llm/_docs/adr-001-telegram-first-mvp.md llm/_docs/telegram-mvp-plan.md llm/_docs/ai-development-log.md` — успешно.
- `./node_modules/.bin/prettier --check 'llm/tasks/*.md' llm/00-project-overview.md llm/README.md llm/_docs/legacy-prototype.md llm/_docs/adr-001-telegram-first-mvp.md llm/_docs/telegram-mvp-plan.md llm/_docs/ai-development-log.md` — успешно.
- `git diff --check` — успешно.
- Проверка порядка задач и относительных ссылок командой ниже — успешно:
  27 документов, 20 задач по порядку, 213 локальных ссылок.
- Отдельный Markdown lint не запускался: исполняемый файл отсутствует в локальных зависимостях.
  Проверены форматирование и ссылки. Продуктовые тесты, сборка и генерация контрактов не запускались:
  изменения ограничены документацией.

````sh
python3 - <<'PY'
from pathlib import Path
import re

root = Path('llm')
files = sorted((root / 'tasks').glob('*.md')) + [
    root / '00-project-overview.md', root / 'README.md',
    root / '_docs/legacy-prototype.md', root / '_docs/adr-001-telegram-first-mvp.md',
    root / '_docs/telegram-mvp-plan.md', root / '_docs/ai-development-log.md',
]
tasks = sorted((root / 'tasks').glob('[0-9][0-9]-*.md'))
assert [p.name[:2] for p in tasks] == [f'{n:02d}' for n in range(1, 21)]
missing = []
links = 0
for file in files:
    content = re.sub(r'```.*?```', '', file.read_text(), flags=re.S)
    for target in re.findall(r'\]\(([^)]+)\)', content):
        if '://' in target or target.startswith('#'):
            continue
        links += 1
        if not (file.parent / target.split('#', 1)[0]).exists():
            missing.append((str(file), target))
assert not missing, missing
print(f'OK: {len(files)} documents, {len(tasks)} ordered tasks, {links} local links')
PY
````

### Следующий шаг

[S01 — основа frontend](../tasks/01-frontend-foundation.md). Реализация не начата;
выполнять одну задачу за рабочий шаг и останавливаться при невыполненной приёмке.

## 2026-09-24 — S01: основа frontend (в работе)

### Выполнено

- Создан npm workspace `@picklehub/tg`; React/Vite-каркас и lock-файл находятся в `frontend/tg/` и корне соответственно.
- Корневые команды `start`, `start:https`, `build` и `deploy` делегируют TMA. GitHub Pages загружает
  `frontend/tg/dist/`; публикация не выполнялась.
- Добавлены границы модулей, направления зависимостей и правила TypeSpec/генерируемого клиента в
  [`architecture.md`](architecture.md).
- В рабочем приложении оставлен пустой foundation-экран; старые бизнес-демо и TON Connect удалены из TMA.
  Mock Telegram environment, SDK debug mode и Eruda включаются только в development.
- Исправлена typed ESLint конфигурация через `projectService`; правила ESLint не отключены.
- Фактическое время инструментально не измерялось.

### Проверки

- `npm install --package-lock-only --ignore-scripts --offline` — успешно; обновлён корневой lock-файл для workspace,
  аудит npm сообщил 0 уязвимостей.
- `npm ci --ignore-scripts --offline` — успешно; clean install из одного корневого lock-файла, 396 пакетов,
  аудит npm сообщил 0 уязвимостей.
- `npm run format` — успешно.
- `npm run lint && npm run typecheck && npm run build` — успешно после clean install; Vite собрал приложение в
  `frontend/tg/dist/`.
- `npm run format:check` — успешно после форматирования корневого `package.json`.
- `git diff --check` — успешно.
- `npm run start -- --host 127.0.0.1 --port 4173 --strictPort` — HTTP Vite сервер запущен после исправления
  передачи аргументов корневой командой; `curl --silent --show-error --fail http://127.0.0.1:4173/` получил HTML
  TMA entry point. Сервер остановлен, публикация не выполнялась.
- `npm run start:https -- --host 127.0.0.1 --port 4174 --strictPort` — не стартовал: `vite-plugin-mkcert` получил
  HTTP 403 при запросе `https://api.github.com/repos/FiloSottile/mkcert/releases/latest`. Запуск выполнялся вне
  sandbox; проверку блокирует источник бинарного файла mkcert. Скрипт и mkcert-конфигурация сохранены.

### Остаток и следующий шаг

S01 остаётся незавершённой до успешной проверки `start:https` и HTTPS-маршрутизации. При повторе проверить запуск
mkcert, затем повторить форматирование, lint, typecheck, build, `git diff --check` и обновить этот журнал.
S02 не начинать до выполнения критериев S01.

## 2026-09-24 — S01: приёмка HTTPS

Владелец подтвердил, что запустил локально и HTTPS через mkcert работает. С учётом этого подтверждения критерии
S01 приняты; повторная загрузка mkcert из моей среды не потребовалась. Локальный публичный туннель не заявлен.

## 2026-09-24 — S02: Tailwind и минимальные дизайн-токены

### Выполнено

- Добавлен `frontend/packages/tokens/` с машиночитаемыми цветами, ролями обеих тем, отступами, размерами текста и
  скруглениями. TMA подключает пакет как npm workspace; при запуске токены становятся CSS custom properties,
  Tailwind v4 использует их в теме. Значения хранятся без привязки к браузерным компонентам.
- Реализованы семантические цвета фона, поверхности, текста, вторичного текста, акцента, ошибки и границы.
  Telegram theme parameters имеют приоритет, локальные значения тем служат безопасным fallback.
- Mock Telegram theme можно просмотреть через `?theme=light` и `?theme=dark`; в prod mock не включается.
- Каркас оформлен Tailwind. Добавлены `Button`, `TextField` с подписью/ошибкой и `Card`; размеры учитывают узкий
  экран, длинные строки переносятся, `:focus-visible` имеет контрастную обводку. Полная дизайн-система не создавалась.
- Текущий экран сохранён как нейтральный foundation, добавлены состояния/примеры базовых контролов.
- npm не поддержал протокол `workspace:*`; зависимость пакета задана версией `*`, разрешаемой в локальный workspace.
- Фактическое время инструментально не измерялось.

### Проверки

- `npm install --package-lock-only --ignore-scripts --offline` — успешно, обновлён корневой lock-файл, 0 уязвимостей.
- `npm install --ignore-scripts --offline` — успешно, установлен локальный workspace-пакет токенов, 0 уязвимостей.
- `npm run format` — успешно.
- `npm run lint` — успешно.
- `npm run typecheck` — успешно.
- `npm run build` — успешно; Vite собрал production frontend.
- `npm run format:check` — успешно.
- Визуально проверены `http://127.0.0.1:4173/?theme=light` и `?theme=dark` на ширине 360 px: темы передают заданные роли, прокрутки по горизонтали нет; длинный текст переносится, клавиатурный фокус имеет видимую обводку.
- Снимки локального предпросмотра: `.playwright-mcp/s02-light.png` и `.playwright-mcp/s02-dark.png`.
- Playwright на итоговых загрузках не зафиксировал ошибок приложения; видны два штатных предупреждения React Router о будущих флагах v7.
- `git diff --check` — успешно.

### Остаток и следующий шаг

S02 принята. Следующий шаг — [S03: контракт встреч в TypeSpec](../tasks/03-typespec-contract.md). Токены минимальны;
React Native-компоненты и полная дизайн-система остаются за границами этой задачи.

## 2026-09-24 — S03: контракт встреч в TypeSpec (в работе)

### Выполнено

- Подготовлен `contracts/main.tsp` с моделями игр, участия, Telegram-сессии и ошибок; описаны список, детали,
  создание, частичное изменение, запись, выход, удаление участника и отмена. Запись организатора представлена
  отдельно от владения игрой.
- Добавлены npm-команды генерации OpenAPI и типов TypeScript, API workspace и точка импорта клиента в TMA.
  Добавлена проверка повторного байтового результата генерации.
- Записаны ограничения полей, пагинация, UTC, поведение полной/отменённой игры, идемпотентность и транзакционная
  семантика конкурентной записи в [`game-api-contract.md`](game-api-contract.md).
- Фактическое время — около 5 минут по времени инструментальных отметок.

### Проверки и блокировка

- `npm install --save-dev @typespec/compiler @typespec/http @typespec/openapi3 openapi-typescript && npm install openapi-fetch --workspace @picklehub/api`
  — registry `registry.npmjs.org` вернул HTTP 403 до установки пакетов, включая повтор с запросом расширенного
  сетевого доступа.
- `npm install --registry=https://artifactory.raiffeisen.ru/artifactory/api/npm/npm/ --save-dev @typespec/compiler @typespec/http @typespec/openapi3 openapi-typescript`
  — HTTP 404 для `@typespec/compiler`; `npm install --offline --save-dev @typespec/compiler @typespec/http @typespec/openapi3 openapi-typescript`
  — `ENOTCACHED`.
  Зависимости и lock-файл пока не обновлены, поскольку npm не разрешил получить пакеты.
- `./node_modules/.bin/prettier --write package.json frontend/tg/package.json frontend/tg/src/components/App.tsx frontend/packages/api/package.json frontend/packages/api/src/index.ts llm/_docs/game-api-contract.md contracts/check-generated.mjs`
  — успешно для изменённых JSON, TS/JS и Markdown файлов.
- `npm run format:check` — успешно.
- `node --check contracts/check-generated.mjs` — успешно.
- Prettier check изменённых файлов и `git diff --check` — успешно.
- `npm run lint` — неуспешно: API workspace и сгенерированные типы ещё недоступны; импорт клиента получает
  error type и нарушает `no-unsafe-*`.
- `npm run typecheck` и `npm run build` — неуспешно по той же причине: TypeScript не находит `@picklehub/api`.
- TypeSpec compilation, OpenAPI generation, повторная генерация, client import verification и проверка контрактных
  схем не запускались из-за недоступных зависимостей; их успешность не заявляется.

### Остаток

Добавить зависимости TypeSpec/OpenAPI/client и обновить корневой lock-файл, сгенерировать и закоммитить OpenAPI и
клиент, затем выполнить компиляцию, проверку схем/повторной генерации, lint, typecheck и build. Приёмка S03 не
пройдена; S04 не начинать.

## 2026-09-24 — S03: продолжение, проверка доступности генераторов

### Выполнено

- Повторно сверены требования S03, решения MVP и рабочее состояние файлов контракта. Незавершённые критерии
  прежние: нет зависимостей генерации, OpenAPI и клиент не созданы, проверка импортируемости не пройдена.
- Попытки установки зависимостей повторены в текущей сессии; изменений `package.json` и lock-файла не произошло.
- Фактическое время этой короткой сессии — около 2 минут по инструментальным отметкам.

### Проверки и блокировка

- `npm install --save-dev @typespec/compiler @typespec/http @typespec/openapi3 openapi-typescript` — HTTP 403
  от `registry.npmjs.org`, повторено вне sandbox с тем же результатом.
- `npm install --offline --save-dev @typespec/compiler @typespec/http @typespec/openapi3 openapi-typescript` —
  `ENOTCACHED`; npm-кэш не содержит метаданных TypeSpec compiler.
- Установка из корпоративного Artifactory ранее в этой задаче завершилась HTTP 404 для `@typespec/compiler`;
  повторный запрос метаданных в этой сессии не вернул версию.
- Компиляция TypeSpec, генерация OpenAPI/client, проверка схем и импортируемости, а также lint, typecheck и build
  остаются невыполненными: обязательные пакеты отсутствуют. Их успешность не заявляется.

### Остаток

S03 остаётся в работе; S04 не начинать. Возобновить установку зависимостей, когда один из npm-реестров будет
доступен; затем сгенерировать артефакты и выполнить полный набор проверок из задачи S03.

## 2026-09-24 — S03: контракт и клиент сгенерированы (выполнено)

### Выполнено

- Владелец установил TypeSpec/OpenAPI/client-зависимости. При первой компиляции исправлены UUID scalar и модели
  ошибок: HTTP статус теперь задаётся через `@statusCode` на поле ответа.
- Контракт ограничивает UUID, число участников (0–32), значения кодов ошибок, поля игры и ключ идемпотентности.
  Правила организатора без места, конкурентного последнего места, переходов `SCHEDULED`/`FULL`, курсоров и
  повторов команд зафиксированы в [`game-api-contract.md`](game-api-contract.md).
- OpenAPI и TypeScript API schema генерируются из TypeSpec и хранятся как производные файлы. Генератор клиента
  форматирует схему Prettier; TMA импортирует типизированный клиент. Добавлена декларация `VITE_API_URL` для
  строгой проверки переменных среды.
- Статус S03 обновлён на «выполнена». Фактическое время этой сессии — около 7 минут по инструментальным
  отметкам.

### Проверки

- `npm run contracts:generate` — успешно: TypeSpec 1.16.0 создал OpenAPI 3.0 и openapi-typescript 7.13.0 создал
  клиентскую схему.
- `npm run contracts:check` — успешно: два последовательных прогона идентичны по байтам; отслеживаемые
  артефакты не содержат diff.
- `npm run format:check` — успешно.
- `npx prettier --check package.json frontend/packages/api/package.json frontend/packages/api/src/index.ts frontend/packages/api/src/generated/schema.ts frontend/tg/src/vite-env.d.ts contracts/check-generated.mjs llm/_docs/game-api-contract.md llm/_docs/ai-development-log.md` — успешно.
- `npm run lint` — успешно после добавления типа `VITE_API_URL`.
- `npm run typecheck` — успешно.
- `npm run build` — успешно; Vite собрал production TMA.
- `git diff --check` — успешно.

### Ограничения

- Проверка конкурентной записи описана как контрактная транзакционная гарантия; работа настоящей базы и гонки
  будет проверена в backend шагах S12–S14.
- Визуальные тесты и backend-тесты не относятся к S03 и не запускались.

### Следующий шаг

S03 принята. Следующая отдельная задача — S04, подключение TanStack Query и HTTP-моков; автоматически не начиналась.
