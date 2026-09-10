import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const migration = readFileSync(
    new URL(
        '../../backend/prisma/migrations/20260911100000_chat_notifications_contract_data/migration.sql',
        import.meta.url
    ),
    'utf8'
);
const prisma = readFileSync(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');

test('communications migration owns chat and notification records', () => {
    for (const table of [
        'conversations',
        'conversation_memberships',
        'chat_messages',
        'chat_message_revisions',
        'chat_message_reports',
        'communication_blocks',
        'notification_preferences',
        'notification_preference_channels',
        'notifications',
        'notification_deliveries',
        'notification_devices',
        'communication_event_receipts',
        'communication_idempotency_records',
    ]) {
        assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
        assert.match(prisma, new RegExp(`@@map\\("${table}"\\)`));
    }
});

test('database allocates a unique monotonic conversation sequence', () => {
    assert.match(migration, /chat_allocate_sequence/);
    assert.match(migration, /UPDATE "conversations"/);
    assert.match(migration, /"latest_sequence" = "latest_sequence" \+ 1/);
    assert.match(migration, /chat_messages_conversation_sequence_key/);
    assert.match(migration, /chat_messages_allocate_sequence/);
});

test('membership read boundaries and revisions are storage protected', () => {
    assert.match(migration, /"last_read_sequence" <= "access_through_sequence"/);
    assert.match(migration, /"access_revoked_at" \+ INTERVAL '30 days'/);
    assert.match(migration, /last read sequence cannot move backward/);
    assert.match(migration, /revoked access boundary is immutable/);
    assert.match(migration, /chat_message_revisions_reject_update/);
    assert.match(migration, /chat_messages_current_revision_guard/);
    assert.match(migration, /chat_messages_system_source_event_key/);
});

test('logical notification and channel delivery retries deduplicate independently', () => {
    assert.match(migration, /notifications_logical_key/);
    assert.match(migration, /notification_deliveries_logical_key/);
    assert.match(migration, /notification_deliveries_idempotency_key/);
    assert.match(migration, /notification_preference_channels_in_app_check/);
    assert.match(migration, /"channel" IN \('TELEGRAM', 'EMAIL'\)/);
    assert.match(migration, /"attempts" BETWEEN 0 AND 12/);
});

test('generic replay and delivery storage avoids raw message/contact fields', () => {
    assert.match(migration, /"response_ciphertext" BYTEA NOT NULL/);
    assert.match(migration, /"evidence_ciphertext" BYTEA NOT NULL/);
    assert.doesNotMatch(migration, /"(?:email|telegram_subject|chat_text|provider_payload|preview|raw_token)"/i);
});
