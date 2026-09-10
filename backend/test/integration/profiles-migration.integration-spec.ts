import { createHash } from 'node:crypto';

import { Pool, type PoolClient } from 'pg';

import { uuidV7 } from '../../src/common/identifiers/uuid-v7';

async function createUser(client: PoolClient): Promise<string> {
    const userId = uuidV7();
    await client.query('INSERT INTO identity_users (id) VALUES ($1::uuid)', [userId]);
    return userId;
}

async function createGeneration(client: PoolClient, checksum = createHash('sha256').update('').digest('hex')) {
    const generationId = uuidV7();
    await client.query(
        `INSERT INTO profile_projection_generations (
            id, snapshot_cutoff, snapshot_revision, contribution_count, contribution_checksum
         ) VALUES ($1::uuid, CURRENT_TIMESTAMP, 0, 0, $2)`,
        [generationId, checksum]
    );
    return generationId;
}

describe('profiles contract-data migration', () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

    afterAll(async () => {
        await pool.end();
    });

    it('activates only a generation whose contribution count and checksum match', async () => {
        const client = await pool.connect();
        try {
            const validId = await createGeneration(client);
            await client.query(
                `UPDATE profile_projection_generations
                 SET state = 'READY', ready_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
                [validId]
            );
            await expect(
                client.query(
                    `UPDATE profile_projection_generations
                     SET state = 'ACTIVE', activated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
                    [validId]
                )
            ).resolves.toBeDefined();

            const invalidId = await createGeneration(client, '0'.repeat(64));
            await expect(
                client.query(
                    `UPDATE profile_projection_generations
                     SET state = 'READY', ready_at = CURRENT_TIMESTAMP WHERE id = $1::uuid`,
                    [invalidId]
                )
            ).rejects.toMatchObject({ code: 'P0001' });
        } finally {
            client.release();
        }
    });

    it('rejects an older or conflicting contribution revision', async () => {
        const client = await pool.connect();
        try {
            const playerId = await createUser(client);
            const matchId = uuidV7();
            await client.query(`INSERT INTO matches (id, organizer_id, state) VALUES ($1::uuid, $2::uuid, 'DRAFT')`, [
                matchId,
                playerId,
            ]);
            const generationId = await createGeneration(client);
            await client.query(
                `INSERT INTO player_statistic_contributions (
                    generation_id, match_id, player_id, eligibility_revision, format, outcome, source_checksum
                 ) VALUES ($1::uuid, $2::uuid, $3::uuid, 2, 'SINGLES', 'EXCLUDED', $4)`,
                [generationId, matchId, playerId, '1'.repeat(64)]
            );
            await expect(
                client.query(
                    `UPDATE player_statistic_contributions SET eligibility_revision = 1
                     WHERE generation_id = $1::uuid AND match_id = $2::uuid AND player_id = $3::uuid`,
                    [generationId, matchId, playerId]
                )
            ).rejects.toMatchObject({ code: 'P0001' });
            await expect(
                client.query(
                    `UPDATE player_statistic_contributions SET source_checksum = $4
                     WHERE generation_id = $1::uuid AND match_id = $2::uuid AND player_id = $3::uuid`,
                    [generationId, matchId, playerId, '2'.repeat(64)]
                )
            ).rejects.toMatchObject({ code: 'P0001' });
        } finally {
            client.release();
        }
    });

    it('enforces ALL as the exact sum of singles and doubles at commit', async () => {
        const client = await pool.connect();
        try {
            const playerId = await createUser(client);
            const generationId = await createGeneration(client);
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO player_statistic_aggregates (
                    generation_id, player_id, slice, played, wins, losses, games_played, points_for, points_against
                 ) VALUES
                    ($1::uuid, $2::uuid, 'SINGLES', 2, 1, 1, 3, 24, 20),
                    ($1::uuid, $2::uuid, 'DOUBLES', 1, 1, 0, 2, 22, 16),
                    ($1::uuid, $2::uuid, 'ALL', 3, 2, 1, 5, 46, 36)`,
                [generationId, playerId]
            );
            await client.query('COMMIT');

            await client.query('BEGIN');
            await client.query(
                `UPDATE player_statistic_aggregates SET points_for = 45
                 WHERE generation_id = $1::uuid AND player_id = $2::uuid AND slice = 'ALL'`,
                [generationId, playerId]
            );
            await expect(client.query('COMMIT')).rejects.toMatchObject({ code: 'P0001' });
        } finally {
            await client.query('ROLLBACK').catch(() => undefined);
            client.release();
        }
    });
});
