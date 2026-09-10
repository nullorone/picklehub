import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { CommunicationCryptoService } from './communication-crypto.service';
import { communicationError } from './communication.errors';

interface StoredResponse<T> {
    readonly status: number;
    readonly value: T;
}

@Injectable()
export class CommunicationIdempotencyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: CommunicationCryptoService
    ) {}

    async execute<T>(
        userId: string,
        key: string,
        method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        path: string,
        body: object,
        status: number,
        operation: (transaction: Prisma.TransactionClient) => Promise<T>
    ): Promise<{ value: T; status: number; replayed: boolean }> {
        const fingerprint = this.crypto.fingerprint(JSON.stringify(body));
        try {
            return await this.prisma.$transaction(
                async (transaction) => {
                    const existing = await transaction.communicationIdempotencyRecord.findUnique({
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
                        if (existing.requestFingerprint !== fingerprint) {
                            throw communicationError('IDEMPOTENCY_KEY_REUSED', 409);
                        }
                        const stored = JSON.parse(
                            this.crypto.decrypt(existing.responseCiphertext)
                        ) as StoredResponse<T>;
                        return { value: stored.value, status: stored.status, replayed: true };
                    }
                    const value = await operation(transaction);
                    await transaction.communicationIdempotencyRecord.create({
                        data: {
                            id: uuidV7(),
                            userId,
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
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                const existing = await this.prisma.communicationIdempotencyRecord.findUnique({
                    where: {
                        userId_method_canonicalPath_idempotencyKey: {
                            userId,
                            method,
                            canonicalPath: path,
                            idempotencyKey: key,
                        },
                    },
                });
                if (existing !== null && existing.requestFingerprint === fingerprint) {
                    const stored = JSON.parse(this.crypto.decrypt(existing.responseCiphertext)) as StoredResponse<T>;
                    return { value: stored.value, status: stored.status, replayed: true };
                }
                throw communicationError('IDEMPOTENCY_KEY_REUSED', 409);
            }
            throw error;
        }
    }
}
