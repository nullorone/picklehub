import { Pool, type PoolClient } from 'pg';

import { uuidV7 } from '../../src/common/identifiers/uuid-v7';

interface IndexRow {
    indexname: string;
    indexdef: string;
}

async function insertVenue(client: PoolClient, id: string, longitude: number, latitude: number): Promise<void> {
    await client.query(
        `INSERT INTO venues (
            id, name, normalized_address, locality, time_zone, longitude, latitude,
            verification_state, last_verified_at
        ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, 'MODERATOR_VERIFIED', CURRENT_TIMESTAMP)`,
        [id, `Venue ${id}`, `Address ${id}`, 'Москва', 'Europe/Moscow', longitude, latitude]
    );
}

describe('venues contract-data migration', () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });

    afterAll(async () => {
        await pool.end();
    });

    it('creates generated WGS84 points and GiST indexes', async () => {
        const result = await pool.query<IndexRow>(`
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND indexname IN ('venues_location_gist_idx', 'venue_candidates_location_gist_idx')
            ORDER BY indexname
        `);

        expect(result.rows).toHaveLength(2);
        expect(result.rows.every((row) => /USING gist \(location\)/iu.test(row.indexdef))).toBe(true);
    });

    it('uses the venue GiST index for radius and bounding-area predicates', async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await insertVenue(client, uuidV7(), 37.6173, 55.7558);
            await insertVenue(client, uuidV7(), 37.7, 55.8);
            await client.query('SET LOCAL enable_seqscan = off');

            const radiusPlan = await client.query(`
                EXPLAIN (FORMAT JSON)
                SELECT id
                FROM venues
                WHERE publication_state = 'PUBLISHED'
                  AND ST_DWithin(
                      location,
                      ST_SetSRID(ST_MakePoint(37.6173, 55.7558), 4326)::geography,
                      50000
                  )
            `);
            expect(JSON.stringify(radiusPlan.rows)).toMatch(/venues_location_gist_idx/u);

            const boundsPlan = await client.query(`
                EXPLAIN (FORMAT JSON)
                SELECT id
                FROM venues
                WHERE publication_state = 'PUBLISHED'
                  AND ST_Intersects(
                      location,
                      ST_MakeEnvelope(37.5, 55.6, 37.8, 55.9, 4326)::geography
                  )
            `);
            expect(JSON.stringify(boundsPlan.rows)).toMatch(/venues_location_gist_idx/u);
        } finally {
            await client.query('ROLLBACK');
            client.release();
        }
    });

    it('keeps an old match reference valid after resolving a merge alias', async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const previousVenueId = uuidV7();
            const canonicalVenueId = uuidV7();
            await insertVenue(client, previousVenueId, 37.6173, 55.7558);
            await insertVenue(client, canonicalVenueId, 37.6174, 55.7559);
            await client.query(
                `CREATE TEMP TABLE match_venue_reference (
                    match_id uuid PRIMARY KEY,
                    venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE RESTRICT
                ) ON COMMIT DROP`
            );
            await client.query('INSERT INTO match_venue_reference (match_id, venue_id) VALUES ($1::uuid, $2::uuid)', [
                uuidV7(),
                previousVenueId,
            ]);
            await client.query(
                `UPDATE venues
                 SET publication_state = 'MERGED', canonical_venue_id = $2::uuid, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1::uuid`,
                [previousVenueId, canonicalVenueId]
            );

            const reference = await client.query<{ venue_id: string; resolved_id: string }>(
                `SELECT m.venue_id::text, resolve_canonical_venue_id(m.venue_id)::text AS resolved_id
                 FROM match_venue_reference AS m`
            );
            expect(reference.rows).toEqual([{ venue_id: previousVenueId, resolved_id: canonicalVenueId }]);
        } finally {
            await client.query('ROLLBACK');
            client.release();
        }
    });
});
