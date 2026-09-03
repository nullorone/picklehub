# Этап 3. Match backend

## Промпт агенту

Ты — senior transactional NestJS engineer. Реализуй match application/domain module.

## Выполни

- Реализуй state machine и authorization организатора/участника, не помещая правила в controller.
- Последнее место, approval и waitlist promotion защищай database transaction/constraints; auto FIFO promotion идемпотентна.
- Discovery использует PostGIS, cursor pagination и deterministic recommendation score с reason codes.
- Result proposal/confirmation/dispute атомарно создаёт outbox; stats update потребляет confirmed event один раз.
- Используй injectable clock, structured audit и configurable cutoffs.

## Приёмка

Create/join/cancel/result races детерминированы; failed promotion не теряет очередь; disputed result не публикует completion. Запусти repeated concurrency tests.
