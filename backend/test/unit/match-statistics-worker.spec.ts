import { parseEnvironment } from '../../src/common/config/environment';
import { MatchStatisticsWorkerService } from '../../src/matches/match-statistics-worker.service';

describe('MatchStatisticsWorkerService', () => {
    it('applies a confirmed event once when BullMQ redelivers it', async () => {
        const transaction = {
            $queryRaw: jest
                .fn()
                .mockResolvedValueOnce([{ eventId: 'event' }])
                .mockResolvedValueOnce([]),
            outboxEvent: {
                findUniqueOrThrow: jest.fn().mockResolvedValue({
                    payload: { data: { matchId: '11111111-1111-4111-8111-111111111111', resultId: 'result' } },
                }),
            },
            matchResult: { findUniqueOrThrow: jest.fn().mockResolvedValue({ winningTeam: 'TEAM_A' }) },
            matchMetricMarker: {
                findUnique: jest.fn().mockResolvedValue({
                    matchId: '11111111-1111-4111-8111-111111111111',
                    confirmedAt: new Date('2026-09-10T12:00:00Z'),
                }),
            },
            matchParticipant: {
                findMany: jest.fn().mockResolvedValue([
                    { userId: 'a', team: 'TEAM_A' },
                    { userId: 'b', team: 'TEAM_B' },
                ]),
            },
            $executeRaw: jest.fn().mockResolvedValue(1),
        };
        const prisma = {
            $transaction: jest.fn((operation: (tx: typeof transaction) => Promise<void>) => operation(transaction)),
        };
        const worker = new MatchStatisticsWorkerService(
            parseEnvironment({
                NODE_ENV: 'test',
                DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
                REDIS_URL: 'redis://localhost:6379/0',
                APP_ROLE: 'api',
            }),
            {} as never,
            prisma as never,
            {} as never
        );
        const event = {
            eventId: '22222222-2222-4222-8222-222222222222',
            type: 'match.completed.confirmed.v1',
            schemaVersion: 1,
        };
        await worker.process(event);
        await worker.process(event);
        expect(transaction.$executeRaw).toHaveBeenCalledTimes(2);
        expect(transaction.outboxEvent.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    });
});
