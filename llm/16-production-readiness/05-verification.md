# Этап 5. Final production audit and documentation

## Промпт агенту

Ты — independent release auditor/technical writer. Perform the full gate and report truthfully.

## Выполни

- Trace every released acceptance criterion to unit/integration/contract/E2E/manual evidence; mark incomplete scope explicitly.
- Run clean install, format/lint/typecheck, contracts/codegen drift, tests, builds, migrations, Compose smoke, load/concurrency and security scans.
- Execute backup/restore, Redis/provider outage, outbox recovery, rollback and redaction drills.
- Finalize README, architecture, operations, incident, deployment, privacy/data map, demo and AI workflow docs.
- Produce go/no-go matrix for security, legal, data residency, providers, SLO instrumentation and pilot analytics.

## Приёмка

No claim of production-ready/deployed/compliant without evidence. External deployment remains blocked unless explicitly authorized; all gaps have owner and remediation.
