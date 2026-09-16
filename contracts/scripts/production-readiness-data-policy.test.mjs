import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationRoot = new URL('../../backend/prisma/migrations/', import.meta.url);
const currentMigration = await readFile(
    new URL('20260916190000_production_readiness_contract_data/migration.sql', migrationRoot),
    'utf8'
);
const schema = await readFile(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');
const policy = await readFile(
    new URL('../../llm/_docs/production-readiness-contract-data.md', import.meta.url),
    'utf8'
);

test('every committed migration has an explicit production disposition', async () => {
    const migrations = (await readdir(migrationRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort();

    assert.equal(migrations.length, 23);
    for (const migration of migrations) {
        assert.match(policy, new RegExp('`' + migration + '`[\\s|]+`(?:EMPTY|EXPAND|BLOCKED)`'));
    }

    for (const blocked of [
        '20260911230000_admin_backoffice_contract_data',
        '20260913120000_gamification_backend',
        '20260915150000_advertising_backend_guards',
        '20260916090000_mobile_parity_contract_data',
        '20260916130000_mini_game_contract_data',
    ]) {
        assert.match(policy, new RegExp('`' + blocked + '`[\\s|]+`BLOCKED`'));
    }
});

test('privacy lifecycle schema is idempotent, bounded and does not persist raw subject values', () => {
    for (const table of [
        'privacy_requests',
        'data_lifecycle_tasks',
        'deletion_suppressions',
        'storage_object_records',
        'reconciliation_runs',
        'reconciliation_findings',
        'data_legal_holds',
    ]) {
        assert.match(currentMigration, new RegExp(`CREATE TABLE "${table}"`));
    }

    assert.match(currentMigration, /privacy_requests_active_kind_key/u);
    assert.match(currentMigration, /data_lifecycle_tasks_request_sink_key/u);
    assert.match(currentMigration, /deletion_suppressions_append_only/u);
    assert.match(currentMigration, /privacy_requests_state_machine/u);
    assert.match(currentMigration, /data_lifecycle_tasks_state_machine/u);
    assert.match(currentMigration, /data_lifecycle_tasks_request_guard/u);
    assert.match(currentMigration, /privacy_requests_completion_guard/u);
    assert.match(currentMigration, /storage_object_records_state_machine/u);
    assert.match(currentMigration, /reconciliation_runs_state_machine/u);
    assert.match(currentMigration, /reconciliation_findings_state_machine/u);
    assert.match(currentMigration, /data_legal_holds_state_machine/u);
    assert.match(currentMigration, /"subject_key" CHAR\(64\) NOT NULL/u);
    assert.match(currentMigration, /"object_key_hash" CHAR\(64\) NOT NULL/u);
    assert.match(currentMigration, /"object_key_ciphertext" BYTEA NOT NULL/u);
    assert.doesNotMatch(currentMigration, /"(?:email|telegram_id|raw_subject|raw_object_key|export_payload)"/iu);

    for (const model of [
        'PrivacyRequest',
        'DataLifecycleTask',
        'DeletionSuppression',
        'StorageObjectRecord',
        'ReconciliationRun',
        'ReconciliationFinding',
        'DataLegalHold',
    ]) {
        assert.match(schema, new RegExp(`model ${model} \\{`));
    }
});

test('recovery, compatibility, environments and secret rotation remain explicit gates', () => {
    for (const requirement of [
        'backend `N`',
        'Expand/migrate/contract',
        'deletion suppression',
        'POSTGRESQL_OBJECT_STORAGE',
        'Матрица окружений',
        'Владение и ротация секретов',
        'публичный запуск остаётся `NO-GO`',
    ]) {
        assert(policy.includes(requirement), `Missing production-readiness rule: ${requirement}`);
    }
});
