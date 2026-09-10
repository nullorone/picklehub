import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
    new URL('../../backend/prisma/migrations/20260908090000_identity_onboarding/migration.sql', import.meta.url),
    'utf8'
);
const prisma = readFileSync(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');

test('identity migration creates the required owned records', () => {
    for (const table of [
        'identity_users',
        'identities',
        'identity_sessions',
        'refresh_credentials',
        'access_credentials',
        'identity_attempts',
        'magic_links',
        'telegram_proof_replays',
        'consent_documents',
        'consents',
        'player_profile_drafts',
        'identity_idempotency_records',
    ]) {
        assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
        assert.match(prisma, new RegExp(`@@map\\("${table}"\\)`));
    }
});

test('database uniqueness owns identity and one-time credential races', () => {
    for (const index of [
        'identities_provider_subject_key',
        'identities_user_provider_key',
        'refresh_credentials_token_hash_key',
        'refresh_credentials_current_key',
        'magic_links_token_hash_key',
        'magic_links_pending_scope_key',
        'identity_idempotency_scope_key',
    ]) {
        assert.match(migration, new RegExp(`CREATE UNIQUE INDEX "?${index}"?`));
    }
    assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
    assert.match(migration, /identities_require_remaining/);
    assert.match(migration, /identity_users_protect_transition/);
    assert.match(migration, /magic_links_protect_transition/);
    assert.match(migration, /refresh_credentials_protect_transition/);
    assert.match(migration, /identity_attempts_protect_transition/);
});

test('credential material is hashed or encrypted and bounded by server TTLs', () => {
    assert.doesNotMatch(migration, /"(?:email|telegram_init_data|raw_token|refresh_token|access_token)"/i);
    assert.match(migration, /"subject_key" CHAR\(64\) NOT NULL/);
    assert.match(migration, /"subject_ciphertext" BYTEA NOT NULL/);
    assert.match(migration, /"token_hash" CHAR\(64\) NOT NULL/);
    assert.match(migration, /expires_at <= created_at \+ INTERVAL '5 minutes'/);
    assert.match(migration, /expires_at <= created_at \+ INTERVAL '10 minutes'/);
    assert.match(migration, /expires_at = created_at \+ INTERVAL '24 hours'/);
    assert.match(migration, /"response_ciphertext" BYTEA NOT NULL/);
    assert.doesNotMatch(migration, /"response_body"/);
});

test('consent history and security records cannot be rewritten by runtime updates', () => {
    assert.match(migration, /consents_reject_update/);
    assert.match(migration, /consent_documents_protect_content/);
    assert.match(migration, /access_credentials_reject_update/);
    assert.match(migration, /telegram_proof_replays_reject_update/);
    assert.match(migration, /identity_idempotency_records_reject_update/);
});
