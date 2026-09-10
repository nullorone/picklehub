import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { matchError } from './match.errors';

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (typeof value === 'object' && value !== null)
        return `{${Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
            .join(',')}}`;
    return JSON.stringify(value);
}

@Injectable()
export class MatchIdempotencyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock
    ) {}

    async execute<T>(
        userId: string,
        key: string,
        method: 'POST' | 'PATCH' | 'DELETE',
        path: string,
        request: object,
        operation: (transaction: Prisma.TransactionClient) => Promise<T>,
        matchId?: string
    ): Promise<{ value: T; replayed: boolean }> {
        const fingerprint = this.crypto.hash(canonical(request));
        const run = () =>
            this.prisma.$transaction(
                async (transaction) => {
                    const existing = await transaction.matchIdempotencyRecord.findUnique({
                        where: {
                            userId_method_canonicalPath_idempotencyKey: {
                                userId,
                                method,
                                canonicalPath: path,
                                idempotencyKey: key,
                            },
                        },
                    });
                    if (existing !== null && existing.expiresAt > this.clock.now()) {
                        if (existing.requestFingerprint !== fingerprint)
                            throw matchError('IDEMPOTENCY_KEY_REUSED', 409);
                        return {
                            value: JSON.parse(this.crypto.decrypt(existing.responseCiphertext)) as T,
                            replayed: true,
                        };
                    }
                    if (existing !== null)
                        await transaction.matchIdempotencyRecord.delete({ where: { id: existing.id } });
                    const value = await operation(transaction);
                    const now = this.clock.now();
                    await transaction.matchIdempotencyRecord.create({
                        data: {
                            id: uuidV7(),
                            ...(matchId === undefined ? {} : { matchId }),
                            userId,
                            idempotencyKey: key,
                            method,
                            canonicalPath: path,
                            requestFingerprint: fingerprint,
                            responseStatus: 200,
                            responseCiphertext: this.crypto.encrypt(JSON.stringify(value)),
                            encryptionKeyVersion: 1,
                            createdAt: now,
                            expiresAt: new Date(now.getTime() + 86_400_000),
                        },
                    });
                    return { value, replayed: false };
                },
                { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
            );
        try {
            return await run();
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return run();
            throw error;
        }
    }
}
