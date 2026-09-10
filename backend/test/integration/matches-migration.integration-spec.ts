import { Pool, type PoolClient } from 'pg';

import { uuidV7 } from '../../src/common/identifiers/uuid-v7';

async function insertUser(client: PoolClient): Promise<string> {
    const id = uuidV7();
    const identityId = uuidV7();
    const subjectKey = id.replaceAll('-', '').padEnd(64, '0');
    await client.query('BEGIN');
    await client.query('INSERT INTO identity_users (id) VALUES ($1::uuid)', [id]);
    await client.query(
        `INSERT INTO identities (
            id, user_id, provider, subject_key, subject_ciphertext, encryption_key_version
         ) VALUES ($1::uuid, $2::uuid, 'TELEGRAM', $3, $4, 1)`,
        [identityId, id, subjectKey, Buffer.from(`synthetic-${id}`)]
    );
    await client.query('COMMIT');
    return id;
}

async function insertMatch(
    client: PoolClient,
    organizerId: string,
    format: 'SINGLES' | 'DOUBLES' = 'SINGLES',
    state: 'DRAFT' | 'IN_PROGRESS' = 'DRAFT'
): Promise<string> {
    const matchId = uuidV7();
    const participantId = uuidV7();
    const capacity = format === 'SINGLES' ? 1 : 2;
    await client.query('BEGIN');
    if (state === 'IN_PROGRESS') {
        const venueId = uuidV7();
        await client.query(
            `INSERT INTO venues (
                id, name, normalized_address, locality, time_zone, longitude, latitude,
                verification_state, last_verified_at
             ) VALUES ($1::uuid, 'Test venue', 'Test address', 'Test locality', 'Europe/Moscow',
                37.6173, 55.7558, 'MODERATOR_VERIFIED', CURRENT_TIMESTAMP)`,
            [venueId]
        );
        await client.query(
            `INSERT INTO matches (
                id, organizer_id, version, state, format, visibility, join_mode, starts_at, time_zone,
                venue_id, skill_min, skill_max, description, policy_version, published_at
             ) VALUES ($1::uuid, $2::uuid, 1, 'PUBLISHED', $3::match_format, 'PUBLIC', 'AUTO',
                CURRENT_TIMESTAMP + INTERVAL '1 hour', 'Europe/Moscow', $4::uuid, 1.0, 5.0,
                'Synthetic integration match', 'matches-v1', CURRENT_TIMESTAMP)`,
            [matchId, organizerId, format, venueId]
        );
    } else {
        await client.query(
            `INSERT INTO matches (id, organizer_id, format, state)
             VALUES ($1::uuid, $2::uuid, $3::match_format, 'DRAFT')`,
            [matchId, organizerId, format]
        );
    }
    await client.query(
        `INSERT INTO match_teams (match_id, code, capacity)
         VALUES ($1::uuid, 'TEAM_A', $2), ($1::uuid, 'TEAM_B', $2)`,
        [matchId, capacity]
    );
    await client.query(
        `INSERT INTO match_participants (id, match_id, user_id, team, is_organizer)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'TEAM_A', TRUE)`,
        [participantId, matchId, organizerId]
    );
    if (state === 'IN_PROGRESS') {
        await client.query(
            `UPDATE matches SET state = 'IN_PROGRESS', version = version + 1,
                updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
            [matchId]
        );
    }
    await client.query('COMMIT');
    return matchId;
}

describe('matches contract-data migration', () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });

    afterAll(async () => {
        await pool.end();
    });

    it('serializes concurrent claims for the final team place', async () => {
        const setup = await pool.connect();
        const first = await pool.connect();
        const second = await pool.connect();
        try {
            const organizerId = await insertUser(setup);
            const firstPlayerId = await insertUser(setup);
            const secondPlayerId = await insertUser(setup);
            const matchId = await insertMatch(setup, organizerId);

            await Promise.all([first.query('BEGIN'), second.query('BEGIN')]);
            await first.query(
                `INSERT INTO match_participants (id, match_id, user_id, team)
                 VALUES ($1::uuid, $2::uuid, $3::uuid, 'TEAM_B')`,
                [uuidV7(), matchId, firstPlayerId]
            );
            const secondClaim = second.query(
                `INSERT INTO match_participants (id, match_id, user_id, team)
                 VALUES ($1::uuid, $2::uuid, $3::uuid, 'TEAM_B')`,
                [uuidV7(), matchId, secondPlayerId]
            );
            await first.query('COMMIT');
            await expect(secondClaim).rejects.toMatchObject({ code: '23514' });

            const roster = await setup.query<{ count: string }>(
                `SELECT count(*)::text FROM match_participants
                 WHERE match_id = $1::uuid AND team = 'TEAM_B' AND state = 'ACTIVE'`,
                [matchId]
            );
            expect(roster.rows[0]?.count).toBe('1');
        } finally {
            await Promise.allSettled([first.query('ROLLBACK'), second.query('ROLLBACK')]);
            setup.release();
            first.release();
            second.release();
        }
    });

    it('accepts 11, 15 and 21-point games with two-point margins in a completed series', async () => {
        const client = await pool.connect();
        try {
            const organizerId = await insertUser(client);
            const matchId = await insertMatch(client, organizerId, 'DOUBLES', 'IN_PROGRESS');
            const resultId = uuidV7();
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO match_results (
                    id, match_id, version, mode, series_format, winning_team, proposed_by
                 ) VALUES ($1::uuid, $2::uuid, 1, 'SCORED', 'BEST_OF_5', 'TEAM_A', $3::uuid)`,
                [resultId, matchId, organizerId]
            );
            await client.query(
                `INSERT INTO game_scores (result_id, game_number, team_a_points, team_b_points)
                 VALUES ($1::uuid, 1, 11, 9), ($1::uuid, 2, 15, 13), ($1::uuid, 3, 21, 19)`,
                [resultId]
            );
            await client.query(
                `UPDATE matches SET state = 'AWAITING_CONFIRMATION', version = version + 1,
                    updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
                [matchId]
            );
            await expect(client.query('COMMIT')).resolves.toBeDefined();
        } finally {
            await client.query('ROLLBACK').catch(() => undefined);
            client.release();
        }
    });

    it('rejects a game without a two-point winning margin', async () => {
        const client = await pool.connect();
        try {
            const organizerId = await insertUser(client);
            const matchId = await insertMatch(client, organizerId, 'SINGLES', 'IN_PROGRESS');
            await client.query('BEGIN');
            const resultId = uuidV7();
            await client.query(
                `INSERT INTO match_results (
                    id, match_id, version, mode, series_format, winning_team, proposed_by
                 ) VALUES ($1::uuid, $2::uuid, 1, 'SCORED', 'BEST_OF_1', 'TEAM_A', $3::uuid)`,
                [resultId, matchId, organizerId]
            );
            await expect(
                client.query(
                    `INSERT INTO game_scores (result_id, game_number, team_a_points, team_b_points)
                     VALUES ($1::uuid, 1, 11, 10)`,
                    [resultId]
                )
            ).rejects.toMatchObject({ code: '23514' });
        } finally {
            await client.query('ROLLBACK');
            client.release();
        }
    });
});
