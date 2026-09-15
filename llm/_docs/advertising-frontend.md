# Интерфейсы рекламы

Документ фиксирует реализацию этапа [`13-advertising/04-tma-web.md`](../13-advertising/04-tma-web.md). Он не означает
разрешение production-показа: реальные кампании и placements не добавлены, внешний provider/SDK не выбран, а
legal/маркировка/ОРД/ЕРИР, РФ-residency и условия рекламодателя остаются закрывающими gates.

## TMA и web/PWA

Каждая некритическая клиентская поверхность регистрирует платформенное нижнее место `WEB_SCREEN_BOTTOM` либо
`TMA_SCREEN_BOTTOM`. Surface получается из закрытого route allowlist; decision передаёт только client kind, locale,
крупный form factor, connectivity и surface. URL/query, object ID, поисковый текст, координаты, IP locality,
identity/profile/history и advertising/device identifier не собираются. Provider consent остаётся `false`; внешний
fallback по-прежнему deny-by-default.

Slot находится в обычном потоке после screen content и не может перекрыть управление. Во время decision он
резервирует фиксированные 7.5–10 rem, поэтому заполнение не двигает интерфейс; no-fill, request failure и broken
asset схлопывают место. Креатив ограничен серверным статическим asset DTO, имеет видимую метку «Реклама», сведения о
рекламодателе и доступное имя ссылки. Скрипт, iframe, pixel, autoplay, countdown и animation не создаются; глобальная
reduced-motion policy и локальный TMA guard отключают transition/animation.

Маршруты authentication/onboarding, создания матча, feedback и safety report не делают decision. Дополнительно slot
fail-closed скрывается при `data-ad-free`, `data-ad-critical`, result form, dialog, modal, `aria-busy` и фокусе внутри
любой формы. MutationObserver отслеживает появление таких состояний после асинхронной загрузки. Поэтому ввод счёта,
подтверждение/оспаривание результата, жалоба, блокирующая ошибка и административная форма не соседствуют с
активной рекламой.

## Viewability и клик

Fetch/render не считается impression. IntersectionObserver запускает отменяемый таймер только при видимости не
менее 50%; уход ниже порога, background вкладки, critical state, смена маршрута и unmount сбрасывают таймер.
Непрерывная foreground-секунда один раз потребляет server delivery token; повторное пересечение не отправляет второй
view. При отсутствии IntersectionObserver измерение не выполняется и основной контент продолжает работать.

Клик принимается только из trusted browser activation. Клиент не знает landing заранее: он отправляет click token в
защищённом body и переходит лишь на exact HTTPS URL из принятой серверной квитанции. Ошибка measurement/click не
блокирует экран и не создаёт ложный переход. Decision, impression и click используют CSRF, Origin cookies,
`private/no-store` transport и UUIDv4 idempotency key общего API client; токены не попадают в URL.

## Web backoffice

Отдельная in-memory admin session показывает рекламный раздел только при `AD_CAMPAIGN_MANAGE`. ADS Manager может:

- создавать, включать и выключать фиксированные placements;
- создавать draft campaign с UTC schedule, hard budget/rate, frequency cap, priority, placement, legal label и
  закрытым target rule;
- добавлять неизменяемый first-party creative с MIME/size/SHA-256/alt, HTTPS landing и exact redirect hosts;
- создавать полную immutable revision, отправлять её на review и отдельно approve/reject с checklist и independent
  reviewer flag;
- немедленно pause и resume в пределах исходного schedule;
- читать только daily aggregate report, где строки cohort меньше 20 отображаются подавленными.

Каждый control дополнительно скрыт собственной capability, mutation выключена offline и подтверждается повторной
загрузкой server state. Raw delivery trail, user export, arbitrary target dimension, precise geography, behavioral
profile и provider enable control в интерфейс ADS Manager не добавлены.

## Оставшиеся runtime gates

- проверить CLS, 320/360 px, keyboard/screen-reader flow, reduced motion, foreground/background и trusted click в
  реальных web и Telegram WebView;
- проверить CSP/asset gateway, broken image, slow/no-fill и истечение delivery/click token с живым backend;
- пройти PostgreSQL/Redis advertising integration gates предыдущего этапа и production-build browser E2E;
- до первого реального placement/campaign закрыть legal basis, маркировку/ОРД/ЕРИР, договор, категории,
  РФ-residency, retention/deletion и product holdout guardrails.
