import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { profileError } from './profile.errors';

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (typeof value === 'object' && value !== null) {
        return `{${Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

@Injectable()
export class ProfileIdempotencyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock
    ) {}

    async execute<T>(
        userId: string,
        key: string,
        method: string,
        path: string,
        request: object,
        status: number,
        operation: (transaction: Prisma.TransactionClient) => Promise<T>
    ): Promise<{ value: T; replayed: boolean }> {
        const fingerprint = this.crypto.hash(canonical(request));
        const run = () =>
            this.prisma.$transaction(async (transaction) => {
                const existing = await transaction.profileIdempotencyRecord.findUnique({
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
                    if (existing.requestFingerprint !== fingerprint) throw profileError('IDEMPOTENCY_KEY_REUSED', 409);
                    return {
                        value: JSON.parse(this.crypto.decrypt(existing.responseCiphertext)) as T,
                        replayed: true,
                    };
                }
                if (existing !== null)
                    await transaction.profileIdempotencyRecord.delete({ where: { id: existing.id } });
                const value = await operation(transaction);
                const now = this.clock.now();
                await transaction.profileIdempotencyRecord.create({
                    data: {
                        id: uuidV7(),
                        userId,
                        idempotencyKey: key,
                        method,
                        canonicalPath: path,
                        requestFingerprint: fingerprint,
                        responseStatus: status,
                        responseCiphertext: this.crypto.encrypt(JSON.stringify(value)),
                        encryptionKeyVersion: 1,
                        createdAt: now,
                        expiresAt: new Date(now.getTime() + 86_400_000),
                    },
                });
                return { value, replayed: false };
            });
        try {
            return await run();
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return run();
            throw error;
        }
    }
}
