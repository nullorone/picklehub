# Политика данных административной панели

Документ фиксирует wire- и storage-границы этапа `08-admin-backoffice/02-contract-data`. Он не заявляет готовность
backend, web UI, production MFA или on-call процесса. Административный API использует отдельную audience и только
четыре роли из кода: `SUPERADMIN`, `MODERATOR`, `EDITOR`, `ADS_MANAGER`. Таблиц custom role, wildcard capability и
редактируемого permission graph нет.

## Владение и транзакции

`administration` владеет `platform_role_grants`, `admin_sessions`, `break_glass_grants` и
`admin_operation_receipts`. `trust-safety` владеет case, decision и `user_restrictions`; `venues` владеет
candidate/revision/report/merge. Administration вызывает узкие порты, а не пишет чужие authoritative таблицы.
Владелец фиксирует domain mutation, effect/outbox и обязательный `AuditEntry` одной транзакцией. Сбой audit
откатывает изменение; повтор receipt возвращает прежний ответ и не создаёт второй effect или audit.

`audit_entries` остаётся общей append-only security capability. Миграция только добавляет nullable поля
`operation_id` и `policy_version`, не обновляет старые строки, запрещает runtime UPDATE/DELETE/TRUNCATE и сохраняет
триггеры неизменяемости. Для новых administration-записей обязательны logical operation ID, actor/action, opaque
target, closed reason, policy version, outcome, request/correlation и объект только с allowlisted именами изменённых
полей. Narrative, evidence, justification, email, Telegram subject, координаты, credential, cursor и полные
before/after запрещены.

## Доступ и сроки

Role grant требует отдельного выдавшего и одобрившего сотрудника; subject не может быть ни одним из них. Активная
роль уникальна в своём scope, выдача versioned, отзыв необратим и история не удаляется. Capability вычисляется из
фиксированного registry backend и не хранится как изменяемая строка.

Admin session хранит только SHA-256/HMAC-class credential hash, отдельную audience, phishing-resistant MFA,
security epoch и timestamps. Absolute TTL не превышает 8 часов, idle TTL — 15 минут. Role revoke и staff security
epoch отзывают доступ независимо от session cache. Session metadata очищается после утверждённого security window;
это не разрешает удалить связанный audit.

Break-glass содержит одного actor, один case и incident reference, действует не более 30 минут и не продлевается
update. Обоснование хранится как authenticated ciphertext с версией ключа. Он не разрешает queue browse, export,
bulk action или final decision. Grant, каждое разрешённое и запрещённое чтение, revoke и expiry получают отдельную
минимальную audit entry. До готового notification/post-review процесса production feature flag закрыт.

Operation receipt хранится 24 часа: actor + method + canonical path + UUIDv4 key, SHA-256 fingerprint, opaque target,
expected revision, зашифрованный safe response и ссылку на audit. Raw lookup, narrative, credential и volatile
headers в fingerprint/receipt не попадают. Исправление ограничения, решения или venue создаёт новую revision либо
reversal; hard delete и переписывание истории отсутствуют.

## Поиск, курсоры и экспорт

User lookup принимает ровно один exact UUID/receipt или нормализованную identity в POST body. Email/Telegram
сопоставляются через ротируемый keyed HMAC index внутри identity; raw query живёт только на время запроса и не
попадает в URL, log, trace, audit, analytics, Redis или administration storage. Partial/wildcard/name search и
browse-all отсутствуют.

Case, venue и audit cursors подписаны и связаны с actor, active role, capability, purpose, filters, snapshot boundary
и expiry. Сортировка завершается opaque UUID; default page 25, maximum 100. Audit-интервал ограничен 31 UTC сутками.
Invalid/expired/transferred cursor возвращает стабильную ошибку и никогда не начинает первую страницу молча.

В MVP CSV, JSON, print packet, signed URL или export job не создаются. Запрещены также background payload, cache,
DLQ и analytics-копии списков, audit или evidence. Будущий legal/incident export начинается отдельным требованием,
контрактом, approval и retention review; текущая схема намеренно не содержит export таблиц.

## 403, 404 и минимизация

`403` означает безопасно раскрываемое отсутствие capability, assignment, no-conflict, fresh re-auth или exact-case
break-glass. Когда различие раскроет существование пользователя, case, grant, venue item или чужой scope, API
возвращает единый `404 ADMIN_RESOURCE_NOT_FOUND`, совпадающий для отсутствующего объекта. `EDITOR` и `ADS_MANAGER`
не получают safety list/detail; `SUPERADMIN` без exact-case break-glass не получает narrative/evidence, а сам
break-glass не даёт decision capability.

Списки содержат routing metadata без сторон и narrative. Case restricted fields доступны только через owning
repository назначенному moderator без конфликта либо exact-case grant. Audit search сам аудируется, не ищет reason
message/evidence/before-after и не возвращает exact total. Operational metrics содержат только закрытые role/action/
object/outcome/time-count buckets и не зависят от analytics consent.
