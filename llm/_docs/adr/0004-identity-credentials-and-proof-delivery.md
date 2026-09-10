# ADR 0004. Credentials, доказательства identity и доставка magic-ссылки

- Статус: принято
- Дата: 2026-09-08

## Контекст

Identity API должен немедленно отзывать доступ, не раскрывать существование email и не сохранять Telegram init
data, magic-секреты или session credentials в открытом виде. Web/PWA и TMA работают через same-origin proxy;
React Native отложен до этапа 14. Обычный transactional outbox не подходит для отправки magic-ссылки: worker
должен был бы получить исходный одноразовый секрет, а хранить его в outbox или очереди запрещено.

## Решение

Access и refresh — случайные непрозрачные значения не менее 256 бит. PostgreSQL хранит только их
криптографические хеши. Access действует 5 минут и передаётся в `Authorization: Bearer`; browser-клиент держит его
только в памяти. Refresh для Web/PWA и TMA передаётся host-only cookie `__Secure-ph-refresh` с `Secure`,
`HttpOnly`, `SameSite=Lax`, `Path=/v1/auth` и без `Domain`. Семейство имеет inactivity-срок 7 суток и абсолютный
срок 30 суток; каждый refresh ротируется, а replay отзывает семейство.

Browser-клиенты получают отдельный `__Host-ph-context` и связанный CSRF-секрет. Все browser-мутации, включая
анонимный вход, требуют точного разрешённого `Origin`, context cookie и `X-CSRF-Token`. API доступен клиентам через
same-origin proxy; CORS не сочетает wildcard с credentials. Все auth, identity, consent и onboarding ответы,
включая ошибки, имеют `Cache-Control: no-store`.

Будущий native-клиент не использует cookie, WebView storage или URL. Он хранит access и refresh в защищённом
хранилище ОС и передаёт оба только в заголовках авторизации по TLS. Отдельные native login/refresh/logout wire
operations, привязка к установке устройства и deep-link/PKCE flow проектируются в этапе 14 после security review;
текущий OpenAPI намеренно публикует только Web/PWA и TMA и не принимает переключатель выдачи refresh в JSON.
Это фиксирует способ передачи mobile credentials, но не создаёт преждевременную mobile API поверхность.

Telegram init data проверяется только backend, ограничивается возрастом 5 минут и future skew 30 секундами, а
его keyed fingerprint атомарно погашается. Email и provider subject нормализуются до вычисления HMAC lookup key;
восстановимое значение хранится только как ciphertext с версией ключа. Magic-секрет действует 10 минут,
хранится только как hash и попадает исключительно во fragment HTTPS URL доверенной landing page.

Запрос email сначала фиксирует hash и минимальные metadata, затем один раз передаёт raw secret email adapter в
памяти в рамках ограниченного request budget. Raw secret не попадает в outbox, BullMQ или idempotency record;
автоматического фонового повтора нет. Сбой или неопределённый результат доставки не меняет нейтральный `202` и не
считается обещанием доставки: пользователь запрашивает новую ссылку, которая отзывает предыдущую pending-ссылку.
Провайдер обязан отключать click tracking и переписывание URL.

Повторяемые неcredential-мутации используют `Idempotency-Key`. В той же транзакции хранится fingerprint запроса и
зашифрованный status/body на 24 часа; unique scope — user, method, canonical path и key. Обмен credentials,
refresh, linking/unlinking и погашение proof не воспроизводят сохранённый ответ.

## Последствия

- Немедленный отзыв требует database lookup access hash на каждом защищённом запросе; Redis может ускорять, но не
  становится источником истины.
- Cookie transport безопаснее для текущих browser-клиентов, но требует same-origin proxy, CSRF context и точного
  origin allowlist.
- Потерянный ответ refresh, linking или unlinking может потребовать нового входа; сервер не возвращает credential
  повторно.
- Magic email не имеет автоматической гарантированной доставки. Это осознанная цена запрета сохранять raw secret;
  метрики провайдера и безопасные reason codes не должны содержать адрес или URL.
- DUPR link capability остаётся выключенной, пока allowlist host/path и условия провайдера не утверждены.

## Отклонённые варианты

- JWT без серверного состояния: не обеспечивает требуемый немедленный отзыв и replay detection.
- Refresh в JavaScript storage или JSON для browser: увеличивает последствия XSS и позволяет обойти cookie/CSRF
  модель.
- Raw magic secret в outbox/очереди ради retry: создаёт долговечную копию credential.
- Общий browser/native endpoint с клиентским флагом выдачи refresh в body: browser мог бы запросить менее
  защищённый transport; отдельная native поверхность должна пройти собственный review.
