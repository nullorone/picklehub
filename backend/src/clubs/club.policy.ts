import { Injectable } from '@nestjs/common';
import { ClubRole, ClubState, Prisma } from '@prisma/client';

import { clubError } from './club.errors';

export type ClubManagerRole = 'OWNER' | 'ADMIN';

@Injectable()
export class ClubPolicyService {
    async membership(
        tx: Prisma.TransactionClient,
        clubId: string,
        userId: string,
        allowed: readonly ClubRole[]
    ): Promise<{ id: string; role: ClubRole; revision: number }> {
        const membership = await tx.clubMembership.findFirst({
            where: { clubId, userId, state: 'ACTIVE' },
            select: { id: true, role: true, revision: true },
        });
        if (membership === null || !allowed.includes(membership.role)) throw clubError('CLUB_ACTION_FORBIDDEN', 403);
        return membership;
    }

    async manager(tx: Prisma.TransactionClient, clubId: string, userId: string): Promise<void> {
        await this.membership(tx, clubId, userId, [ClubRole.OWNER, ClubRole.ADMIN]);
    }

    async owner(tx: Prisma.TransactionClient, clubId: string, userId: string): Promise<void> {
        await this.membership(tx, clubId, userId, [ClubRole.OWNER]);
    }

    active(state: ClubState): void {
        if (state === ClubState.ARCHIVED) throw clubError('CLUB_ARCHIVED', 409);
    }
}
