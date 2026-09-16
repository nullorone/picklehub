import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import type { MiniGameActor } from './mini-game-auth.service';
import { miniGameError } from './mini-game.errors';
import { MiniGameCryptoService } from './mini-game-crypto.service';
import { plus } from './mini-game-policy';

@Injectable()
export class MiniGameLaunchService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly crypto: MiniGameCryptoService,
        @Inject(ENVIRONMENT) private readonly environment: Environment
    ) {}

    async create(actor: MiniGameActor, tx: Prisma.TransactionClient): Promise<object> {
        if (actor.credentialKind !== 'IDENTITY' || actor.identity.session.platform !== 'MOBILE') {
            throw miniGameError('SESSION_INVALID', 401);
        }
        const now = new Date();
        const expiresAt = plus(now, 60_000);
        const id = uuidV7();
        const capability = this.crypto.sign('mgl1_', { v: 1, n: this.crypto.secret() });
        await tx.gameLaunchCapability.create({
            data: {
                id,
                userId: actor.userId,
                nativeSessionId: actor.identity.session.id,
                origin: this.environment.MINI_GAME_ORIGIN,
                capabilityHash: this.crypto.hash('LAUNCH', capability),
                signatureKeyVersion: 1,
                issuedAt: now,
                expiresAt,
            },
        });
        return {
            origin: this.environment.MINI_GAME_ORIGIN,
            capability,
            expiresAt: expiresAt.toISOString(),
            exchangeMethod: 'POST_BODY',
        };
    }

    async resolve(capability: string, origin: string | undefined): Promise<{ userId: string; capabilityId: string }> {
        if (this.crypto.verify('mgl1_', capability) === null || origin !== this.environment.MINI_GAME_ORIGIN) {
            throw miniGameError('SESSION_INVALID', 401);
        }
        const launch = await this.prisma.gameLaunchCapability.findUnique({
            where: { capabilityHash: this.crypto.hash('LAUNCH', capability) },
        });
        if (launch === null || launch.origin !== origin || launch.expiresAt <= new Date()) {
            throw miniGameError('SESSION_INVALID', 401);
        }
        return { userId: launch.userId, capabilityId: launch.id };
    }

    async exchange(
        capability: string,
        capabilityId: string,
        origin: string,
        tx: Prisma.TransactionClient
    ): Promise<object> {
        const now = new Date();
        const launch = await tx.gameLaunchCapability.findUnique({ where: { id: capabilityId } });
        if (
            launch === null ||
            launch.origin !== origin ||
            launch.capabilityHash !== this.crypto.hash('LAUNCH', capability) ||
            launch.expiresAt <= now ||
            launch.consumedAt !== null
        ) {
            throw miniGameError('SESSION_INVALID', 401);
        }
        const expiresAt = plus(now, 15 * 60_000);
        const accessToken = this.crypto.sign('mga1_', { v: 1, n: this.crypto.secret() });
        const consumed = await tx.gameLaunchCapability.updateMany({
            where: { id: capabilityId, consumedAt: null, expiresAt: { gt: now } },
            data: {
                consumedAt: now,
                accessTokenHash: this.crypto.hash('GAME_ACCESS', accessToken),
                accessTokenExpiresAt: expiresAt,
            },
        });
        if (consumed.count !== 1) throw miniGameError('SESSION_INVALID', 401);
        return {
            accessToken,
            expiresAt: expiresAt.toISOString(),
            allowedApiPrefix: '/v1/mini-game',
            allowedBridgeMessages: 'READY_V1,CLOSE_V1,OPEN_SAFE_ROUTE_V1,HEALTH_V1',
        };
    }
}
