import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { TournamentDomainError } from './tournament.errors';

interface ReceiptRow {
    readonly requestFingerprint: string;
    readonly responseStatus: number;
    readonly responseCiphertext: Uint8Array;
}

@Injectable()
export class TournamentIdempotencyService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: IdentityCryptoService
    ) {}

    async execute<T>(
        actorId: string,
        tournamentId: string | null,
        key: string,
        method: 'POST' | 'PATCH' | 'PUT',
        canonicalPath: string,
        body: object,
        responseStatus: number,
        operation: (tx: Prisma.TransactionClient, operationId: string) => Promise<T>
    ): Promise<{ readonly value: T; readonly status: number; readonly replayed: boolean }> {
        const fingerprint = this.crypto.hash(`TOURNAMENT_REQUEST_V1:${this.stringify(body)}`);
        for (let attempt = 0; ; attempt += 1) {
            try {
                return await this.prisma.$transaction(
                    async (tx) => {
                        await tx.$executeRaw`SELECT id FROM identity_users WHERE id = ${actorId}::uuid FOR UPDATE`;
                        const existing = await tx.$queryRaw<ReceiptRow[]>`
                            SELECT request_fingerprint AS "requestFingerprint",
                                   response_status AS "responseStatus",
                                   response_ciphertext AS "responseCiphertext"
                            FROM tournament_operation_receipts
                            WHERE actor_user_id = ${actorId}::uuid
                              AND method = ${method}
                              AND canonical_path = ${canonicalPath}
                              AND idempotency_key = ${key}::uuid
                            FOR UPDATE
                        `;
                        const receipt = existing[0];
                        if (receipt !== undefined) {
                            if (receipt.requestFingerprint !== fingerprint)
                                throw new TournamentDomainError(
                                    'IDEMPOTENCY_KEY_REUSED',
                                    'Idempotency key was used for another request'
                                );
                            return {
                                value: this.parse(this.crypto.decrypt(receipt.responseCiphertext)) as T,
                                status: receipt.responseStatus,
                                replayed: true,
                            };
                        }
                        const operationId = uuidV7();
                        const value = await operation(tx, operationId);
                        const ciphertext = this.crypto.encrypt(this.stringify(value));
                        await tx.$executeRaw`
                            INSERT INTO tournament_operation_receipts
                                (id, tournament_id, actor_user_id, idempotency_key, method, canonical_path,
                                 request_fingerprint, response_status, response_ciphertext, encryption_key_version)
                            VALUES (${operationId}::uuid, ${tournamentId}::uuid, ${actorId}::uuid, ${key}::uuid,
                                    ${method}, ${canonicalPath}, ${fingerprint}, ${responseStatus}, ${ciphertext}, 1)
                        `;
                        return { value, status: responseStatus, replayed: false };
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

    private stringify(value: unknown): string {
        return JSON.stringify(value, (_key, child: unknown) =>
            typeof child === 'bigint' ? { $picklehubBigInt: child.toString() } : child
        );
    }

    private parse(value: string): unknown {
        return JSON.parse(value, (_key, child: unknown) => {
            if (
                child !== null &&
                typeof child === 'object' &&
                '$picklehubBigInt' in child &&
                typeof (child as { $picklehubBigInt?: unknown }).$picklehubBigInt === 'string'
            ) {
                return BigInt((child as { $picklehubBigInt: string }).$picklehubBigInt);
            }
            return child;
        });
    }
}
