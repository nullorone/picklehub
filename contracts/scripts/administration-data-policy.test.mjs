import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const schema = await readFile(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = await readFile(
    new URL(
        '../../backend/prisma/migrations/20260911230000_admin_backoffice_contract_data/migration.sql',
        import.meta.url
    ),
    'utf8'
);
const policy = await readFile(new URL('../../llm/_docs/admin-backoffice-data-policy.md', import.meta.url), 'utf8');

test('Prisma has fixed grants, isolated sessions, scoped break-glass, receipts and restrictions', () => {
    for (const model of [
        'PlatformRoleGrant',
        'AdminSession',
        'BreakGlassGrant',
        'AdminOperationReceipt',
        'UserRestriction',
    ]) {
        assert.match(schema, new RegExp(`model ${model} \\{`));
    }
    assert.match(schema, /enum PlatformRole \{[\s\S]*SUPERADMIN[\s\S]*MODERATOR[\s\S]*EDITOR[\s\S]*ADS_MANAGER/u);
    assert.doesNotMatch(schema, /model (CustomRole|PermissionGrant|ExportJob) \{/u);
    assert.match(schema, /justificationCiphertext\s+Bytes/u);
    assert.match(schema, /credentialHash\s+String/u);
});

test('migration enforces independent grant, bounded sessions and exact-case break-glass', () => {
    for (const invariant of [
        'platform_role_grants_no_self_grant_check',
        'platform_role_grants_active_key',
        'admin_sessions_audience_check',
        'admin_sessions_time_bounds_check',
        'admin_sessions_grant_guard',
        'break_glass_grants_active_case_key',
        'break_glass_grants_transition_guard',
        'user_restrictions_active_scope_key',
        'user_restrictions_transition_guard',
        'admin_operation_receipts_scope_key',
    ]) {
        assert(migration.includes(invariant), `Missing administration invariant ${invariant}`);
    }
    assert.match(migration, /"expires_at" <= "created_at" \+ INTERVAL '30 minutes'/u);
    assert.match(migration, /"idle_expires_at" <= "last_seen_at" \+ INTERVAL '15 minutes'/u);
    assert.match(migration, /"absolute_expires_at" <= "created_at" \+ INTERVAL '8 hours'/u);
});

test('audit is extended without rewriting history and remains append-only', () => {
    assert.match(migration, /ALTER TABLE "audit_entries"[\s\S]*ADD COLUMN "operation_id" UUID/u);
    assert.match(migration, /audit_entries_admin_shape_check[\s\S]*NOT VALID/u);
    assert.doesNotMatch(migration, /UPDATE\s+"audit_entries"|DELETE\s+FROM\s+"audit_entries"/u);
    assert.match(migration, /REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "audit_entries" FROM PUBLIC/u);
    assert.match(migration, /admin_operation_receipts_immutable/u);
    assert.match(migration, /"target_id" IS NOT NULL/u);
    assert.match(migration, /"reason_code" IS NOT NULL/u);
    assert.match(policy, /append-only/u);
});

test('lookup, cursor and export data are minimized', () => {
    assert.match(policy, /keyed HMAC index/u);
    assert.match(policy, /actor, active role, capability, purpose, filters/u);
    assert.match(policy, /CSV, JSON, print packet, signed URL или export job не создаются/u);
    assert.doesNotMatch(migration, /lookup_query|email_query|telegram_query|export_jobs/u);
});
