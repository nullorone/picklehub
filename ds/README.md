# Дизайн-система PickleHub

## Запуск

Требуется Node.js 22.12+ и npm 10+. Из корня репозитория:

```sh
npm install
npm run ds:dev
```

Storybook доступен по http://localhost:6006. Команда сначала генерирует CSS токенов.
После изменения tokens.json перезапусти ds:dev. Для компонентов и stories работает hot reload.

```sh
npm run ds:build
npm run ds:check
```

Для браузерных тестов один раз установи Chromium:

```sh
npm exec --workspace @picklehub/storybook -- playwright install chromium
```

Статический каталог собирается в storybook/dist. Публикация отдельно не настроена.

## Пакеты и использование

- tokens — @picklehub/design-tokens: редактируемый JSON, типы и генератор CSS.
- web — @picklehub/ui-web: React 18 и Tailwind 4, без Telegram SDK.
- storybook — каталог токенов, документация, Controls, темы, узкий viewport и браузерные тесты.

```tsx
import { Button } from '@picklehub/ui-web';
import '@picklehub/ui-web/styles.css';

<Button variant="primary" size="default">
    Записаться на игру
</Button>;
```

Перед использованием CSS выполни npm run ds:tokens. Пакеты экспортируют исходники для локального
монорепозитория; Vite потребителя должен подключать @tailwindcss/vite. React — peer dependency.
Тему задаёт data-ds-theme="light" или "dark" на оболочке. Интеграцию Telegram выполняет приложение.
Прежний @picklehub/tokens переэкспортирует тот же источник, включая default export подпути tokens.json.
CSS в tokens/dist создаётся автоматически и не редактируется вручную.

Цвета и роли разделены; стеклянные поверхности имеют свой фон, рамку и тень. Без backdrop-filter
используется плотный фон. Размеры пока хранятся в px для совместимости; native-адаптер появится отдельно.
Button адаптирован из [EIN Glass Button](https://ui.eindev.ir/docs/components/glass-button).
Исходник и MIT-лицензия указаны в [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
Варианты: default, primary, outline, ghost, destructive. Размеры: sm (32 px), default (40 px), lg (48 px), icon (40×40 px).
По умолчанию — default/default, как в EIN. glowEffect добавляет свечение; asChild оформляет дочернюю ссылку
через Radix Slot. Для кнопки по умолчанию type=button. Для длинной подписи доступны className="h-auto whitespace-normal".

Токены ein задают палитру cyan/blue/purple/red, оригинальные тени и параметры стекла. Прежние color/theme
сохранены для совместимости Mini App; в CSS ds используются ein.theme. Storybook показывает EIN-палитру,
шрифт Geist и тёмную демонстрационную поверхность из EIN. Размеры, рамки и эффекты кнопки не зависят
от переключателя темы оболочки: исходный стеклянный компонент рассчитан на тёмную подложку.

## Совместный следующий шаг: Card

Агент подготовил конфигурацию, проверки и Button. Card и TextField оставлены для твоего участия.

1. Посмотри Button/Button.tsx: тип props, таблицы вариантов и классы на токенах.
2. Создай src/Card/Card.tsx в пакете web. Начни с обёртки div, children и стандартных HTML props.
3. Добавь варианты surface/glass через семантические классы, не копируя цвета из stories.
4. Экспортируй Card из web/src/index.ts и добавь Card.stories.tsx в каталог Storybook.
5. Вместе проверь обе темы и длинный текст; тесты и конфигурацию продолжит вести агент.

TextField — следующий шаг после Card: подпись, поле, сообщение об ошибке и состояния.
Не добавляй пустые папки helpers/hooks/tests. Создавай их, когда появится соответствующий код.

## LiquidNavbar (Nimbus Waterline)

Компоненты DS находятся в `ds/web/src`, общие стили — `ds/web/src/styles.css`;
стили приложения Telegram — `frontend/tg/src/index.css`. Для этого компонента создан
`ds/web/src/components/ui/liquid-glass-navbar.tsx`: это папка `components/ui` внутри
исходников workspace. Она даёт предсказуемое место для shadcn-совместимых компонентов;
папка `/components/ui` в корне монорепозитория не попадала бы в существующую сборку.
Специфичные стили Nimbus включены в компонент и ограничены префиксами nimbus/nv.

```tsx
import { LiquidNavbar, NimbusIcons } from '@picklehub/ui-web';

<LiquidNavbar
    items={[
        { label: 'Игры', icon: NimbusIcons.home, fx: 'glow' },
        { label: 'Профиль', icon: NimbusIcons.user, fx: 'wave' },
    ]}
    defaultActive={0}
    onChange={(index, item) => console.info(index, item.label)}
/>;
```

В приложении передавайте `active` из маршрута и выполняйте переход в `onChange`;
для обычных ссылок предусмотрен `href`. Без `active` используется локальный state,
`defaultActive` применяется при первом рендере. Невалидный индекс ограничивается
диапазоном; пустой список поддерживается. Provider/store не требуется. `sound`
выключен по умолчанию, `tone` выбирает светлую/тёмную воду. `compact=true` скрывает
подписи пунктов с иконками, `false` всегда показывает; без значения подписи скрываются
при ширине viewport до 520px. Текстовые пункты сохраняют подписи. Для большого числа
пунктов родитель должен предоставить достаточно места или прокрутку.

Исходный `demo.tsx` находится рядом с компонентом (относительный импорт вместо `@/`).
`npm run ds:dev` → `Components/LiquidNavbar`: демо Waterline, темы, компактный вариант,
управляемое состояние, ссылки и CSS fallback. Это каталог для выбора места использования;
маршруты и навигация Mini App не заменялись. Иконки используют установленный lucide-react;
изображений в исходном дизайне нет, Unsplash и дополнительные зависимости не нужны.

React 18, strict TypeScript и Tailwind 4 уже настроены. Полная конфигурация CLI shadcn
(`components.json` и его тема) в репозитории отсутствует и для этого самостоятельного
компонента не нужна. Если нужна генерация других shadcn-компонентов, выполните
`npx shadcn@latest init --cwd frontend/tg` для существующего Vite-приложения.
CLI добавляет конфигурацию, зависимости и CSS-переменные — проверьте их совместимость
с существующими DS-токенами. Настройте `@/*` → `./src/*` в TypeScript и такой же alias
в Vite; в `components.json` задайте `aliases.ui` как `@/components/ui`,
`aliases.components` как `@/components`, а `tailwind.css` как `src/index.css`.
Для Tailwind 4 поле `tailwind.config` оставьте пустым. Общие компоненты этого монорепозитория
продолжайте импортировать через `@picklehub/ui-web`.
См. [официальный CLI](https://ui.shadcn.com/docs/cli) и
[ручную настройку](https://ui.shadcn.com/docs/installation/manual).
