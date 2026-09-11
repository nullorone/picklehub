# Матрица проверки профиля и статистики

Матрица относится к `llm/06-player-profile-stats/05-verification.md`. Статус «автоматизировано» означает, что
проверка входит в обычные команды репозитория. Статус «подтверждено» выставляется только после фактического
зелёного запуска соответствующего слоя; компиляция integration-теста не заменяет PostgreSQL.

| Риск или гарантия                                                                      | Уровень               | Автоматизированное подтверждение                                  | Статус 2026-09-11       |
| -------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------- | ----------------------- |
| Scored outcome учитывает победу, партии и team points ровно один раз                   | PostgreSQL            | `profiles-verification.integration-spec.ts`                       | Ожидает CI PostgreSQL   |
| Подтверждение без счёта увеличивает только `played`                                    | PostgreSQL + UI       | verification integration; обе версии `profiles-ui.test.tsx`       | UI подтверждён; БД ждёт |
| Proposal, dispute, void, cancel и несыгравший участник не дают вклад                   | PostgreSQL            | verification integration                                          | Ожидает CI PostgreSQL   |
| Отмена ранее подтверждённого результата заменяет вклады tombstone                      | PostgreSQL            | verification integration                                          | Ожидает CI PostgreSQL   |
| Guest slot не создаёт профильный вклад                                                 | PostgreSQL            | backend и verification integration suites                         | Ожидает CI PostgreSQL   |
| Повтор и старая revision не удваивают и не откатывают итог                             | PostgreSQL            | `profiles-backend.integration-spec.ts`, migration revision guards | Ожидает CI PostgreSQL   |
| `ALL` точно равен `SINGLES + DOUBLES`, а wins + losses не больше played                | Contract + PostgreSQL | data policy и `profiles-migration.integration-spec.ts`            | Contract подтверждён    |
| Полный rebuild равен инкрементальной проекции выбранного игрока                        | PostgreSQL            | verification integration                                          | Ожидает CI PostgreSQL   |
| Существующее `BUILDING` поколение продолжается после `checkpoint_match_id`             | PostgreSQL            | verification integration                                          | Ожидает CI PostgreSQL   |
| Неполное поколение не становится активным без совпадения count/checksum                | Contract + PostgreSQL | data policy и profiles migration integration                      | Contract подтверждён    |
| Две записи одной версии профиля дают один успех и один version conflict                | PostgreSQL            | verification integration                                          | Ожидает CI PostgreSQL   |
| Публичная и owner-схемы имеют отдельные точные snapshots                               | Contract + PostgreSQL | `profiles-policy.test.mjs`; verification runtime DTO test         | Contract подтверждён    |
| Private, отсутствующий и обе стороны block неразличимы; anonymous видит `PUBLIC`       | PostgreSQL            | backend и verification integration suites                         | Ожидает CI PostgreSQL   |
| Avatar policy привязан к owner, server-generated key, типу, длине, hash и пяти минутам | Contract + PostgreSQL | profile data policy; verification integration                     | Contract подтверждён    |
| Profile name, DUPR, skill и score canaries удаляются из structured logs                | Unit                  | `redaction.spec.ts`                                               | Подтверждено            |
| Новый игрок видит нейтральное empty state без выдуманного win rate                     | Web/TMA component     | обе версии `profiles-ui.test.tsx`                                 | Подтверждено            |
| История в 50 записей догружает следующую cursor-page без потери записей                | Web/TMA component     | обе версии `profiles-ui.test.tsx`                                 | Подтверждено            |
| `2 / 3` выводится как `66.7%` с полным доступным текстом                               | Web/TMA component     | обе версии `profiles-ui.test.tsx`                                 | Подтверждено            |
| Поздний ответ прежнего player/account scope не заменяет новый экран                    | Web/TMA component     | обе версии `profiles-ui.test.tsx`                                 | Подтверждено            |

## Граница неявок

Текущий этап не создаёт moderation decision: producer окончательной неявки принадлежит следующей функции
`07-trust-safety`. До неё `attendanceAvailable=false`, а отменённый матч или состояние участника `CANCELLED` не
создают статистический вклад и не изображаются подтверждённой неявкой. Storage уже требует один
`CONFIRMED_NO_SHOW` на source decision и match/player; end-to-end проверка нескольких reports → одного решения
добавляется вместе с авторитетным trust/safety producer, а не подменяется фиктивным решением в profiles.

## Обязательный запуск в CI

На чистом PostgreSQL 16/PostGIS 3.4 после `prisma migrate deploy`:

```sh
npm exec --workspace @picklehub/backend -- jest --config jest.integration.config.cjs --runInBand \
    test/integration/profiles-migration.integration-spec.ts \
    test/integration/profiles-backend.integration-spec.ts \
    test/integration/profiles-verification.integration-spec.ts
```

Локально и в CI без внешних сервисов:

```sh
node --test contracts/scripts/profiles-policy.test.mjs contracts/scripts/profiles-data-policy.test.mjs
npm exec --workspace @picklehub/backend -- jest --config jest.unit.config.cjs --runInBand \
    test/unit/redaction.spec.ts
npm test --workspace @picklehub/web -- --run src/profiles-ui.test.tsx
npm test --workspace @picklehub/tg -- --run src/profiles-ui.test.tsx
npm run verify
```

PostgreSQL-прогон должен сохранить wall-clock duration и итоговые assertions: после матрицы исходов остаётся один
`played` без счёта; отменённый scored outcome имеет только `EXCLUDED` tombstones; guest не создаёт contribution;
rebuild и checkpoint-resume дают те же totals, что incremental state; из двух конкурентных profile updates
успешен ровно один.

## Фактический запуск 2026-09-11

- Profile contract/data policy: 9 tests, успешно за 366 мс.
- Profile log-redaction unit: 3 tests, успешно за 4,625 с.
- Web profile component: 6 tests, успешно за 1,76 с; TMA: 6 tests, успешно за 772 мс.
- Три profile integration suites обнаружили 9 tests, но завершились до assertions за 2,398 с: sandbox запретил
  подключения к `127.0.0.1:5432`. Эти database assertions не считаются пройденными.

До зелёного PostgreSQL-прогона эквивалентность rebuild и incremental projection не объявляется фактически
подтверждённой в runtime.
