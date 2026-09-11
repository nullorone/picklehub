import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const schema = await readFile(new URL('../../backend/prisma/schema.prisma', import.meta.url), 'utf8');
const migration = await readFile(
    new URL('../../backend/prisma/migrations/20260911220000_trust_safety_contract_data/migration.sql', import.meta.url),
    'utf8'
);
const policy = await readFile(new URL('../../llm/_docs/trust-safety-data-policy.md', import.meta.url), 'utf8');

test('Prisma models separate signals, cases, decisions, effects and encrypted evidence', () => {
    for (const model of [
        'Review',
        'ReviewRevision',
        'SafetySignal',
        'NoShowReport',
        'Report',
        'SafetyEvidence',
        'ModerationCase',
        'ModerationDecision',
        'ModerationEffect',
        'ModerationAppeal',
        'ReviewReputationContribution',
        'ReviewReputationAggregate',
        'SafetyLegalHold',
        'SafetyIdempotencyRecord',
    ]) {
        assert.match(schema, new RegExp(`model ${model} \\{`));
    }
    const evidenceModel = schema.match(/model SafetyEvidence \{([^}]*)\}/u)?.[1] ?? '';
    assert.doesNotMatch(evidenceModel, /\btext\s+String/u);
    assert.match(schema, /ciphertext\s+Bytes/u);
    assert.match(schema, /textCiphertext\s+Bytes\?/u);
});

test('migration enforces business deduplication, lifecycle and append-only records', () => {
    for (const invariant of [
        'safety_reviews_author_subject_match_key',
        'safety_signals_reporter_subject_key',
        'moderation_effects_logical_key',
        'moderation_effects_no_show_outcome_key',
        'moderation_appeals_decision_appellant_key',
        'safety_idempotency_scope_key',
        'safety_signals_transition_guard',
        'moderation_cases_transition_guard',
        'safety_reviews_head_guard',
        'moderation_decisions_reviewer_guard',
        'moderation_appeals_reviewer_guard',
        'audit_entries_immutable',
    ]) {
        assert(migration.includes(invariant), `Missing migration invariant ${invariant}`);
    }
    assert.match(migration, /BEFORE UPDATE OR DELETE ON "moderation_decisions"/u);
    assert.match(migration, /"review_deadline" <= "created_at" \+ INTERVAL '72 hours'/u);
});

test('restricted payloads use versioned encryption and never enter searchable metadata', () => {
    assert.match(migration, /"ciphertext" BYTEA NOT NULL/u);
    assert.match(migration, /"encryption_key_version" INTEGER NOT NULL/u);
    assert.match(migration, /"aad_version" INTEGER NOT NULL/u);
    assert.doesNotMatch(migration, /"evidence_text"|"review_text"|"response_text"/u);
    assert.match(policy, /authenticated ciphertext/u);
    assert.match(policy, /outbox, BullMQ и DLQ/u);
});

test('retention, account deletion, cryptoshredding and scoped legal hold are documented', () => {
    for (const required of [
        'криптоудаление',
        'case-local pseudonym',
        'deletion/suppression ledger',
        '35 суток',
        'safety_legal_holds',
    ]) {
        assert(policy.includes(required), `Missing retention statement: ${required}`);
    }
    assert.match(policy, /не\s+распространяется на весь аккаунт/u);
    assert.match(migration, /"record_scope" VARCHAR\(96\) NOT NULL/u);
    assert.match(migration, /"review_at" TIMESTAMPTZ\(3\) NOT NULL/u);
    assert.match(migration, /"expires_at" TIMESTAMPTZ\(3\) NOT NULL/u);
});
