import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { PrismaService } from './prisma.service';

@Injectable()
export class InteractionPolicyService {
    constructor(private readonly prisma: PrismaService) {}

    async blocked(
        left: string,
        right: string,
        database: Prisma.TransactionClient | PrismaService = this.prisma
    ): Promise<boolean> {
        if (left === right) return false;
        return (
            (await database.communicationBlock.count({
                where: {
                    OR: [
                        { blockerId: left, blockedUserId: right },
                        { blockerId: right, blockedUserId: left },
                    ],
                },
            })) > 0
        );
    }
}
