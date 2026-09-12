# Backend турнирного движка

Документ фиксирует реализацию `llm/10-tournaments/03-backend.md`. Wire-контракт и SQL-инварианты остаются в
[`tournaments-data-policy.md`](tournaments-data-policy.md); этот документ описывает исполняемое алгоритмическое
ядро и транзакционную границу.

## Чистая стратегия

`TournamentStrategyRegistry` — закрытый allowlist восьми реализаций версии `1.0.0`. `CUSTOM_DSL`, неизвестный
формат и неизвестная версия не загружают модуль динамически и отклоняются. Стратегия читает только preset,
упорядоченные entrants с уже материализованными seed/lot, append-only result revisions и projection revision.
Clock, сеть, БД, Redis, profile и environment ей недоступны.

Выход использует единые stage/round/match/standing структуры и стабильные strategy keys. Перед вычислением
canonical SHA-256 проверяются уникальность entrants/seeds/lots/match keys, отсутствие entrant-дубликата в одной
волне, существование result match и принадлежность победителя разрешившимся slots. Числа `bigint` кодируются
канонически строкой; порядок ключей объекта не влияет на checksum.

Инициализированная случайность не вызывается из стратегии. `materializeTieBreakLots` детерминированно разворачивает
сохранённый seed случайности и entrant ID через SHA-256, устраняя collision счётчиком. Повтор после сбоя создаёт те
же публичные уникальные lots.

## Реализации форматов

- Americano строит circle partner schedule без повторения партнёра в первых `N-1` раундах, группирует соседние
  пары и считает личную статистику со strength of schedule.
- Round robin использует circle method, явный bye для нечётного состава и обратный номинальный порядок второго
  leg.
- Single elimination использует рекурсивный seed order и явные automatic bye; optional bronze отделён от финала.
- Double elimination хранит отдельные winners/losers stages, обратный порядок injection из winners bracket и
  conditional grand-final reset. Reset не является обязательной terminal-встречей, пока finalist из losers не
  выиграл первую grand final.
- Pool play распределяет seed змейкой, завершает отдельные circle pools, выбирает direct qualifiers и
  нормированные wildcards, после чего создаёт single-elimination playoff.
- Swiss создаёт только очередную разрешённую волну, сначала избегает rematch, затем минимизирует seed gap; нечётный
  bye идёт низшему участнику без прежнего bye. Итог содержит Buchholz и заканчивается lot.
- Ladder формирует непересекающиеся пары в пределах опубликованного `challengeSpan` и меняет только позиции
  challenger/defender одновременно после terminal-волны.
- King of Court одновременно переносит winners вверх и losers вниз, сохраняя перестановку entrants и ровно два
  участника на каждом ranked court.

Все стратегии останавливают зависимую генерацию на первой незавершённой волне. Поэтому replay не создаёт
предполагаемый исход, а следующий вызов с теми же authoritative revisions возвращает тот же граф.

## Команды и атомарность

`TournamentOrchestrator` реализует регистрацию/FIFO promotion, check-in/withdrawal, seed, start round/match,
court assignment, score, correction, recovery, pause/resume, completion и cancellation. Каждая команда проверяет
expected aggregate version; entrant и court transitions также проверяют resource revision. Audit operation ID
делает повтор команды no-op.

`TournamentIdempotencyService` выполняет HTTP application command в `SERIALIZABLE` Prisma transaction: блокирует
actor, читает scoped receipt `actor + method + canonical path + key`, исполняет callback и записывает encrypted
response в той же транзакции. `P2034` повторяется bounded числом попыток. `TournamentTransactionPort` формализует
обязательный `SERIALIZABLE` root-lock adapter для worker/application orchestration; Redis lease не участвует в
корректности.

Result append принимает только последовательную revision и не допускает draw. Winner-changing correction
разрешена, пока зависимая встреча не стартовала: projection полностью перестраивается из authoritative input.
После старта зависимости correction не добавляется, состояние становится `PAUSED` с закрытым reason. Recovery
повторно строит plan и fail-closed отклоняет checksum mismatch. Completion требует resolved champion, terminal
каждую required match, уникальные ranks и отсутствие прежнего completion checksum.

## Проверяемые свойства

Unit/property-style suite проверяет golden odd round robin и bracket seed order, уникальность Americano partners,
размер winners/losers graph, conditional reset, Swiss без rematch, delayed pool playoff, одновременную fairness
перестановку ladder/courts, scoring cap, детерминизм checksum и полные симуляции всех восьми форматов. Отдельная
suite проверяет FIFO, idempotent replay, rollback неуспешной транзакции, стабильные lots/recovery и позднюю
winner-changing correction.

PostgreSQL migration/trigger runtime остаётся обязательной CI-проверкой: локальное окружение не предоставляет
schema engine или PostgreSQL socket, поэтому успешное применение DDL здесь не заявляется.
