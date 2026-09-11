# Проверка административной панели

Документ фиксирует модель угроз, матрицу прямой авторизации и прослеживаемость этапа
`08-admin-backoffice/05-verification`. Он не является разрешением на production-доступ, подтверждением юридического
соответствия или доказательством готовности круглосуточной модерации.

## Модель угроз и границы

Защищаемые активы — narrative/evidence/response/appeal обращения, точная identity, назначения и решения, изменения
ролей, ограничения, решения и слияния площадок, break-glass grants и audit. Недоверенные границы — player bearer,
гость, скрытая admin route, browser history/cache/bfcache, stale UI, конкурентный moderator, повтор idempotency key,
изменяемый client claim и прямой HTTP-вызов без UI.

Основные проверяемые угрозы:

- UI скрывает кнопку, но actor вызывает route напрямую: capability проверяется контроллером после восстановления
  отдельной admin session; player bearer и гость получают `401`, запрещённая admin role — `403` и минимальный
  capability-specific audit `*_DENIED`, связанный с admin session.
- `SUPERADMIN` превращается в wildcard: fixed registry не даёт ему decision, restriction или venue moderation;
  restricted case detail требует отдельный exact-case break-glass.
- Два moderator одновременно решают case: serializable conflict и expected revision оставляют одну decision, один
  receipt, один domain event и один successful audit; serialization race возвращается как `REVISION_CONFLICT`.
- Audit недоступен либо не проходит минимальную DB shape policy: owning transaction откатывает venue merge, alias,
  decision, event и receipt.
- Stale update или повтор после terminal state создаёт `409` без второго successful audit/effect.
- Role downgrade сохраняет старую вкладку: отзыв grant атомарно отзывает admin sessions и повышает security epoch;
  следующий запрос со старым credential получает `401`.
- Restricted response остаётся в DOM/history/cache: admin fetch всегда `no-store`, Workbox не имеет admin runtime
  cache, logout/pagehide очищают credential и state, history entry заменяется, Back/Forward/reload не возвращают
  narrative.

## Матрица прямого API

`Да` означает только прохождение capability boundary; resource policy, assignment, conflict, purpose, re-auth,
confirmation, CSRF, rate limit и revision продолжают применяться. Player bearer и гость получают `401` на всех
17 операциях.

| Операция                                           | `SUPERADMIN` | `MODERATOR` | `EDITOR` | `ADS_MANAGER` |
| -------------------------------------------------- | ------------ | ----------- | -------- | ------------- |
| `GET /admin/session`                               | Да           | Да          | Да       | Да            |
| `POST /admin/role-grants` и `.../{grantId}/revoke` | Да           | Нет         | Нет      | Нет           |
| `POST /admin/users/lookup`                         | Да           | Да          | Нет      | Нет           |
| `GET /admin/cases` и `GET /admin/cases/{caseId}`   | Да           | Да          | Нет      | Нет           |
| `POST /admin/cases/{caseId}/assignment`            | Да           | Да          | Нет      | Нет           |
| `POST /admin/cases/{caseId}/decision`              | Нет          | Да          | Нет      | Нет           |
| Создание и отзыв `users/{userId}/restrictions`     | Нет          | Да          | Нет      | Нет           |
| Список, detail, решение и merge `venue-candidates` | Нет          | Да          | Нет      | Нет           |
| `GET /admin/audit`                                 | Да           | Да          | Нет      | Нет           |
| Создание и отзыв `break-glass-grants`              | Да           | Нет         | Нет      | Нет           |

Для case detail `SUPERADMIN` без active exact-case grant и `MODERATOR` без assignment/no-conflict получают такой же
`404`, как для отсутствующего case. Break-glass не меняет строку decision и не добавляет capability
`SAFETY_CASE_DECIDE`. `EDITOR` и `ADS_MANAGER` на этом этапе имеют только session access.

## Audit и согласованность

Для каждой успешной мутации `AdministrationService` использует единый serializable wrapper: domain mutation,
минимальный audit, encrypted 24-hour operation receipt и требуемый outbox event коммитятся вместе. Receipt имеет
уникальную ссылку на audit; `operation_id` уникален. Administration audit требует actor, opaque target, closed action,
reason, policy, outcome, request/correlation и единственный объект `changed_fields.names`.

Database запрещает `UPDATE`, `DELETE` и `TRUNCATE` audit для runtime PUBLIC, а immutable trigger защищает историю.
Narrative, evidence, identity query, координаты, credential, cursor, justification и before/after не входят в generic
audit. Разрешённое или запрещённое restricted case read и сам audit search создают отдельную минимальную запись.
Отзыв restriction создаёт revision `1` в состоянии `REVOKED`; hard delete и восстановление старого active state
отсутствуют.

## Автоматизированные подтверждения

- `backend/test/unit/administration-authorization.spec.ts`: 17 controller actions × guest/player boundary и четыре
  фиксированные роли; всего 85 assertions/scenarios без зависимости от сокета.
- `contracts/scripts/administration-verification-policy.test.mjs`: точное равенство role matrix всех сгенерированных
  OpenAPI operations, наличие capability boundary, audited transaction wrapper, serialization mapping, audit DB
  guards, отсутствие admin runtime cache и отсутствие admin implementation в TMA source.
- `backend/test/integration/administration-verification.integration-spec.ts`: конкурентное решение, stale retry,
  один audit/receipt/event, create/revoke restriction, rollback merge на rejected audit и немедленная инвалидизация
  session после role downgrade. Suite требует PostgreSQL/Redis CI.
- `frontend/web/src/admin-ui.test.tsx`: deep-link re-auth, `no-store`, отсутствие credential в URL, role navigation,
  stale conflict без ложного успеха, очистка restricted state и confirmation dialogs.
- `test/e2e/admin.spec.ts`: production web/TMA builds, четыре роли, logout + Back/Forward/reload, keyboard-only вход и
  отсутствие admin route/navigation в TMA.

## Остаточные риски и production gates

- Локальный sandbox может запретить PostgreSQL, Redis и запуск Chrome; успешной считается только фактически
  выполненная часть, а integration/Playwright должны пройти в PostgreSQL/Redis CI и browser CI.
- Production MFA/WebAuthn ceremony, bootstrap первого superadmin, независимое approval evidence, VPN/IP policy,
  break-glass security notification/post-review и доставка on-call alerts ещё не проверены на реальной инфраструктуре.
- Не выполнены production backup/restore drill, криптоудаление по retention и проверка размещения персональных данных
  в России; документы и tests подтверждают границы кода, но не эксплуатационное или юридическое соответствие.
- TMA absence подтверждается source/build scan и browser 404; supply-chain анализ опубликованного artefact остаётся
  частью production release verification.
