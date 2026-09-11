import { ModerationCaseState } from '@prisma/client';

import { ModerationService } from '../../src/trust-safety/moderation.service';
import { FakeClock } from '../fakes/fake-clock';

describe('ModerationService audit trail', () => {
    it('audits each implemented pre-decision state transition in its transaction', async () => {
        interface TransitionInput {
            data: { assignedModeratorId?: string; state: ModerationCaseState };
            where: { id: string; revision: number; state: ModerationCaseState };
        }
        interface CapturedAuditEntry {
            action: string;
            actorId: string;
            actorType: string;
            changedFields: { fields: string[] };
            outcome: string;
            targetId: string;
        }
        const caseId = '11111111-1111-4111-8111-111111111111';
        const moderatorId = '22222222-2222-4222-8222-222222222222';
        let state: ModerationCaseState = ModerationCaseState.OPEN;
        let revision = 0;
        let assignedModeratorId: string | null = null;
        const auditEntries: CapturedAuditEntry[] = [];
        const audit = {
            append: jest.fn((_transaction: unknown, entry: CapturedAuditEntry) => {
                auditEntries.push(entry);
                return Promise.resolve('audit-id');
            }),
        };
        const outbox = { enqueue: jest.fn().mockResolvedValue('event-id') };
        const tx = {
            moderationCase: {
                findUnique: jest.fn().mockImplementation(() => ({
                    assignedModeratorId,
                    category: 'NO_SHOW',
                    conflictDetectedAt: null,
                    id: caseId,
                    revision,
                    state,
                })),
                findUniqueOrThrow: jest.fn().mockImplementation(() => ({ category: 'NO_SHOW' })),
                updateMany: jest.fn().mockImplementation(({ data, where }: TransitionInput) => {
                    if (where.id !== caseId || where.state !== state || where.revision !== revision)
                        return { count: 0 };
                    state = data.state;
                    revision += 1;
                    if (data.assignedModeratorId !== undefined) assignedModeratorId = data.assignedModeratorId;
                    return { count: 1 };
                }),
            },
            safetySignal: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
            user: { findUnique: jest.fn().mockResolvedValue({ status: 'ACTIVE' }) },
        };
        const prisma = {
            $transaction: jest
                .fn()
                .mockImplementation((operation: (transaction: typeof tx) => unknown) => operation(tx)),
        };
        const service = new ModerationService(
            prisma as never,
            new FakeClock(new Date('2026-09-11T12:00:00.000Z')),
            {} as never,
            audit as never,
            outbox as never,
            { get: () => undefined } as never
        );

        await service.triage(caseId, moderatorId, 0, 'NORMAL');
        await service.assign(caseId, moderatorId, moderatorId, 1);
        await service.beginInvestigation(caseId, moderatorId, 2);

        expect(auditEntries.map((entry) => entry.action)).toEqual([
            'safety.case.triaged',
            'safety.case.assigned',
            'safety.case.investigation.started',
        ]);
        for (const entry of auditEntries) {
            expect(entry).toMatchObject({
                actorId: moderatorId,
                actorType: 'MODERATOR',
                changedFields: { fields: ['state', 'revision'] },
                outcome: 'SUCCEEDED',
                targetId: caseId,
            });
        }
        expect(state).toBe(ModerationCaseState.INVESTIGATING);
        expect(outbox.enqueue).toHaveBeenCalledTimes(3);
    });
});
