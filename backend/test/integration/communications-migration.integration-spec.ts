import { Pool, type PoolClient } from 'pg';

import { uuidV7 } from '../../src/common/identifiers/uuid-v7';

async function createUser(client: PoolClient): Promise<string> {
    const userId = uuidV7();
    await client.query('INSERT INTO identity_users (id) VALUES ($1::uuid)', [userId]);
    return userId;
}

async function createConversation(client: PoolClient, organizerId: string): Promise<string> {
    const matchId = uuidV7();
    const conversationId = uuidV7();
    await client.query('BEGIN');
    await client.query(`INSERT INTO matches (id, organizer_id, state) VALUES ($1::uuid, $2::uuid, 'DRAFT')`, [
        matchId,
        organizerId,
    ]);
    await client.query(`INSERT INTO conversations (id, match_id) VALUES ($1::uuid, $2::uuid)`, [
        conversationId,
        matchId,
    ]);
    await client.query('COMMIT');
    return conversationId;
}

async function insertMessage(client: PoolClient, conversationId: string, authorId: string): Promise<string> {
    const messageId = uuidV7();
    await client.query(
        `INSERT INTO chat_messages (id, conversation_id, sequence, kind, author_id)
         VALUES ($1::uuid, $2::uuid, 0, 'USER', $3::uuid)`,
        [messageId, conversationId, authorId]
    );
    await client.query(
        `INSERT INTO chat_message_revisions (message_id, revision, kind, text, created_by)
         VALUES ($1::uuid, 1, 'CREATED', 'Синтетическое сообщение', $2::uuid)`,
        [messageId, authorId]
    );
    return messageId;
}

describe('chat and notifications contract-data migration', () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 8 });

    afterAll(async () => {
        await pool.end();
    });

    it('serializes concurrent message sequence allocation without gaps', async () => {
        const setup = await pool.connect();
        const first = await pool.connect();
        const second = await pool.connect();
        try {
            const userId = await createUser(setup);
            const conversationId = await createConversation(setup, userId);
            await Promise.all([first.query('BEGIN'), second.query('BEGIN')]);
            await insertMessage(first, conversationId, userId);
            const secondInsert = insertMessage(second, conversationId, userId);
            await first.query('COMMIT');
            await secondInsert;
            await second.query('COMMIT');

            const result = await setup.query<{ sequence: string }>(
                `SELECT sequence::text FROM chat_messages WHERE conversation_id = $1::uuid ORDER BY sequence`,
                [conversationId]
            );
            expect(result.rows.map((row) => row.sequence)).toEqual(['1', '2']);
        } finally {
            await Promise.allSettled([first.query('ROLLBACK'), second.query('ROLLBACK')]);
            setup.release();
            first.release();
            second.release();
        }
    });

    it('does not allow a read position to move backward', async () => {
        const client = await pool.connect();
        try {
            const userId = await createUser(client);
            const conversationId = await createConversation(client, userId);
            const membershipId = uuidV7();
            await client.query(
                `INSERT INTO conversation_memberships (id, conversation_id, user_id, last_read_sequence)
                 VALUES ($1::uuid, $2::uuid, $3::uuid, 5)`,
                [membershipId, conversationId, userId]
            );
            await expect(
                client.query(`UPDATE conversation_memberships SET last_read_sequence = 4 WHERE id = $1::uuid`, [
                    membershipId,
                ])
            ).rejects.toMatchObject({ code: 'P0001' });
        } finally {
            client.release();
        }
    });

    it('keeps message revisions append-only', async () => {
        const client = await pool.connect();
        try {
            const userId = await createUser(client);
            const conversationId = await createConversation(client, userId);
            await client.query('BEGIN');
            const messageId = await insertMessage(client, conversationId, userId);
            await client.query('COMMIT');
            await expect(
                client.query(
                    `UPDATE chat_message_revisions SET text = 'Изменение на месте'
                     WHERE message_id = $1::uuid AND revision = 1`,
                    [messageId]
                )
            ).rejects.toMatchObject({ code: 'P0001' });
        } finally {
            await client.query('ROLLBACK').catch(() => undefined);
            client.release();
        }
    });

    it('deduplicates a logical notification separately from its channel delivery', async () => {
        const client = await pool.connect();
        try {
            const userId = await createUser(client);
            const sourceEventId = uuidV7();
            const notificationId = uuidV7();
            await client.query(
                `INSERT INTO notifications (id, recipient_id, source_event_id, type, category, route)
                 VALUES ($1::uuid, $2::uuid, $3::uuid, 'MATCH_CANCELLED', 'MATCH_CRITICAL', '/matches')`,
                [notificationId, userId, sourceEventId]
            );
            await expect(
                client.query(
                    `INSERT INTO notifications (id, recipient_id, source_event_id, type, category, route)
                     VALUES ($1::uuid, $2::uuid, $3::uuid, 'MATCH_CANCELLED', 'MATCH_CRITICAL', '/matches')`,
                    [uuidV7(), userId, sourceEventId]
                )
            ).rejects.toMatchObject({ code: '23505', constraint: 'notifications_logical_key' });

            await client.query(
                `INSERT INTO notification_deliveries (id, notification_id, channel, idempotency_key)
                 VALUES ($1::uuid, $2::uuid, 'TELEGRAM', $3::uuid)`,
                [uuidV7(), notificationId, uuidV7()]
            );
            await expect(
                client.query(
                    `INSERT INTO notification_deliveries (id, notification_id, channel, idempotency_key)
                     VALUES ($1::uuid, $2::uuid, 'TELEGRAM', $3::uuid)`,
                    [uuidV7(), notificationId, uuidV7()]
                )
            ).rejects.toMatchObject({ code: '23505', constraint: 'notification_deliveries_logical_key' });
        } finally {
            client.release();
        }
    });
});
