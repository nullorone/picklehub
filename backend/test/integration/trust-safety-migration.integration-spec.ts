import { createHash } from 'node:crypto';

import { Pool, type PoolClient } from 'pg';

import { uuidV7 } from '../../src/common/identifiers/uuid-v7';

const digest = (value: string): string => createHash('sha256').update(value).digest('hex');

async function createUser(client: PoolClient): Promise<string> {
    const id = uuidV7();
    await client.query('INSERT INTO identity_users (id) VALUES ($1::uuid)', [id]);
    return id;
}

async function createMatch(client: PoolClient, organizerId: string): Promise<string> {
    const id = uuidV7();
    await client.query(`INSERT INTO matches (id, organizer_id, state) VALUES ($1::uuid, $2::uuid, 'DRAFT')`, [
        id,
        organizerId,
    ]);
    return id;
}

describe('trust/safety contract-data migration', () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

    afterAll(async () => {
        await pool.end();
    });

    it('deduplicates a reporter subject and requires exactly one matching subtype', async () => {
        const client = await pool.connect();
        try {
            const reporterId = await createUser(client);
            const subjectId = await createUser(client);
            const signalId = uuidV7();
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO safety_signals (
                    id, reporter_id, subject_id, kind, policy_version, uniqueness_key, receipt_expires_at
                 ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'SAFETY', 'safety-v1', $4,
                    CURRENT_TIMESTAMP + INTERVAL '90 days')`,
                [signalId, reporterId, subjectId, digest('subject-one')]
            );
            await client.query(
                `INSERT INTO safety_reports (
                    signal_id, source_kind, source_id, source_revision, reason_code, time_bucket
                 ) VALUES ($1::uuid, 'PROFILE', $2::uuid, 1, 'THREAT', 'TODAY')`,
                [signalId, subjectId]
            );
            await client.query('COMMIT');

            await expect(
                client.query(
                    `INSERT INTO safety_signals (
                        id, reporter_id, subject_id, kind, policy_version, uniqueness_key, receipt_expires_at
                     ) VALUES ($1::uuid, $2::uuid, $3::uuid, 'SAFETY', 'safety-v1', $4,
                        CURRENT_TIMESTAMP + INTERVAL '90 days')`,
                    [uuidV7(), reporterId, subjectId, digest('subject-one')]
                )
            ).rejects.toMatchObject({ code: '23505' });

            await client.query('BEGIN');
            await client.query(
                `INSERT INTO safety_signals (
                    id, reporter_id, kind, policy_version, uniqueness_key, receipt_expires_at
                 ) VALUES ($1::uuid, $2::uuid, 'CONTENT', 'safety-v1', $3,
                    CURRENT_TIMESTAMP + INTERVAL '90 days')`,
                [uuidV7(), reporterId, digest('missing-subtype')]
            );
            await expect(client.query('COMMIT')).rejects.toMatchObject({ code: 'P0001' });
        } finally {
            await client.query('ROLLBACK').catch(() => undefined);
            client.release();
        }
    });

    it('keeps review/decision/audit history immutable and one no-show effect authoritative', async () => {
        const client = await pool.connect();
        try {
            const authorId = await createUser(client);
            const subjectId = await createUser(client);
            const moderatorId = await createUser(client);
            const matchId = await createMatch(client, authorId);
            const reviewId = uuidV7();
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO safety_reviews (
                    id, author_id, subject_id, match_id, eligibility_revision, policy_version, editable_until
                 ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 1, 'review-v1',
                    CURRENT_TIMESTAMP + INTERVAL '14 days')`,
                [reviewId, authorId, subjectId, matchId]
            );
            await client.query(
                `INSERT INTO safety_review_revisions (
                    review_id, revision, kind, experience_rating, tags, payload_checksum
                 ) VALUES ($1::uuid, 1, 'SUBMITTED', 5, ARRAY['RESPECT'], $2)`,
                [reviewId, digest('review-one')]
            );
            await client.query('COMMIT');
            await expect(
                client.query(`UPDATE safety_review_revisions SET experience_rating = 1 WHERE review_id = $1::uuid`, [
                    reviewId,
                ])
            ).rejects.toMatchObject({ code: 'P0001' });

            const caseId = uuidV7();
            await client.query(
                `INSERT INTO moderation_cases (
                    id, category, state, assigned_moderator_id, retention_expires_at
                 ) VALUES ($1::uuid, 'NO_SHOW', 'INVESTIGATING', $2::uuid,
                    CURRENT_TIMESTAMP + INTERVAL '3 years')`,
                [caseId, moderatorId]
            );
            const decisionId = uuidV7();
            await client.query(
                `INSERT INTO moderation_decisions (
                    id, case_id, revision, reviewer_id, outcome, policy_code, policy_version, scope_code,
                    basis_checksum
                 ) VALUES ($1::uuid, $2::uuid, 1, $3::uuid, 'NO_SHOW_CONFIRMED', 'NO_SHOW_V1', 'policy-v1',
                    'MATCH_PARTICIPATION', $4)`,
                [decisionId, caseId, moderatorId, digest('decision-one')]
            );
            await client.query(
                `INSERT INTO moderation_effects (
                    id, decision_id, kind, logical_key, owner_reference_id, no_show_match_id, no_show_subject_id,
                    source_revision
                 ) VALUES ($1::uuid, $2::uuid, 'NO_SHOW_CONFIRMED', $3, $4::uuid, $4::uuid, $5::uuid, 1)`,
                [uuidV7(), decisionId, digest('effect-one'), matchId, subjectId]
            );
            await expect(
                client.query(
                    `INSERT INTO moderation_effects (
                        id, decision_id, kind, logical_key, owner_reference_id, no_show_match_id,
                        no_show_subject_id, source_revision
                     ) VALUES ($1::uuid, $2::uuid, 'NO_SHOW_CONFIRMED', $3, $4::uuid, $4::uuid, $5::uuid, 1)`,
                    [uuidV7(), decisionId, digest('effect-two'), matchId, subjectId]
                )
            ).rejects.toMatchObject({ code: '23505' });

            const auditId = uuidV7();
            await client.query(
                `INSERT INTO audit_entries (
                    id, actor_type, actor_id, action, target_type, target_id, outcome, changed_fields,
                    request_id, correlation_id, source
                 ) VALUES ($1::uuid, 'MODERATOR', $2::uuid, 'safety.decision.create', 'moderation_decision',
                    $3::uuid, 'SUCCESS', '[]'::jsonb, $4::uuid, $5::uuid, 'REST')`,
                [auditId, moderatorId, decisionId, uuidV7(), uuidV7()]
            );
            await expect(
                client.query(`UPDATE audit_entries SET outcome = 'FAILURE' WHERE id = $1::uuid`, [auditId])
            ).rejects.toMatchObject({ code: 'P0001' });
        } finally {
            client.release();
        }
    });
});
