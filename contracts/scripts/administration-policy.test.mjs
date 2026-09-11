import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { parse } from 'yaml';
import { checkAdministrationContract } from './administration-policy.mjs';

const openApi = parse(await readFile(new URL('../../openapi.yaml', import.meta.url), 'utf8'));

test('administration contract is bounded, least-privilege and non-exporting', () => {
    assert.doesNotThrow(() => checkAdministrationContract(openApi));
});

test('audit projection cannot acquire narrative or evidence', () => {
    const changed = structuredClone(openApi);
    changed.components.schemas.AuditEntry.properties.evidence = { type: 'string' };
    assert.throws(() => checkAdministrationContract(changed), /deep-equal|AuditEntry exposes restricted/);
});

test('an admin export endpoint is rejected', () => {
    const changed = structuredClone(openApi);
    changed.paths['/admin/audit/export'] = changed.paths['/admin/audit'];
    assert.throws(() => checkAdministrationContract(changed), /must not expose export/);
});

test('an operation cannot grant itself to a role outside the fixed capability registry', () => {
    const changed = structuredClone(openApi);
    changed.paths['/admin/cases/{caseId}/decision'].post['x-admin-roles'] = ['EDITOR'];
    assert.throws(() => checkAdministrationContract(changed), /fixed registry for EDITOR/);
});
