# Журнал AI-разработки

## 2026-10-27 — раскрываемая карточка события

Активная задача: прямой запрос пользователя объединить PlankEvent и Card.
Добавлен EventCard с независимым состоянием раскрытия, кнопкой с aria-expanded
и aria-controls. Подключён на главной и в обеих вкладках списка событий.
PlankEvent показывает количество участников через разделитель, поддерживает
кнопку раскрытия и прежний режим ссылки. Контракты не изменены.

Проверки:

- `npx prettier --check frontend/tg/src/components/PlankEvent/PlankEvent.tsx frontend/tg/src/components/EventCard/EventCard.tsx frontend/tg/src/pages/EventList/ui/TabContentAll/TabContentAll.tsx frontend/tg/src/pages/EventList/ui/TabContentMySelf/TabContentMySelf.tsx frontend/tg/src/pages/Main/ui/Main.tsx` — успешно.
- `npm run lint` — успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — остановлены существующими ошибками:
  неиспользуемые widgetVariants/glowVariants в ds/web/src/widgets/base-widget.tsx;
  неполный объект UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.
- Браузерная проверка не выполнена; Playwright в корневом node_modules отсутствует.

Предыдущий журнал и каталог llm были удалены в рабочем дереве до этой задачи.
Этот файл содержит только новую запись; прежние документы не восстановлены.

## 2026-10-27 — компонент EventDetails

Активная задача: согласованный план отдельного компонента деталей события и Storybook,
с уточнением пользователя показывать имя под каждым аватаром.
Добавлен frontend/tg/src/components/EventDetails: обложка с градиентом и fallback,
sticky-блок стоимости/записи с настраиваемым top, три вкладки, состав и очередь
с именами, инициалами и DUPR (при отсутствии — -/-), заглушки результатов.
Запись управляется родителем через callback join/waitlist и состояния joined/waitlisted/pending.
Маршруты, Card, API и контракты не менялись. Добавлены 9 Storybook-сценариев
и локальная SVG-иллюстрация корта с вымышленными данными.
Storybook подключает CSS-источник нового компонента; allowImportingTsExtensions
в его tsconfig позволяет использовать существующие helpers Mini App с импортами .ts.
Общие документы llm/00-project-overview.md и llm/README.md отсутствуют в рабочем дереве;
прочитан доступный журнал предыдущей задачи. Удалённые документы не восстановлены.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails ds/storybook/src/EventDetails.stories.tsx ds/storybook/.storybook/event-details.css ds/storybook/.storybook/preview.tsx ds/storybook/tsconfig.json` — успешно.
- `npx eslint frontend/tg/src/components/EventDetails ds/storybook/src/EventDetails.stories.tsx ds/storybook/.storybook/preview.tsx --max-warnings 0` — успешно.
- `npm run lint` — успешно.
- `npm run contracts:check` — успешно, генерация воспроизводима.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 9/9 успешно в Chromium; проверены callbacks, блокировка действий, имена, отсутствие рейтинга, очередь, результаты, клавиатурные вкладки и sticky/отсутствие переполнения на ширинах 320/430 px. Первый запуск заблокирован EPERM локального порта; повтор выполнен с разрешением вне sandbox. В тестах добавлено ожидание анимации вкладок после начальных преждевременных проверок видимости.
- `npm run ds:build` — успешно (предупреждения Vite о use client и крупных chunks).
- `npm run typecheck` и `npm run build` — существующие ошибки неиспользуемых widgetVariants/glowVariants в base-widget.tsx и неполного UseQueryResult в EventListPage.tsx.
- `npm run ds:lint` — существующие неиспользуемые параметры/переменные в Header.tsx и base-widget.tsx.
- `npm run ds:typecheck` — остановлен существующими ошибками base-widget.tsx.
- `npm run typecheck --workspace @picklehub/storybook` — после настройки импортов остаются только существующие ошибки Header.stories.tsx и base-widget.tsx; ошибок EventDetails нет.
- `git diff --check` — успешно перед записью журнала; повторная проверка выполнена после записи.

## 2026-10-27 — закрепление вкладок EventDetails

По уточнению пользователя вкладки объединены с блоком стоимости и записи в один
sticky-контейнер внутри GlassTabs. Высота блоков определяется естественной раскладкой,
без фиксированных смещений и ResizeObserver; stickyTop применяется ко всей группе.
Тест прокрутки дополнен проверкой расположения вкладок сразу под блоком записи
на ширинах 320 и 430 px.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx` — успешно.
- `npx eslint frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx --max-warnings 0` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 9/9 успешно; после EPERM локального порта повторено вне sandbox.
- `npm run ds:build > /private/tmp/picklehub-eventdetails-build.log 2>&1` — успешно.
- `npm run contracts:check > /private/tmp/picklehub-eventdetails-contracts.log 2>&1` — успешно.
- `npm run typecheck` — прежние ошибки base-widget.tsx и EventListPage.tsx; новых ошибок нет.
- `git diff --check` — успешно.

## 2026-10-27 — переход Card → EventDetails

Кнопка действия Card стала ссылкой на /event/:eventId/details с передачей полного
GameEvent через router state (подписи Подробнее/Присоединиться/Результаты сохранены).
Новая EventDetailsPage показывает именно переданные сведения; прямой URL использует
существующий mock-список tournaments, неизвестный id показывает «Событие не найдено».
Есть возврат к списку и сброс прокрутки; stickyTop=88 соответствует отступу шапки Mini App.
Маршрут /event/:eventId с API игр сохранён. Непредоставленные составы не выдумываются:
при ненулевом количестве и пустом массиве отображается сообщение о недоступности списка.
onJoin стал необязательным; без обработчика запись отключена и страница объясняет это.

Добавлены три браузерные истории перехода: данные изменённой Card, прямая ссылка,
неизвестный id. Storybook получил vite/client для изображений и CSS-источники Card/страницы.
В оптимизации Storybook/Vitest исключён lucide-react: Mini App и Storybook используют
разные версии, иначе тест получал версию без Podium. react-router-dom предварительно
оптимизируется в Vitest для предотвращения перезагрузки во время теста.

Проверки:

- `npm run lint` — успешно.
- `npx prettier --check frontend/tg/src/components/Card/Card.tsx frontend/tg/src/components/EventDetails/EventDetails.tsx frontend/tg/src/pages/EventDetails frontend/tg/src/navigation/routes.tsx ds/storybook/src/EventDetailsNavigation.stories.tsx ds/storybook/src/vite-env.d.ts ds/storybook/.storybook/event-details.css ds/storybook/.storybook/main.ts ds/storybook/vitest.config.ts` — успешно.
- `npx eslint frontend/tg/src/components/Card/Card.tsx frontend/tg/src/components/EventDetails frontend/tg/src/pages/EventDetails frontend/tg/src/navigation/routes.tsx ds/storybook/src/EventDetailsNavigation.stories.tsx ds/storybook/src/vite-env.d.ts ds/storybook/.storybook/main.ts ds/storybook/vitest.config.ts --max-warnings 0` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx src/EventDetailsNavigation.stories.tsx` — 12/12 успешно вне sandbox. Первые запуски выявили конфликт версий иконок, преждевременную проверку видимости при анимации и отсутствие блокировки кнопки без callback; исправлено.
- `npm run contracts:check > /private/tmp/picklehub-eventdetails-navigation-contracts.log 2>&1` — успешно.
- `npm run ds:build > /private/tmp/picklehub-eventdetails-navigation-build.log 2>&1` — успешно, включая повторную сборку после финальных правок.
- `npm run typecheck` — прежние ошибки base-widget.tsx и EventListPage.tsx.
- `npm run typecheck --workspace @picklehub/storybook` — после добавления vite/client только прежние ошибки Header.stories.tsx и base-widget.tsx.
- `npm run build > /private/tmp/picklehub-eventdetails-navigation-tg-build.log 2>&1` — прежние ошибки типов блокируют сборку Mini App.
- `git diff --check` — успешно.

## 2026-10-27 — нижнее положение футера EventDetailsPage

Общий Footer уже подключён в App с position: fixed. В frontend/tg/src/index.css
нижний отступ .tg-footer теперь вычисляет safe area самостоятельно, без зависимости
от --footer-safe-bottom родительской .tg-shell. Это сохраняет bottom при использовании
футера вне оболочки. EventDetailsPage сохраняет существующий pb-32.

Проверки:

- `npx prettier --check frontend/tg/src/index.css` — успешно.
- `npm run lint` — успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — блокируются прежними ошибками
  widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `node --input-type=module` (inline Playwright/Chromium, CSS .tg-footer из index.css,
  setContent без .tg-shell) — успешно: ширины 320/430, safe area 0/34px,
  scrollY 0/1400; нижняя граница равна высоте viewport минус 12px и safe area.
  После запрета запуска Chromium sandbox повторено с разрешением вне sandbox.
  Проверена изолированная CSS-раскладка, не полный Telegram runtime.
- `git diff --check` — успешно.

## 2026-10-27 — смещение sticky-блока при переключении вкладок

В EventDetails панели остаются смонтированными в одной ячейке CSS Grid. Неактивные
панели скрыты через visibility: hidden и не принимают клики. Высота области равна
самой высокой панели: переключение на короткие результаты больше не сокращает
страницу и не сдвигает прокрутку/закреплённую кнопку. На коротких вкладках остаётся
свободное место. Общий GlassTabs не менялся.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx` — успешно.
- `npx eslint frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx --max-warnings 0` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 9/9 успешно;
  после EPERM локального порта повторено вне sandbox. StickyHeader проверяет
  переключение всех вкладок после прокрутки: scrollTop, scrollHeight и положение
  блока неизменны, в дереве доступности видна одна tabpanel.
- `npm run typecheck` — прежние ошибки base-widget.tsx и EventListPage.tsx.
- `npm run contracts:check > /private/tmp/picklehub-tabs-contracts.log 2>&1` — успешно.
- `npm run build > /private/tmp/picklehub-tabs-build.log 2>&1` — прежние ошибки типов блокируют сборку.
- `git diff --check` — успешно.

## 2026-10-28 — EventDetailsPage без общей шапки и боковых отступов

По прямому запросу пользователя App использует точное совпадение маршрута
/event/:eventId/details: скрывает Header, убирает px-3 оболочки и pt-22 main.
HashRouter перенесён над AppContent для useMatch. На EventDetailsPage stickyTop=0.

Проверки:

- `npx prettier --check frontend/tg/src/components/App.tsx frontend/tg/src/pages/EventDetails/EventDetailsPage.tsx` — успешно.
- `npm run lint` — успешно.
- `npm run contracts:check` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetailsNavigation.stories.tsx` — 3/3 успешно после повторного запуска вне sandbox (первый запуск: EPERM локального порта). Проверяют страницу и навигацию, не полную оболочку Telegram.
- `npm run typecheck` и `npm run build` — блокируются ранее известными ошибками неиспользуемых widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — общий градиентный фон страниц

По запросу пользователя body и .tg-shell используют единый --ph-page-background:
мягкие бирюзовое и фиолетовое свечения поверх синего диагонального градиента.
Цвета взяты из токенов EIN компонентов, основа — тематический --ds-background.
Фон закреплён относительно viewport для длинных страниц.

Проверки:

- `npx prettier --write frontend/tg/src/index.css` и `npx prettier --check frontend/tg/src/index.css` — успешно.
- `npm run lint` — успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.
- Визуальная проверка в Telegram не выполнялась; изменение только CSS фона, новые тесты не добавлены.

## 2026-10-28 — прозрачный фон контента вкладок EventDetails

Удалён bg-ds-background у article EventDetails: панели вкладок теперь показывают
общий градиент страницы. Сами GlassTabsContent уже прозрачны.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx` — успешно.
- `npm run lint` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 9/9 успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — Icon Tabs и вкладка «Игра» в EventDetails

Вкладки оформлены по примеру Components/Tabs → Icon Tabs: иконки и подпись
активного пункта на узких экранах, все подписи от sm. Явные aria-label сохраняют
доступные имена скрытых подписей. Добавлена вкладка «Игра» с pickleball-icon.svg
и сообщением о недоступности информации. Фон списка вкладок прозрачный;
непрозрачная подложка sticky-группы перенесена только на блок записи.
Тест клавиатуры учитывает новую вкладку, проверка стабильной прокрутки включает «Игру».

Проверки:

- `npx prettier --write frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx` — успешно.
- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx` — успешно после финальных изменений.
- `npm run lint` — успешно, включая повтор после финальных изменений.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 9/9 успешно. Первый запуск выявил ожидаемое изменение клавиатурного порядка; тест дополнен проверкой «Игры». После финальных изменений повтор вне sandbox из-за запрета локального сервера — 9/9.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — действия организатора и оформление EventDetails

По уточнению пользователя добавлен только интерфейс: под жёлтой кнопкой один ряд
«Редактировать» и × с красной обводкой, без обработчиков операций. Видимость:
непустой currentUserId совпадает с optional organizerId в GameEvent. Страница
получает текущего пользователя из Redux. Демоданным организатор не назначается:
при отсутствии organizerId кнопок нет. Истории навигации обёрнуты в Redux Provider.

Обложка скруглена снизу; маска изображения и его подложки плавно раскрывает их
от прозрачного верха. У блока стоимости удалён непрозрачный фон.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx frontend/tg/src/pages/EventDetails/EventDetailsPage.tsx frontend/tg/src/pages/EventList/types.ts ds/storybook/src/EventDetails.stories.tsx ds/storybook/src/EventDetailsNavigation.stories.tsx` — успешно.
- `npm run lint` — успешно.
- `npx eslint ds/storybook/src/EventDetails.stories.tsx ds/storybook/src/EventDetailsNavigation.stories.tsx --max-warnings 0` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx src/EventDetailsNavigation.stories.tsx > /private/tmp/picklehub-organizer-tests.log 2>&1` — 15/15 успешно вне sandbox после EPERM. Проверены организатор, другой пользователь, анонимный пользователь и расположение кнопок. Первоначально импорт session подтягивал неподдержанный Storybook alias; заменён прямым Redux selector.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — типографика вкладки «Основное»

Значения сведений и описание увеличены до text-base (16px), подписи dt и пояснение
формата — text-sm (14px), заголовок описания — text-lg (18px) semibold.
Для читаемости основного текста используется leading-relaxed.

Проверки:

- `npx prettier --write frontend/tg/src/components/EventDetails/EventDetails.tsx` — успешно.
- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx` — успешно.
- `npm run lint` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 12/12 успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — общая обложка событий 03-mobile-equipment

Изображение output/imagegen/event-details-mobile/03-mobile-equipment.png скопировано
без изменений в frontend/tg/src/assets и назначено обложкой EventDetails по умолчанию.
Все события на странице деталей и примеры Storybook теперь используют эту обложку.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx` — успешно.
- `npm run lint` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 12/12 успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — смещение обложки вверх

EventDetails: objectPosition изображения = center calc(50% - 80px).
Рамка обложки, маска и положение текста сохранены.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx` — успешно.
- `npm run lint` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 12/12 успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — верхний padding обложки 100px

В header EventDetails pt-40 заменён на pt-[100px].

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx` — успешно.
- `npm run lint` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 12/12 успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — сброс смещения обложки

EventDetails: objectPosition возвращён в center, смещение -80px убрано.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx` — успешно.
- `npm run lint` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 12/12 успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — убрать вертикальный скролл вкладок EventDetails

У GlassTabsList задан overflow-y-hidden: overflow-x-auto больше не включает
автоматическую вертикальную прокрутку. Горизонтальная прокрутка сохранена.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx` — успешно.
- `npm run lint` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 12/12 успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — ссылки Яндекс Карт и Google Maps у места проведения

В EventDetails рядом с названием площадки добавлены две иконки-ссылки 44×44px
с доступными названиями. Новый VenueMapLinks формирует HTTPS-ссылки поиска
https://yandex.ru/maps/?text= и https://www.google.com/maps/search/?api=1&query=.
Используется optional location.address (также отображается под названием), иначе
location.name. Адрес кодируется encodeURIComponent, реальные адреса в демоданные
не добавлялись. Ключи API, геокодирование и определение геолокации не используются.

По документации HTTPS-ссылки поддерживают открытие установленного приложения
системой, иначе веб-карту; на Яндексе ОС может предложить выбор приложения.
Принудительное обнаружение установки из браузера не реализуется. Поведение зависит
от настроек ОС/Telegram; физические Android/iOS не проверены.
Источники: https://developers.google.com/maps/documentation/urls/get-started
и https://yandex.ru/dev/yandex-apps-launch-maps/doc/ru/ (раздел веб-версии).

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails frontend/tg/src/pages/EventList/types.ts ds/storybook/src/EventDetails.stories.tsx` — успешно.
- `npm run lint` — успешно.
- `npx eslint ds/storybook/src/EventDetails.stories.tsx --max-warnings 0` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx src/EventDetailsNavigation.stories.tsx > /private/tmp/picklehub-organizer-tests.log 2>&1` — 16/16 успешно. Проверены ссылки по названию и адресу со спецсимволами; проверка видимости адреса ожидает завершения анимации вкладки.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — дата и время рядом со стоимостью EventDetails

Дата перенесена из вкладки «Основное» в блок стоимости через вертикальный
GlassSeparator; время отображается под датой. Существующая строка date разделяется
перед временем после запятой. Если время отсутствует, отображается «Время не указано».
Данные и контракты не менялись.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx` — успешно.
- `npm run lint` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 13/13 успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — бейджи EventDetails из DS

У бейджей статуса и DUPR удалены локальные переопределения фона и текста.
Оба используют стандартное оформление GlassBadge из @picklehub/ui-web.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx` — успешно.
- `npm run lint` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx` — 13/13 успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `git diff --check` — успешно.

## 2026-10-28 — вертикальные метрики Seenonim через @font-face

По запросу пользователя во всех пяти начертаниях frontend/tg/src/index.css заданы
ascent-override: 80.5%, descent-override: 14.5%, line-gap-override: 10%.
Разность ascent/descent соответствует cap-height 660/1000 em; сумма метрик
сохранена 1.05em. Файлы шрифта не изменены. Дескрипторы описаны в
https://www.w3.org/TR/css-fonts-4/#font-metrics-override-desc.
Удалённые пользователем обзор проекта, README и DS03 прочитаны через git show HEAD,
в рабочее дерево не восстановлены.

Проверки:

- `npx prettier --check frontend/tg/src/index.css` — успешно.
- `npm run lint` — успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки widgetVariants/glowVariants
  в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `node /private/tmp/picklehub-font-metrics-check.mjs` — успешно вне sandbox после
  запрета запуска Chromium: 15 сочетаний (веса 100/300/400/600/700, размеры 12/16/24px).
  На изолированном образце с line-height: 1.5 базовая линия опущена на 2/2/3px
  с учётом округления браузера, высоты двухстрочных блоков не изменились.
  Просмотрен скриншот /private/tmp/picklehub-font-metrics.png с кириллицей,
  диакритикой, нижними выносными элементами, латиницей и цифрами.
  Проверка полного приложения и Telegram на устройствах не выполнялась.
- `git diff --check` — успешно.

## 2026-10-28 — фон активного Tabs

В общем GlassTabsTrigger белёсая заливка и тяжёлая тень заменены полупрозрачным
градиентом cyan/blue/purple (25%) из текущей EIN-палитры. Добавлены мягкий внутренний
контур и компактная тень; убран белый градиентный блик. Изменение действует для
Storybook и всех потребителей GlassTabs. Удалённые обзор и README прочитаны через HEAD.

Проверки:

- `npx prettier --check ds/web/src/liquid-glass/glass-tabs.tsx` — успешно.
- `npx eslint ds/web/src/liquid-glass/glass-tabs.tsx --max-warnings 0` — успешно.
- `npm run ds:lint` — существующие unused-vars в Header.tsx и base-widget.tsx.
- `npm run ds:typecheck > /private/tmp/picklehub-tabs-typecheck.log 2>&1` — существующие TS6133 для widgetVariants/glowVariants в base-widget.tsx.
- `npm run ds:build > /private/tmp/picklehub-tabs-ds-build.log 2>&1` — успешно.
- `npm test --workspace @picklehub/storybook -- src/Tabs.stories.tsx src/EventDetails.stories.tsx` — 16/16 успешно вне sandbox; первоначальный запуск остановлен запретом локального порта (EPERM).
- `npm run contracts:check` — успешно.
- `git diff --check` — успешно.

## 2026-10-28 — переход на главную из Footer

LiquidNavbar теперь вызывает onChange и при повторном выборе текущего пункта:
после перехода в событие из контента домик сохранял внутренний индекс 0 и его
нажатие игнорировалось. Footer передаёт active на основе pathname, чтобы профиль,
создание события и возврат по истории синхронизировали выделение.
Добавлены два интеграционных сценария MemoryRouter с настоящим Footer.
В существующих тестах LiquidNavbar ожидаемое название Home приведено к текущему
названию кнопки «Главная» (ссылки Home в отдельном примере не менялись).

Проверки:

- `npx prettier --check frontend/tg/src/components/Footer.tsx ds/web/src/components/ui/liquid-glass-navbar.tsx ds/storybook/src/FooterNavigation.stories.tsx` — успешно.
- `npx eslint frontend/tg/src/components/Footer.tsx ds/web/src/components/ui/liquid-glass-navbar.tsx ds/storybook/src/FooterNavigation.stories.tsx --max-warnings 0` — успешно.
- `npx prettier --check ds/storybook/src/LiquidNavbar.stories.tsx` — успешно.
- `npx eslint ds/storybook/src/LiquidNavbar.stories.tsx --max-warnings 0` — успешно.
- `npm test --workspace @picklehub/storybook -- src/FooterNavigation.stories.tsx` — 2/2 успешно вне sandbox.
- `npm test --workspace @picklehub/storybook -- src/LiquidNavbar.stories.tsx` — 11/11 успешно вне sandbox.
- `npm run contracts:check > /private/tmp/picklehub-footer-contracts.log 2>&1` — успешно.
- `npm run ds:build > /private/tmp/picklehub-footer-build.log 2>&1` — успешно.
- `npm run typecheck > /private/tmp/picklehub-footer-types.log 2>&1` — прежние ошибки base-widget.tsx (widgetVariants/glowVariants) и EventListPage.tsx (UseQueryResult).
- `git diff --check` — успешно.

## 2026-10-28 — закреплённые действия формы события

По запросу владельца в EventForm оставлены три основных действия: «Назад»,
«Вперед», «Начать сначала». Кликабельные breadcrumbs убраны. Заголовок и текущий
шаг вынесены над карточкой, под Header. Действия через portal размещены в слоте
Footer, над основной навигацией; submit связан с формой через form/id.
Контейнер действий прозрачный. Добавлен нижний отступ контента для доступа
к последним полям. Общая форма сохраняет это поведение и при редактировании.
Подтверждение сброса и проверки полей сохранены. Удалённые обзор, README и S06
прочитаны через git show HEAD без восстановления файлов.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventForm/EventForm.tsx frontend/tg/src/components/Footer.tsx frontend/tg/src/pages/EventCreate/ui/EventCreate/EventCreate.tsx frontend/tg/src/pages/EventEdit/ui/EventEditPage/EventEditPage.tsx frontend/tg/src/index.css` — успешно.
- `npm run lint` — успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки неиспользуемых widgetVariants/glowVariants в base-widget.tsx и UseQueryResult в EventListPage.tsx.
- `node /private/tmp/picklehub-event-form-check.mjs` — успешно вне sandbox: переходы вперёд/назад, валидация, сохранение ввода, подтверждённый сброс, очистка действий при уходе со страницы; положение над Footer и доступность последнего поля при прокрутке на ширинах 320/375/768px. Первый запуск заблокирован sandbox; первый браузерный прогон потребовал уточнения селектора адреса, включавшего текст ошибки.
- `git diff --check` — успешно.

## 2026-10-28 — карточки выбора типа события

Первый шаг EventForm вынесен из общей GlassCard в две отдельные квадратные
карточки Play on / Тренировка. Используется GlassWidgetBase из показателей
профиля: зелёное и синее свечение. Внутри вертикально отцентрированы иконка,
белое название и серое пояснение. Выбор остаётся нативной радиогруппой,
выбранный вариант выделяется рамкой, клавиатурный фокус — контуром.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventForm/EventForm.tsx` — успешно.
- `npm run lint` и `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки base-widget.tsx (widgetVariants/glowVariants) и EventListPage.tsx (UseQueryResult).
- `node /private/tmp/picklehub-event-form-check.mjs` — успешно вне sandbox: квадратные карточки на 320/375/768px, выбор обоих типов через карточку, переходы, валидация, сброс, закреплённые действия. Просмотрен скриншот 320px после завершения стартовой загрузки. Первоначальный force-click скрытого radio заменён пользовательским нажатием на карточку.
- `git diff --check` — успешно.

### Уточнение: максимальная ширина карточек типа события

Группа из двух карточек отцентрирована через mx-auto и ограничена 412px
(две карточки по 200px + промежуток 12px). На узких экранах карточки сжимаются.
`npx prettier --check frontend/tg/src/components/EventForm/EventForm.tsx` и
`npx eslint frontend/tg/src/components/EventForm/EventForm.tsx --max-warnings 0` — успешно.
`node /private/tmp/picklehub-event-form-check.mjs` — успешно: дополнительно проверена
ширина каждой карточки ≤200px на экранах 320/375/768px. `git diff --check` — успешно.

## 2026-10-28 — вертикальный центр первого шага и недоступный сброс

Высота области карточек рассчитывается по фактическому положению текста и
закреплённых кнопок, обновляется при resize и изменении размеров через
ResizeObserver. Карточки выровнены по центру этой области. На первом шаге
«Начать сначала» отключена аналогично «Назад».

Проверки:

- `npx prettier --write frontend/tg/src/components/EventForm/EventForm.tsx` — успешно.
- `npm run lint`, `npx eslint frontend/tg/src/components/EventForm/EventForm.tsx --max-warnings 0` и `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки base-widget.tsx (widgetVariants/glowVariants) и EventListPage.tsx (UseQueryResult).
- `node /private/tmp/picklehub-event-form-check.mjs` — успешно вне sandbox: центр карточек совпадает с серединой между нижней границей текста и верхом кнопок (допуск 2px) на 320/375/768px; максимальная ширина 200px, сброс отключён на первом шаге, переходы, валидация и сброс на последующих шагах работают. Первый прогон обнаружил особенности min-height у fieldset; центрирование перенесено на внешний div и проверено повторно.
- `git diff --check` — успешно.

## 2026-10-28 — карточки форматов игры и толстая рамка выбора

Второй шаг Play on использует те же квадратные карточки, что первый: Американо,
Мексикано и Round Robin с иконками и краткими пояснениями. Общий локальный
ChoiceCards сохраняет нативные radio, центрирование и ограничение 200px;
третья карточка центрируется во втором ряду. При нехватке высоты доступна
прокрутка. По уточнениям владельца рамка выбранной карточки увеличена до 4px
на обоих шагах.

Проверки:

- `npx prettier --check frontend/tg/src/components/EventForm/EventForm.tsx` — успешно.
- `npm run lint` и `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — прежние ошибки base-widget.tsx (widgetVariants/glowVariants) и EventListPage.tsx (UseQueryResult).
- `node /private/tmp/picklehub-event-form-check.mjs` — успешно вне sandbox: выбор всех трёх форматов, квадратная форма и ширина ≤200px, переходы, валидация, сброс, проверки первого шага и закреплённых действий. Последующее изменение толщины рамки проверено форматтером и линтером.

Уточнение владельца: итоговая толщина выбранной рамки — 3px вместо 4px.

## 2026-10-28 — углы выбранной карточки

В ChoiceCards радиусы внутреннего блика и внутренней тени согласованы с рамкой
3px: 13px и 12px соответственно при внешнем радиусе 16px. Убран просвет между
рамкой и цветным бликом без изменения общего GlassWidgetBase.

Проверки: `npx prettier --check frontend/tg/src/components/EventForm/EventForm.tsx`,
`npx eslint frontend/tg/src/components/EventForm/EventForm.tsx --max-warnings 0`
и `node /private/tmp/picklehub-event-form-check.mjs` — успешно. Браузерная проверка
выполнена вне sandbox; просмотрен скриншот карточек 375px. `git diff --check` — успешно.

## 2026-10-28 — обводка карточек без изменения переносов

По уточнению владельца border заменён внутренним box-shadow: 3px у выбранной
карточки и 1px у остальных. Внешняя тень сохранена, border равен нулю в обоих
состояниях, поэтому выбор не меняет размеры содержимого. Промежуточное решение
с постоянной толщиной border заменено этим вариантом.

Проверки: `npx prettier --check frontend/tg/src/components/EventForm/EventForm.tsx`
и `npx eslint frontend/tg/src/components/EventForm/EventForm.tsx --max-warnings 0`
— успешно. `node /private/tmp/picklehub-event-form-check.mjs` — успешно вне sandbox:
ширина и высота каждого текста неизменны при выборе/снятии выбора на 320/375/768px,
остальные сценарии формы также проходят. В проверке центрирования после клика
восстановлен scrollTop=0, поскольку браузер прокручивал фокусируемый элемент.
`git diff --check` — успешно.

## 2026-10-28 — отмена ограничения высоты формы

По запросу владельца отменена последняя попытка ограничить высоту всей формы
до нижних кнопок и добавить внутреннюю прокрутку. Восстановлены прежняя прокрутка
страницы, нижний отступ и центрирование карточек. Карточки и обводка box-shadow
сохранены; дополнительный padding для компенсации border не применяется.
`npx prettier --write frontend/tg/src/components/EventForm/EventForm.tsx frontend/tg/src/index.css`
и `npx eslint frontend/tg/src/components/EventForm/EventForm.tsx --max-warnings 0` — успешно.


## 2026-10-29 — интервал GameEvent

По запросу владельца date/time заменены обязательными startAt/endAt (строки RFC 3339 UTC). Обновлены моки, Card, EventDetails и stories. Общий форматтер показывает локальную дату и диапазон времени, включая даты при переходе через полночь. В моках назначен демонстрационный интервал 09:00–13:00 UTC. Контракт API не изменён. Удалённые обзорные документы прочитаны из HEAD.

Проверки:

- `npx prettier --write frontend/tg/src/pages/EventList/types.ts frontend/tg/src/pages/EventList/mock.ts frontend/tg/src/pages/EventList/helpers/formatEventSchedule.ts frontend/tg/src/components/Card/Card.tsx frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx ds/storybook/src/EventDetailsNavigation.stories.tsx` — успешно.
- `npx prettier --check frontend/tg/src/pages/EventList/types.ts frontend/tg/src/pages/EventList/mock.ts frontend/tg/src/pages/EventList/helpers/formatEventSchedule.ts frontend/tg/src/components/Card/Card.tsx frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx ds/storybook/src/EventDetailsNavigation.stories.tsx` — успешно.
- `npx eslint frontend/tg/src/pages/EventList/types.ts frontend/tg/src/pages/EventList/mock.ts frontend/tg/src/pages/EventList/helpers/formatEventSchedule.ts frontend/tg/src/components/Card/Card.tsx frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx ds/storybook/src/EventDetailsNavigation.stories.tsx --max-warnings 0` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx src/EventDetailsNavigation.stories.tsx` — 2 файла, 16 тестов успешно.
- `npm run contracts:check` — успешно.
- `npm run typecheck` — не пройдено: существующие TS6133 в ds/web/src/widgets/base-widget.tsx:37,59 и TS2322 в frontend/tg/src/pages/EventList/ui/EventListPage/EventListPage.tsx:14.
- `npm run build` — не пройдено по тем же ошибкам TypeScript.
- `git diff --check` — успешно.

## 2026-10-29 — непрозрачный закреплённый блок EventDetails

По запросу владельца общий sticky-контейнер регистрации и табов получил bg-ds-background: прокручиваемое содержимое закрыто непрозрачным фоном, включая промежутки между кнопками и табами.

Проверки:
- `npx prettier --check frontend/tg/src/components/EventDetails/EventDetails.tsx` — успешно.
- `npx eslint frontend/tg/src/components/EventDetails/EventDetails.tsx --max-warnings 0` — успешно.
- `npm test --workspace @picklehub/storybook -- src/EventDetails.stories.tsx src/EventDetailsNavigation.stories.tsx` — 16 тестов успешно, включая StickyHeader.
- `npm run contracts:check` — успешно.
- `npm run typecheck` и `npm run build` — блокируются посторонними ошибками: неиспользуемые переменные base-widget.tsx, неполный QueryResult в EventListPage.tsx, отсутствующее обязательное timeSlots в моках GameEvent.
- `git diff --check` — успешно.

## 2026-10-29 — прозрачное закрепление EventDetails и исправление Storybook

Непрозрачный фон отменён по уточнению владельца. Контент EventDetails обрезается clip-path по нижней границе sticky-блока; граница обновляется при прокрутке окна/вложенного контейнера и изменении размеров. StickyHeader проверяет прозрачность и геометрию отсечения.

В Storybook устранены ошибки типов: добавлены timeSlots в демонстрационные GameEvent, stories Header приведены к текущей шапке без профиля/уведомлений. Из base-widget удалены неиспользуемые определения отключённых анимаций; прежние параметры не передаются в DOM. Визуальное поведение виджета сохранено.

Проверки:
- `npm run typecheck --workspace @picklehub/storybook` — успешно.
- `npm run ds:build` — успешно.
- `npm test --workspace @picklehub/storybook -- src/Header.stories.tsx src/EventDetails.stories.tsx src/EventDetailsNavigation.stories.tsx` — 18 тестов успешно.
- `npm run ds:test > /private/tmp/picklehub-storybook-tests.log 2>&1` — 189/191 успешно; остаются независимые расхождения calendar stories с текущей реализацией: AgendaCalendar сравнивает три маркера с ограниченным двумя событиями списком; Calendar ожидает линейный масштаб при текущих зависимых от size CSS-классах. Проверки не ослаблялись.
- `npx eslint frontend/tg/src/pages/EventList/mock.ts frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx ds/storybook/src/Header.stories.tsx ds/web/src/widgets/base-widget.tsx --max-warnings 0` — успешно.
- `npx prettier --check frontend/tg/src/pages/EventList/mock.ts frontend/tg/src/components/EventDetails/EventDetails.tsx ds/storybook/src/EventDetails.stories.tsx ds/storybook/src/Header.stories.tsx ds/web/src/widgets/base-widget.tsx` — успешно.
- `node /private/tmp/picklehub-storybook-check.mjs` — живая story StickyHeader открывается без ошибок console/pageerror; localhost:6006 возвращает HTTP 200.
- `git diff --check` — успешно.

Первый браузерный тест был заблокирован sandbox (listen EPERM); повтор выполнен вне sandbox успешно. Общий typecheck Mini App по-прежнему блокируется неполным QueryResult в EventListPage.tsx.

## 2026-10-29 — ошибка динамического импорта Lucide fingerprint

После сообщения владельца о fingerprint.js ошибка AlertDialog воспроизведена в Playwright блокировкой запросов **/*fingerprint*.js*: story показывает Failed to fetch dynamically imported module. Исключение lucide-react из optimizeDeps приводило к загрузке отдельных файлов иконок и делало всю story зависимой от такого запроса.

Версии lucide-react в @picklehub/ui-web и @picklehub/storybook выровнены с Mini App (1.60.0); обновлён корневой lock-файл. В main.ts и vitest.config.ts включена предварительная сборка lucide-react. Попытка оптимизировать две версии отдельно не прошла проверку Podium, поэтому итоговое решение использует одну версию.

Проверки:
- `npm install lucide-react@1.60.0 --workspace @picklehub/storybook --workspace @picklehub/ui-web --save-exact` — успешно.
- `npm test --workspace @picklehub/storybook -- src/AlertDialog.stories.tsx src/EventDetails.stories.tsx src/EventDetailsNavigation.stories.tsx` — 18 тестов успешно.
- `npm run typecheck --workspace @picklehub/storybook` — успешно.
- `npx eslint ds/storybook/.storybook/main.ts ds/storybook/vitest.config.ts --max-warnings 0` — успешно.
- `npx prettier --check ds/storybook/.storybook/main.ts ds/storybook/vitest.config.ts ds/storybook/package.json ds/web/package.json` — успешно.
- `npm run ds:build > /private/tmp/picklehub-lucide-build.log 2>&1` — успешно.
- `node /private/tmp/picklehub-storybook-check.mjs` — живая story AlertDialog открывается, диалог открывается/закрывается; правило блокировки fingerprint включено, запросов к fingerprint нет, ошибок страницы/сети нет. Браузер загружает предсобранный lucide-react.js.
- Dev-сервер перезапущен через `npm run ds:dev` на порту 6006.
