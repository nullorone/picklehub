import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { TrustSafetyCryptoService } from './trust-safety-crypto.service';
import { trustSafetyError } from './trust-safety.errors';

@Injectable()
export class TrustSafetyIdempotencyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: TrustSafetyCryptoService
    ) {}

    async execute<T>(
        userId: string,
        key: string,
        method: 'POST' | 'PUT' | 'DELETE',
        path: string,
        body: object,
        status: number,
        operation: (tx: Prisma.TransactionClient) => Promise<T>
    ): Promise<{ value: T; status: number; replayed: boolean }> {
        const fingerprint = this.crypto.hash(JSON.stringify(body));
        const aad = `safety-idempotency:v1:${userId}:${method}:${path}:${key}`;
        for (let attempt = 0; ; attempt += 1) {
            try {
                return await this.prisma.$transaction(
                    async (tx) => {
                        await tx.$executeRaw`SELECT id FROM identity_users WHERE id = ${userId}::uuid FOR UPDATE`;
                        const existing = await tx.safetyIdempotencyRecord.findUnique({
                            where: {
                                userId_method_canonicalPath_idempotencyKey: {
                                    userId,
                                    method,
                                    canonicalPath: path,
                                    idempotencyKey: key,
                                },
                            },
                        });
                        if (existing !== null) {
                            if (existing.requestFingerprint !== fingerprint)
                                throw trustSafetyError('IDEMPOTENCY_KEY_REUSED', 409);
                            const stored = JSON.parse(this.crypto.decrypt(existing.responseCiphertext, aad)) as {
                                status: number;
                                value: T;
                            };
                            return { ...stored, replayed: true };
                        }
                        const value = await operation(tx);
                        await tx.safetyIdempotencyRecord.create({
                            data: {
                                id: uuidV7(),
                                userId,
                                idempotencyKey: key,
                                method,
                                canonicalPath: path,
                                requestFingerprint: fingerprint,
                                responseStatus: status,
                                responseCiphertext: this.crypto.encrypt(JSON.stringify({ status, value }), aad),
                                encryptionKeyVersion: 1,
                            },
                        });
                        return { value, status, replayed: false };
                    },
                    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
                );
            } catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) {
                    continue;
                }
                throw error;
            }
        }
    }
}
