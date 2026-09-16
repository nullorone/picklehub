import { Injectable } from '@nestjs/common';

import { PrismaService } from '../common/database/prisma.service';
import { IdentityService, type AuthenticatedIdentity } from '../identity/identity.service';
import { miniGameError } from './mini-game.errors';
import { MiniGameCryptoService } from './mini-game-crypto.service';

export interface MiniGameActor {
    userId: string;
    identity: AuthenticatedIdentity;
    credentialKind: 'IDENTITY' | 'GAME';
}

@Injectable()
export class MiniGameAuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly identity: IdentityService,
        private readonly crypto: MiniGameCryptoService
    ) {}

    async authenticate(authorization: string | undefined): Promise<MiniGameActor> {
        const bearer = /^Bearer (.+)$/u.exec(authorization ?? '')?.[1];
        if (bearer?.startsWith('mga1_') === true) {
            const now = new Date();
            if (this.crypto.verify('mga1_', bearer) === null) {
                throw miniGameError('SESSION_INVALID', 401);
            }
            const launch = await this.prisma.gameLaunchCapability.findUnique({
                where: { accessTokenHash: this.crypto.hash('GAME_ACCESS', bearer) },
            });
            if (!launch?.consumedAt || !launch.accessTokenExpiresAt || launch.accessTokenExpiresAt <= now) {
                throw miniGameError('SESSION_INVALID', 401);
            }
            try {
                return {
                    userId: launch.userId,
                    identity: await this.identity.authenticateSessionBinding(
                        launch.nativeSessionId,
                        launch.userId,
                        // The session method verifies the current user epoch too. Load only the binding epoch.
                        await this.sessionEpoch(launch.nativeSessionId)
                    ),
                    credentialKind: 'GAME',
                };
            } catch {
                throw miniGameError('SESSION_INVALID', 401);
            }
        }
        try {
            const identity = await this.identity.authenticate(authorization);
            return { userId: identity.session.userId, identity, credentialKind: 'IDENTITY' };
        } catch {
            throw miniGameError('SESSION_INVALID', 401);
        }
    }

    private async sessionEpoch(sessionId: string): Promise<number> {
        return (await this.prisma.session.findUniqueOrThrow({ where: { id: sessionId }, select: { authEpoch: true } }))
            .authEpoch;
    }
}
