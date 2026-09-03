# ADR 0002. Modular monolith and contracts

- Status: accepted
- Date: 2026-09-03

## Decision

Use one NestJS modular monolith with PostgreSQL/PostGIS, Redis/BullMQ and transactional outbox. REST is design-first OpenAPI; WebSocket and event envelopes are AsyncAPI. npm workspaces/Turborepo manage one repository and shared non-UI client packages.

## Consequences

- One developer can deploy and observe the system without microservice overhead.
- Database transactions preserve match and progression invariants.
- Provider adapters and module boundaries allow later extraction if measured load requires it.
- Redis failure may delay background work but must not roll back an already committed domain change.
