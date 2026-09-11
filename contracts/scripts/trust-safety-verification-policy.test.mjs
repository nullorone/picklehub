import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [logger, analytics, moderation, safetyService, webSafety, tmaSafety, dataPolicy] = await Promise.all([
    read('../../backend/src/common/logging/application-logger.service.ts'),
    read('../../frontend/packages/analytics/src/index.ts'),
    read('../../backend/src/trust-safety/moderation.service.ts'),
    read('../../backend/src/trust-safety/trust-safety.service.ts'),
    read('../../frontend/web/src/safety-ui.tsx'),
    read('../../frontend/tg/src/safety-ui.tsx'),
    read('../../llm/_docs/trust-safety-data-policy.md'),
]);

test('narrative fields are denied in logs, analytics and client error-report paths', () => {
    for (const key of [
        'evidence',
        'submittedEvidence',
        'reviewText',
        'responseText',
        'appealText',
        'reportDescription',
    ]) {
        assert(logger.toLowerCase().includes(`'${key.toLowerCase()}'`), `Logger does not redact ${key}`);
        assert(!analytics.includes(key), `Analytics taxonomy accepts restricted field ${key}`);
    }
    for (const source of [webSafety, tmaSafety]) {
        assert.doesNotMatch(source, /console\.|captureException|captureMessage|\.track\(/u);
    }
});

test('public projection and asynchronous sinks contain no unconfirmed accusation narrative', () => {
    const reputationMethod = safetyService.match(/async publicReputation[\s\S]*?\n    async listBlocks/u)?.[0];
    assert(reputationMethod, 'Public reputation projection is missing');
    const publicResponse = reputationMethod.match(/return \{([\s\S]*?)\n        \};/u)?.[0];
    assert(publicResponse, 'Public reputation response is missing');
    for (const forbidden of ['evidence', 'reasonCode', 'reporterId', 'subjectId', 'textCiphertext']) {
        assert(!publicResponse.includes(forbidden), `Public reputation exposes ${forbidden}`);
    }
    assert.match(moderation, /data: \{ \[idField\]: id, category \}/u);
    assert.doesNotMatch(moderation, /data: \{[^}]*evidence/u);
});

test('all implemented moderation state changes append minimal audit entries', () => {
    for (const action of [
        'safety.case.triaged',
        'safety.case.assigned',
        'safety.case.investigation.started',
        'safety.decision.recorded',
    ]) {
        assert(moderation.includes(action), `Moderation audit action is missing: ${action}`);
    }
    assert.match(moderation, /changedFields: \{ fields \}/u);
    assert.doesNotMatch(moderation, /changedFields: \{[^}]*evidence/u);
});

test('retention scan covers primary data, derived sinks, backups and scoped legal holds', () => {
    for (const statement of [
        'криптоудаление payload',
        'cache, queue/DLQ и export',
        '35 суток',
        'case-local pseudonym',
        /Hold не\s+распространяется на весь аккаунт/u,
    ]) {
        const present = statement instanceof RegExp ? statement.test(dataPolicy) : dataPolicy.includes(statement);
        assert(present, `Retention policy statement is missing: ${String(statement)}`);
    }
});
