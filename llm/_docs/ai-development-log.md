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
