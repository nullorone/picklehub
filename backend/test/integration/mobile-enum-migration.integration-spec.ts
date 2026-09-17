import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Pool } from 'pg';

describe('mobile notification enum migration', () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

    afterAll(async () => {
        await pool.end();
    });

    it('upgrades existing enums atomically and preserves the external-channel restriction', async () => {
        const migration = readFileSync(
            join(__dirname, '../../prisma/migrations/20260916090000_mobile_parity_contract_data/migration.sql'),
            'utf8'
        );
        const start = migration.indexOf('ALTER TYPE "communication_platform"');
        const end = migration.indexOf('CREATE TABLE "push_registrations"');
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        const schema = `mobile_enum_${randomUUID().replaceAll('-', '')}`;
        const client = await pool.connect();
        try {
            await client.query(`CREATE SCHEMA "${schema}"`);
            await client.query(`SET search_path TO "${schema}"`);
            await client.query(`
                CREATE TYPE communication_platform AS ENUM ('WEB', 'TMA');
                CREATE TYPE notification_channel AS ENUM ('IN_APP', 'TELEGRAM', 'EMAIL');
                CREATE TABLE notification_deliveries (
                    channel notification_channel NOT NULL,
                    CONSTRAINT notification_deliveries_external_only_check
                        CHECK (channel IN ('TELEGRAM', 'EMAIL'))
                );
                INSERT INTO notification_deliveries VALUES ('TELEGRAM'), ('EMAIL');
            `);
            await client.query('BEGIN');
            await client.query(migration.slice(start, end));
            await client.query('COMMIT');
            await client.query(`INSERT INTO notification_deliveries VALUES ('PUSH')`);
            const rows = await client.query('SELECT channel::text FROM notification_deliveries ORDER BY channel');
            expect(rows.rows).toEqual([{ channel: 'TELEGRAM' }, { channel: 'EMAIL' }, { channel: 'PUSH' }]);
            await expect(client.query(`INSERT INTO notification_deliveries VALUES ('IN_APP')`)).rejects.toMatchObject({
                code: '23514',
                constraint: 'notification_deliveries_external_only_check',
            });
        } finally {
            await client.query('ROLLBACK');
            await client.query('RESET search_path');
            await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
            client.release();
        }
    });
});
