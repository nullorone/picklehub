import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { venueError } from './venue.errors';

function canonical(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (typeof value === 'object' && value !== null) {
        return `{${Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
            .join(',')}}`;
    }
    return JSON.stringify(value);
}

@Injectable()
export class VenueIdempotencyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock
    ) {}

    async execute<T extends object>(
        userId: string,
        key: string,
        path: string,
        request: object,
        operation: (transaction: Prisma.TransactionClient) => Promise<T>
    ): Promise<{ value: T; replayed: boolean }> {
        const fingerprint = this.crypto.hash(canonical(request));
        const run = async () =>
            this.prisma.$transaction(async (transaction) => {
                const existing = await transaction.venueIdempotencyRecord.findUnique({
                    where: {
                        userId_method_canonicalPath_idempotencyKey: {
                            userId,
                            method: 'POST',
                            canonicalPath: path,
                            idempotencyKey: key,
                        },
                    },
                });
                if (existing !== null) {
                    if (existing.expiresAt <= this.clock.now()) {
                        await transaction.venueIdempotencyRecord.delete({ where: { id: existing.id } });
                    } else {
                        if (existing.requestFingerprint !== fingerprint) {
                            throw venueError('IDEMPOTENCY_KEY_REUSED', 409);
                        }
                        return {
                            value: JSON.parse(this.crypto.decrypt(existing.responseCiphertext)) as T,
                            replayed: true,
                        };
                    }
                }
                const value = await operation(transaction);
                const now = this.clock.now();
                await transaction.venueIdempotencyRecord.create({
                    data: {
                        id: uuidV7(),
                        userId,
                        idempotencyKey: key,
                        method: 'POST',
                        canonicalPath: path,
                        requestFingerprint: fingerprint,
                        responseStatus: 201,
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
