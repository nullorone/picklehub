import { Inject, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { RedisService } from '../common/redis/redis.service';
import { Clock } from './clock';
import { identityError } from './identity.errors';
import { IdentityCryptoService } from './identity-crypto.service';

const CONTEXT_COOKIE = '__Host-ph-context';
export const REFRESH_COOKIE = '__Secure-ph-refresh';

function cookies(request: Request): Map<string, string> {
    const result = new Map<string, string>();
    for (const item of (request.headers.cookie ?? '').split(';')) {
        const separator = item.indexOf('=');
        if (separator > 0) {
            result.set(item.slice(0, separator).trim(), item.slice(separator + 1).trim());
        }
    }
    return result;
}

@Injectable()
export class BrowserSecurityService {
    private readonly origins: Set<string>;
    private readonly redisNamespace: string;

    constructor(
        @Inject(ENVIRONMENT) environment: Environment,
        private readonly redis: RedisService,
        private readonly crypto: IdentityCryptoService,
        private readonly clock: Clock
    ) {
        this.origins = new Set(environment.IDENTITY_ALLOWED_ORIGINS.split(',').map((origin) => origin.trim()));
        this.redisNamespace = environment.REDIS_NAMESPACE;
    }

    async context(request: Request, response: Response): Promise<{ csrfToken: string; expiresAt: string }> {
        this.assertOrigin(request, true);
        try {
            await this.redis.ping();
        } catch {
            throw identityError('AUTH_TEMPORARILY_UNAVAILABLE', 503);
        }
        const existing = cookies(request).get(CONTEXT_COOKIE);
        if (existing !== undefined) {
            const csrfToken = await this.redis.client.get(this.contextKey(existing));
            if (csrfToken !== null) {
                return { csrfToken, expiresAt: new Date(this.clock.now().getTime() + 3_600_000).toISOString() };
            }
        }
        return this.rotateContext(response);
    }

    async rotateContext(response: Response): Promise<{ csrfToken: string; expiresAt: string }> {
        try {
            await this.redis.ping();
        } catch {
            throw identityError('AUTH_TEMPORARILY_UNAVAILABLE', 503);
        }
        const context = this.crypto.secret();
        const csrfToken = this.crypto.secret();
        await this.redis.client.set(this.contextKey(context), csrfToken, 'EX', 3600);
        response.cookie(CONTEXT_COOKIE, context, {
            secure: true,
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 3_600_000,
        });
        return { csrfToken, expiresAt: new Date(this.clock.now().getTime() + 3_600_000).toISOString() };
    }

    async assertMutation(request: Request): Promise<void> {
        this.assertOrigin(request, false);
        try {
            await this.redis.ping();
        } catch {
            throw identityError('AUTH_TEMPORARILY_UNAVAILABLE', 503);
        }
        const context = cookies(request).get(CONTEXT_COOKIE);
        const supplied = request.header('X-CSRF-Token');
        if (context === undefined || supplied === undefined) {
            throw identityError('REQUEST_NOT_ALLOWED', 403);
        }
        const expected = await this.redis.client.get(this.contextKey(context));
        if (expected === null || !this.crypto.equalHash(this.crypto.hash(expected), this.crypto.hash(supplied))) {
            throw identityError('REQUEST_NOT_ALLOWED', 403);
        }
    }

    async assertSessionMutation(request: Request, platform: string): Promise<void> {
        const origin = request.header('Origin');
        const csrf = request.header('X-CSRF-Token');
        if (platform === 'MOBILE') {
            if (origin !== undefined || csrf !== undefined) throw identityError('REQUEST_NOT_ALLOWED', 403);
            return;
        }
        await this.assertMutation(request);
    }

    assertNativeMutation(request: Request): void {
        if (
            request.header('Origin') !== undefined ||
            request.header('X-CSRF-Token') !== undefined ||
            cookies(request).has(CONTEXT_COOKIE) ||
            cookies(request).has(REFRESH_COOKIE)
        ) {
            throw identityError('REQUEST_NOT_ALLOWED', 403);
        }
    }

    refreshToken(request: Request): string | undefined {
        return cookies(request).get(REFRESH_COOKIE);
    }

    setRefresh(response: Response, token: string, maximumAgeSeconds: number): void {
        response.cookie(REFRESH_COOKIE, token, {
            secure: true,
            httpOnly: true,
            sameSite: 'lax',
            path: '/v1/auth',
            maxAge: maximumAgeSeconds * 1000,
        });
    }

    clearRefresh(response: Response): void {
        response.cookie(REFRESH_COOKIE, '', {
            secure: true,
            httpOnly: true,
            sameSite: 'lax',
            path: '/v1/auth',
            maxAge: 0,
        });
    }

    private assertOrigin(request: Request, allowSameOriginFetch: boolean): void {
        const origin = request.header('Origin');
        if (origin !== undefined && this.origins.has(origin)) {
            return;
        }
        if (allowSameOriginFetch && origin === undefined && request.header('Sec-Fetch-Site') === 'same-origin') {
            return;
        }
        throw identityError('REQUEST_NOT_ALLOWED', 403);
    }

    private contextKey(context: string): string {
        return `${this.redisNamespace}:identity:context:${this.crypto.hash(context)}`;
    }
}
