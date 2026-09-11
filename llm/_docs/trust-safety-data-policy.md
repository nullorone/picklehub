# Контракт данных доверия и безопасности

Документ фиксирует wire- и storage-инварианты этапа `07-trust-safety/02-contract-data`. Он не подтверждает
готовность backend-модерации, административной очереди, staffing, внешнего канала поддержки, legal basis или
production-размещения. До этих approvals реальные safety-данные собирать нельзя.

## Границы и публичные проекции

- `Review` хранит одну эффективную запись на `author + subject + match`; каждое изменение является append-only
  revision. Оценка, теги и текст закрыты. `ReviewReputationAggregate` перестраивается из текущих eligible revisions
  и публикует среднее и размер выборки только при пяти авторах из разных матчей.
- `SafetySignal` — стабильная пользовательская квитанция. `NoShowReport` и `Report` содержат закрытые структурные
  детали, а optional text вынесен в `SafetyEvidence`. Сигнал не является case, решением или effect.
- `ModerationCase` связывает независимые сигналы без раскрытия связи игрокам. `SafetyCaseResponse`,
  `ModerationDecision` и история review append-only; `ModerationAppeal` допускает одну запись стороны на decision
  и другого reviewer. `ModerationEffect` имеет стабильный logical key, а итог no-show уникален на match + subject.
- Физический active block остаётся в `communication_blocks`, которой владеет communications. REST mutations
  сохраняют совместимый путь `/communication-blocks/{blockedUserId}`, но его deny теперь платформенный и
  двухсторонний для новых direct interactions. `/me/blocks` показывает только собственные активные блокировки.
- `AuditEntry` остаётся общей security-сущностью и защищён SQL trigger от UPDATE/DELETE. Trust/safety audit не
  кладёт в `changedFields` или иные поля rating, text, evidence, contact, coordinates, IP, имя reviewer,
  notification body или before/after values.

Игровой REST возвращает только caller-owned `SafetyReceipt`: receipt ID, широкую category, безопасный статус,
outcome class и общую policy reason. Запрос чужого receipt совпадает с отсутствующим. Case ID, reporter/subject,
source, reason, evidence, количество сигналов, priority, assignee, notes, response другой стороны и sanction detail
в DTO отсутствуют. Public reputation не содержит source match/review ID, распределения, текста, тегов, reports,
blocks, sanctions или no-show.

## Идемпотентность, состояния и конкурентность

Все mutation endpoints требуют bearer session, точный `Origin`, CSRF и UUIDv4 `Idempotency-Key`.
`safety_idempotency_records` связывает ключ с user, method, canonical path и SHA-256 fingerprint на 24 часа;
зашифрованный ответ повторяется только при том же fingerprint, иначе возвращается `IDEMPOTENCY_KEY_REUSED`.
Уникальный hash предмета дополнительно подавляет повтор reporter по бизнес-ключу, но никогда не объединяет разных
reporters.

SQL фиксирует допустимые переходы и monotonic optimistic revision:

- signal: `RECEIVED → LINKED/UNDER_REVIEW/WITHDRAW_REQUESTED/RESOLVED`, затем через review к `RESOLVED`;
- case: `OPEN → TRIAGED → ASSIGNED → INVESTIGATING → DECIDED → CLOSED`, а `CLOSED → REOPENED` только новой
  revision с последующим назначением;
- appeal: `SUBMITTED → UNDER_REVIEW → UPHELD/CHANGED/REJECTED` реализуется backend-этапом с optimistic update;
- decision revision, response, case-signal link, review revision и audit являются append-only.

Человеческое decision требует назначенного reviewer без conflict marker. Новая decision revision указывает
предыдущую и не переписывает её. Appeal reviewer не может совпасть с reviewer исходного решения. Temporary effect
имеет human review deadline не позднее 72 часов. Единственный no-show effect защищён partial unique index по
`match + subject`; retry/reversal сохраняют logical effect key и не умножают статистический вклад.

## Шифрование, события и доступ

Review text, report evidence, response, appeal text и сохранённый idempotency response — authenticated ciphertext
с положительными `encryptionKeyVersion` и AAD version. Searchable metadata не содержит plaintext, контакты или
координаты. Plaintext живёт только в памяти запроса; ограничения API: review 500 символов, report/response/appeal
2 000, без uploads и отдельной геопозиции. Ключи разделяются по environment/workload и ротируются; URL ingestion,
изображения, документы и аудио контракт не принимает.

AsyncAPI события `safety.*.v1` содержат только один opaque `signalId`/`caseId`/`decisionId`/`effectId` и broad
category. Reporter, subject, source/revision, reason, status, rating, text, evidence, attachments, block direction,
outcome и decision detail запрещены также в outbox, BullMQ и DLQ. Consumer авторизованно перечитывает минимум из
owning store и дедуплицирует по message ID.

Игрок читает только собственную receipt projection. Restricted evidence read требует активной moderator role,
assignment к одному case и отсутствия conflict marker на каждом запросе; break-glass адресный, срочный и
аудируемый. Этот этап не публикует moderator API: он принадлежит backend/admin этапам.

## Retention, удаление и legal hold

Сроки остаются предложением до legal review и исполняются будущими cleanup jobs:

| Данные                      | Срок и удаление                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Receipt и signal metadata   | До года после final decision; без case — 90 суток после закрытия. Затем удаляются связи с аккаунтом и read model. |
| Evidence и responses        | До года после final decision/appeal, затем криптоудаление payload и очистка primary, cache, queue/DLQ и export.   |
| Review text/revisions       | Текст 180 суток после effective/withdrawn; минимальная eligible revision до трёх лет для обратимого агрегата.     |
| Case/decision/effect/appeal | До трёх лет после окончательного закрытия; subject link минимизируется раньше, если нет safety/legal основания.   |
| Block                       | Active до unblock/удаления владельца; минимальный revoked audit не более 30 суток.                                |
| Idempotency response        | Ровно 24 часа; поздний retry не восстанавливает очищенный payload.                                                |
| Audit                       | Предложение: три года после закрытия case с partition cleanup; не бессрочно.                                      |

Удаление аккаунта немедленно скрывает public reputation, запрещает direct interaction, удаляет contact mapping и
отзывает принадлежащие пользователю active blocks. Active case не каскадируется: identity заменяется уникальным
case-local pseudonym и хранится только минимально необходимое до своего срока. Backups истекают за 35 суток, а
restore сначала применяет deletion/suppression ledger.

`safety_legal_holds` требует один case, точный record scope, reason code, owner, review date и expiry. Hold не
распространяется на весь аккаунт и не делает данные бессрочными. Cleanup пропускает только перечисленные records
при активном hold, фиксирует факт без содержания и продолжает остальные sinks. Release/expiry возобновляет cleanup;
withdrawal пользователя сама по себе не удаляет обязательный safety record.
