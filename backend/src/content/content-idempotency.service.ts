import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { contentError } from './content.errors';

export function canonicalContentRequest(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return JSON.stringify(value);
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
    if (typeof value === 'boolean') return String(value);
    if (typeof value !== 'object') return 'null';
    if (Array.isArray(value)) return `[${value.map((item) => canonicalContentRequest(item)).join(',')}]`;
    return `{${Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => `${JSON.stringify(key)}:${canonicalContentRequest(item)}`)
        .join(',')}}`;
}

@Injectable()
export class ContentIdempotencyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: IdentityCryptoService
    ) {}

    async execute<T>(
        actorId: string,
        key: string,
        method: string,
        path: string,
        body: object,
        status: number,
        operation: (tx: Prisma.TransactionClient) => Promise<T>
    ): Promise<{ value: T; replayed: boolean }> {
        const fingerprint = this.crypto.hash(`CONTENT_REQUEST:${method}:${path}:${canonicalContentRequest(body)}`);
        for (let attempt = 0; ; attempt += 1) {
            try {
                return await this.prisma.$transaction(
                    async (tx) => {
                        await tx.$executeRaw`SELECT id FROM identity_users WHERE id = ${actorId}::uuid FOR UPDATE`;
                        const existing = await tx.contentOperationReceipt.findUnique({
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
                                throw contentError('IDEMPOTENCY_KEY_REUSED', 409);
                            return {
                                value: (JSON.parse(this.crypto.decrypt(existing.responseCiphertext)) as { value: T })
                                    .value,
                                replayed: true,
                            };
                        }
                        const value = await operation(tx);
                        await tx.contentOperationReceipt.create({
                            data: {
                                id: uuidV7(),
                                actorUserId: actorId,
                                idempotencyKey: key,
                                method,
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
