import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { clubError } from './club.errors';

@Injectable()
export class ClubIdempotencyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: IdentityCryptoService
    ) {}

    async execute<T>(
        actorId: string,
        clubId: string | undefined,
        key: string,
        method: 'POST' | 'PATCH' | 'DELETE',
        path: string,
        body: object,
        status: number,
        operation: (tx: Prisma.TransactionClient) => Promise<T>
    ): Promise<{ value: T; status: number; replayed: boolean }> {
        const fingerprint = this.crypto.hash(`CLUB_REQUEST:${JSON.stringify(body)}`);
        for (let attempt = 0; ; attempt += 1) {
            try {
                return await this.prisma.$transaction(
                    async (tx) => {
                        await tx.$executeRaw`SELECT id FROM identity_users WHERE id = ${actorId}::uuid FOR UPDATE`;
                        const existing = await tx.clubOperationReceipt.findUnique({
                            where: {
                                actorUserId_method_canonicalPath_idempotencyKey: {
                                    actorUserId: actorId,
                                    method,
                                    canonicalPath: path,
                                    idempotencyKey: key,
                                },
                            },
                        });
                        if (existing !== null) {
                            if (existing.requestFingerprint !== fingerprint)
                                throw clubError('IDEMPOTENCY_KEY_REUSED', 409);
                            const stored = JSON.parse(this.crypto.decrypt(existing.responseCiphertext)) as {
                                status: number;
                                value: T;
                            };
                            return { ...stored, replayed: true };
                        }
                        const value = await operation(tx);
                        await tx.clubOperationReceipt.create({
                            data: {
                                id: uuidV7(),
                                clubId: clubId ?? null,
                                actorUserId: actorId,
                                idempotencyKey: key,
                                method,
                                canonicalPath: path,
                                requestFingerprint: fingerprint,
                                responseStatus: status,
                                responseCiphertext: this.crypto.encrypt(JSON.stringify({ status, value })),
                                encryptionKeyVersion: 1,
                            },
                        });
                        return { value, status, replayed: false };
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
