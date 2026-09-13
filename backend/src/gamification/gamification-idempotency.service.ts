import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { gamificationError } from './gamification.errors';

@Injectable()
export class GamificationIdempotencyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: IdentityCryptoService
    ) {}

    async execute<T>(
        actorId: string,
        key: string,
        path: string,
        body: object,
        operation: (tx: Prisma.TransactionClient) => Promise<T>
    ): Promise<{ value: T; replayed: boolean }> {
        const fingerprint = this.crypto.hash(`GAMIFICATION_REQUEST:${JSON.stringify(body)}`);
        for (let attempt = 0; ; attempt += 1) {
            try {
                return await this.prisma.$transaction(
                    async (tx) => {
                        await tx.$executeRaw`SELECT id FROM identity_users WHERE id = ${actorId}::uuid FOR UPDATE`;
                        const existing = await tx.gamificationOperationReceipt.findUnique({
                            where: {
                                actorUserId_method_canonicalPath_idempotencyKey: {
                                    actorUserId: actorId,
                                    method: 'PUT',
                                    canonicalPath: path,
                                    idempotencyKey: key,
                                },
                            },
                        });
                        if (existing !== null) {
                            if (existing.requestFingerprint !== fingerprint)
                                throw gamificationError('IDEMPOTENCY_KEY_REUSED', 409);
                            return {
                                value: (JSON.parse(this.crypto.decrypt(existing.responseCiphertext)) as { value: T })
                                    .value,
                                replayed: true,
                            };
                        }
                        const value = await operation(tx);
                        await tx.gamificationOperationReceipt.create({
                            data: {
                                id: uuidV7(),
                                actorUserId: actorId,
                                idempotencyKey: key,
                                method: 'PUT',
                                canonicalPath: path,
                                requestFingerprint: fingerprint,
                                responseStatus: 200,
                                responseCiphertext: this.crypto.encrypt(JSON.stringify({ value })),
                                encryptionKeyVersion: 1,
                            },
                        });
                        return { value, replayed: false };
                    },
                    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
                );
            } catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2)
                    continue;
                throw error;
            }
        }
    }
}
