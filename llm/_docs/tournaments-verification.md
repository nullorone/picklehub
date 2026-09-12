# Проверка турниров

Документ фиксирует матрицу, автоматизированные подтверждения и незакрытые runtime-gates этапа
`10-tournaments/05-verification`. Он не подтверждает production-инфраструктуру, применение миграции, реальную
пропускную способность HTTP API или юридическое соответствие.

## Модель корректности

Проверяемый результат определяется только точной версией встроенной стратегии, immutable preset snapshot,
упорядоченными entrants с сохранёнными seed/lot, append-only revisions результатов и projection revision. Clock,
Redis lease, сеть, профиль и environment не входят во вход стратегии. Любой replay обязан дать тот же canonical
checksum, а application-команда — либо целиком изменить root/audit/result/projection/receipt, либо не изменить
ничего.

Защищаемые инварианты: каждый entrant присутствует в итоговой таблице ровно один раз, не занимает два slot одной
волны, source outcome используется один раз, все обязательные встречи terminal до completion, места уникальны,
bye/walkover не создаёт ничью, позднее изменение победителя не переписывает начатую зависимость. Ошибка checksum,
неизвестная версия или невозможный граф закрывается через `PAUSED`/ошибку, а не выбор случайного победителя.

## Прослеживаемость правил

| Правило                                                                          | Автоматизированное подтверждение                                                                                    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Восемь встроенных форматов и exact version allowlist                             | `tournament-strategies.spec.ts`: registry; `tournament-verification.spec.ts`: восемь simulations и command flows    |
| Americano 4..64, кратность четырём, уникальный partner в первых `N-1` rounds     | strategy boundary matrix и partner uniqueness                                                                       |
| Round robin 3..64, один/два legs, один bye каждому при нечётном `N`              | golden schedule, boundary matrix и odd sizes 3..15 для двух legs                                                    |
| Single elimination 2..128, bracket power-of-two, high-seed byes, optional bronze | golden seed order, 6/128 entrant cases и полный command flow с terminal bronze                                      |
| Double elimination 4..64 power-of-two и conditional reset                        | graph/reset assertions, simulation и registration-to-completion flow                                                |
| Pools 3..6, snake seed, qualifiers/wildcards и delayed playoff                   | delayed-playoff assertion, boundary plan и полный flow                                                              |
| Swiss 4..128, до 9 rounds, rematch minimization и неповторный нечётный bye       | no-rematch assertion, odd 7 entrant simulation и maximum plan                                                       |
| Ladder 4..64, challenge span 1..5, атомарная перестановка                        | permutation/fairness assertion, simulation и maximum plan                                                           |
| King of Court чётный 4..64, одна ranked court на пару, одновременное движение    | permutation/fairness assertion, simulation и maximum plan                                                           |
| Нет ничьих; walkover 3/0, double walkover 0/0                                    | score rejection и standings assertion для обоих terminal outcomes                                                   |
| Детерминированные lots, отсутствие потери/дубликата entrant                      | seed replay для размеров 2..128, standings/per-wave property assertions                                             |
| Withdrawal/replacement до seeding сохраняет FIFO                                 | orchestrator registration/withdrawal/promotion test                                                                 |
| Concurrent score/correction и late winner change                                 | один concurrent score commit, consecutive result revision и late correction pause                                   |
| Сбой до commit и повтор операции                                                 | injected checkpoint оставляет исходный state; retry/replay создаёт один audit и entrant                             |
| API auth, CSRF и идемпотентность                                                 | `tournaments-verification-policy.test.mjs`: все 18 mutations, scoped organizer storage и encrypted receipt boundary |
| Append-only recovery и generation uniqueness                                     | verification policy связывает SQL result/audit/completion triggers и graph uniqueness                               |
| `CUSTOM_DSL` не исполняется                                                      | closed registry, восемь конструкторов и запрет `eval`/`Function`/`node:vm` в tournament runtime                     |
| Документированные максимумы bounded                                              | восемь maximum-plan cases с budget 2 секунды на чистую генерацию                                                    |

`backend/test/unit/tournament-verification.spec.ts` использует два независимых пути: прямой replay чистой стратегии
с played/walkover/double-walkover outcomes и полный application command flow `REGISTER → SEED → START → SCORE →
COMPLETE`. Второй путь обнаружил и закрепил regression для automatic bye: downstream slot теперь разрешает
`automaticWinnerEntrantId`, даже когда для source match закономерно нет result revision.

## Конкурентность и восстановление

Memory transaction harness моделирует `SERIALIZABLE` root lock и commit receipt. Два score request с одинаковой
expected version дают ровно один result; второй видит version conflict. Инъекция сбоя после вычисления состояния,
но до commit не сохраняет root, audit или receipt. Повтор с тем же operation ID выполняется один раз, последующий
replay возвращает сохранённый ответ без нового audit.

В PostgreSQL это дополняют unique generation/strategy/source keys, append-only result/audit/completion triggers,
reciprocal authoritative-result guard и единственный completion marker. Эти DDL-инварианты проверяются статически;
их runtime-поведение нельзя подменять memory harness.

## Производительность

Unit performance gate строит первый допустимый plan для документированных максимумов: Americano/round robin/
double elimination/pools/ladder/King of Court по 64 entrants, single elimination и Swiss по 128 entrants, до 64
кортов. Каждый вызов имеет консервативный budget 2 секунды. Gate измеряет только CPU pure strategy в текущем Node
runtime; это не SLO HTTP, PostgreSQL или браузера и не обещание production capacity.

## Незакрытые gates

- В backend пока отсутствуют исполняемые tournament controller/service routes, несмотря на принятый OpenAPI и
  клиентские вызовы. Поэтому настоящие HTTP authorization/idempotency и organizer/participant end-to-end для всех
  форматов не могут считаться пройденными. Contract/header/storage boundaries и application command flows зелёные,
  но не заменяют реализацию и Supertest/PostgreSQL suite.
- PostgreSQL migration/trigger concurrency, encrypted receipt replay в реальной транзакции и outbox redelivery
  требуют применённой миграции и доступного PostgreSQL. Redis не должен участвовать в корректности.
- Browser E2E сейчас покрывает публичную сетку и узкий TMA viewport на representative round robin. Полный browser
  organizer/participant lifecycle каждого формата должен идти после появления backend routes; mocked UI не может
  доказать server authorization.
- No-show/walkover и FIFO replacement проверены на уровне strategy/orchestrator primitives и SQL states. Полный
  roster/member replacement use case также зависит от отсутствующего tournament application service.

До закрытия этих gates приёмка prompt не объявляется полной и переход к `11-gamification` запрещён. Все доступные
локально algorithm, contract, formatting, lint, typecheck, test и build проверки должны оставаться зелёными.
