import { ClubRole, ClubState, type Prisma } from '@prisma/client';

import { ClubException } from '../../src/clubs/club.errors';
import { ClubPolicyService } from '../../src/clubs/club.policy';

describe('club scoped authorization', () => {
    const policy = new ClubPolicyService();

    function transaction(role: ClubRole | null): Prisma.TransactionClient {
        return {
            clubMembership: {
                findFirst: jest
                    .fn()
                    .mockResolvedValue(role === null ? null : { id: 'membership-id', role, revision: 0 }),
            },
        } as unknown as Prisma.TransactionClient;
    }

    it.each([ClubRole.OWNER, ClubRole.ADMIN])('allows %s to manage its own club', async (role) => {
        await expect(policy.manager(transaction(role), 'club-id', 'user-id')).resolves.toBeUndefined();
    });

    it('does not give a member, outsider or platform role implicit manager access', async () => {
        await expect(policy.manager(transaction(ClubRole.MEMBER), 'club-id', 'user-id')).rejects.toMatchObject({
            code: 'CLUB_ACTION_FORBIDDEN',
        });
        await expect(policy.manager(transaction(null), 'club-id', 'user-id')).rejects.toBeInstanceOf(ClubException);
    });

    it('always scopes the membership lookup to the requested club', async () => {
        const findFirst = jest.fn().mockResolvedValue({ id: 'membership-id', role: ClubRole.OWNER, revision: 0 });
        const tx = { clubMembership: { findFirst } } as unknown as Prisma.TransactionClient;
        await policy.manager(tx, 'club-b', 'same-user');
        expect(findFirst).toHaveBeenCalledWith({
            where: { clubId: 'club-b', userId: 'same-user', state: 'ACTIVE' },
            select: { id: true, role: true, revision: true },
        });
    });

    it('reserves ownership commands for the scoped owner and closes archived writes', async () => {
        await expect(policy.owner(transaction(ClubRole.ADMIN), 'club-id', 'user-id')).rejects.toMatchObject({
            code: 'CLUB_ACTION_FORBIDDEN',
        });
        try {
            policy.active(ClubState.ARCHIVED);
            throw new Error('Expected archived policy to reject');
        } catch (error) {
            expect(error).toBeInstanceOf(ClubException);
            expect((error as ClubException).code).toBe('CLUB_ARCHIVED');
        }
        policy.active(ClubState.ACTIVE);
    });
});
