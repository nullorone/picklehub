import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';
import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { IdentityService, type AuthenticatedIdentity } from '../identity/identity.service';
import { communicationError } from './communication.errors';

const TICKET_SECONDS = 60;

interface TicketBinding {
    userId: string;
    sessionId: string;
    authEpoch: number;
}

@Injectable()
export class RealtimeTicketService {
    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly redis: RedisService,
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock,
        private readonly identity: IdentityService
    ) {}

    async issue(auth: AuthenticatedIdentity): Promise<{ ticket: string; expiresAt: string }> {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const ticket = `ws1_${this.crypto.secret()}`;
            const stored = await this.redis.client.set(
                this.key(ticket),
                JSON.stringify({
                    userId: auth.session.userId,
                    sessionId: auth.session.id,
                    authEpoch: auth.session.authEpoch,
                } satisfies TicketBinding),
                'EX',
                TICKET_SECONDS,
                'NX'
            );
            if (stored === 'OK') {
                return {
                    ticket,
                    expiresAt: new Date(this.clock.now().getTime() + TICKET_SECONDS * 1000).toISOString(),
                };
            }
        }
        throw communicationError('SESSION_INVALID', 401);
    }

    async consume(ticket: string): Promise<AuthenticatedIdentity> {
        if (!/^ws1_[A-Za-z0-9_-]{43}$/u.test(ticket)) throw communicationError('SESSION_INVALID', 401);
        const raw = await this.redis.client.getdel(this.key(ticket));
        if (raw === null) throw communicationError('SESSION_INVALID', 401);
        try {
            const binding = JSON.parse(raw) as Partial<TicketBinding>;
            if (
                typeof binding.userId !== 'string' ||
                typeof binding.sessionId !== 'string' ||
                typeof binding.authEpoch !== 'number' ||
                !Number.isInteger(binding.authEpoch)
            ) {
                throw new Error('Invalid binding');
            }
            return await this.identity.authenticateSessionBinding(binding.sessionId, binding.userId, binding.authEpoch);
        } catch {
            throw communicationError('SESSION_INVALID', 401);
        }
    }

    private key(ticket: string): string {
        return `${this.environment.REDIS_NAMESPACE}:ws-ticket:${this.crypto.hash(ticket)}`;
    }
}
