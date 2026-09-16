import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { miniGameError } from './mini-game.errors';
import { MiniGameCryptoService } from './mini-game-crypto.service';

function canonical(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
    if (typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (typeof value !== 'object') return 'null';
    return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
        .join(',')}}`;
}

@Injectable()
export class MiniGameIdempotencyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: MiniGameCryptoService
    ) {}

    async execute<T>(
        actorUserId: string,
        key: string,
        path: string,
        body: object,
        status: number,
        operation: (tx: Prisma.TransactionClient) => Promise<T>
    ): Promise<{ value: T; replayed: boolean }> {
        const fingerprint = this.crypto.hash('IDEMPOTENCY', `POST:${path}:${canonical(body)}`);
        for (let attempt = 0; ; attempt += 1) {
            try {
                return await this.prisma.$transaction(
                    async (tx) => {
                        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${actorUserId}:${path}:${key}`}, 0))`;
                        const existing = await tx.miniGameOperationReceipt.findUnique({
                            where: {
                                actorUserId_method_canonicalPath_idempotencyKey: {
                                    actorUserId,
                                    method: 'POST',
                                    canonicalPath: path,
                                    idempotencyKey: key,
                                },
                            },
                        });
                        if (existing !== null) {
                            if (existing.requestFingerprint !== fingerprint)
                                throw miniGameError('IDEMPOTENCY_KEY_REUSED', 409);
                            return {
                                value: (JSON.parse(this.crypto.decrypt(existing.responseCiphertext)) as { value: T })
                                    .value,
                                replayed: true,
                            };
                        }
                        const value = await operation(tx);
                        await tx.miniGameOperationReceipt.create({
                            data: {
                                id: uuidV7(),
                                actorUserId,
                                idempotencyKey: key,
                                method: 'POST',
                                canonicalPath: path,
                                requestFingerprint: fingerprint,
                                responseStatus: status,
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
