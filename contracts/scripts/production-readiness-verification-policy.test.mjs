import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const [verification, requirements, contractData, backend, frontend, operations, rootReadme] = await Promise.all([
    read('llm/_docs/production-readiness-verification.md'),
    read('llm/_docs/production-readiness-requirements.md'),
    read('llm/_docs/production-readiness-contract-data.md'),
    read('llm/_docs/production-readiness-backend.md'),
    read('llm/_docs/production-readiness-frontend.md'),
    read('llm/_docs/operations.md'),
    read('README.md'),
]);

test('final audit keeps public production fail-closed and separates evidence states', () => {
    assert.match(verification, /публичного запуска —\s*\*\*`NO-GO`\*\*/u);
    assert.match(verification, /`PASS` —/u);
    assert.match(verification, /`PARTIAL` —/u);
    assert.match(verification, /`BLOCKED` —/u);
    assert.match(verification, /Внешнее развёртывание не выполнялось/u);
    assert.doesNotMatch(verification, /юридическое соответствие подтверждено|production развёрнут/iu);
});

test('every launch gate has an owner role and concrete closure evidence', () => {
    assert.match(verification, /## 6\. Матрица решения о запуске/u);
    for (const gate of [
        '152-ФЗ',
        'РФ-локализация',
        'Пять SLI',
        'Capacity',
        'Backup/PITR',
        'Incident response',
        'Privacy export/deletion',
        'Pilot analytics',
    ]) {
        assert.match(verification, new RegExp(gate, 'u'));
    }
    assert.match(verification, /Ответственный владелец роли/u);
    assert.match(verification, /Как получить достаточное evidence/u);
    assert.match(verification, /Ни одна роль в таблице пока не назначена конкретному человеку/u);
});

test('audit traces implementation and preserves unresolved migration and infrastructure gates', () => {
    assert.match(verification, /Трассировка критериев этапов 01–04/u);
    assert.match(verification, /пять путей явно имеют `BLOCKED`/iu);
    assert.match(verification, /Redis loss/u);
    assert.match(verification, /Outbox\/queue recovery/u);
    assert.match(verification, /Managed PITR/u);
    assert.equal(contractData.match(/\| `BLOCKED` \|/gu)?.length, 5);
    assert.match(backend, /Реальный\s+container restart, Redis\/provider outage/u);
    assert.match(frontend, /Фактический canary\/rollback на провайдере не выполнен/u);
});

test('operations and repository entrypoint link the final audit without changing external authority', () => {
    assert.match(rootReadme, /Итоговый production-аудит/u);
    assert.match(rootReadme, /production-readiness-verification\.md/u);
    assert.match(operations, /production-readiness-verification\.md/u);
    assert.match(requirements, /NO-GO/u);
});

test('verification covers load, recovery, documentation, privacy map, demo and AI evidence boundaries', () => {
    assert.match(verification, /## 3\. Нагрузка, конкуренция/u);
    assert.match(verification, /## 4\. Учебные сбои и восстановление/u);
    assert.match(verification, /### Карта приватности и данных/u);
    assert.match(verification, /### Демонстрация внутреннего этапа/u);
    assert.match(verification, /### AI workflow/u);
    assert.match(verification, /AI-generated statement не является\s+evidence/u);
});
