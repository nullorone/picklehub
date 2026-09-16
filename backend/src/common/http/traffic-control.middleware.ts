import { Inject, Injectable, type NestMiddleware, ServiceUnavailableException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

import { ENVIRONMENT } from '../config/config.module';
import type { Environment } from '../config/environment';

interface WindowCounter {
    count: number;
    expiresAt: number;
}

const MAXIMUM_TRACKED_CLIENTS = 10_000;

@Injectable()
export class TrafficControlMiddleware implements NestMiddleware {
    private readonly counters = new Map<string, WindowCounter>();

    constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {}

    use(request: Request, response: Response, next: NextFunction): void {
        if (this.isEmergencyDisabled(request.path)) {
            next(new ServiceUnavailableException('FEATURE_TEMPORARILY_DISABLED'));
            return;
        }

        const healthRoute = request.path === '/v1/health/live' || request.path === '/v1/health/ready';
        const limit = healthRoute
            ? this.environment.HEALTH_RATE_LIMIT_PER_MINUTE
            : this.environment.HTTP_RATE_LIMIT_PER_MINUTE;
        const key = `${healthRoute ? 'probe' : 'http'}:${request.socket.remoteAddress ?? 'unknown'}`;
        const now = Date.now();
        const current = this.counters.get(key);
        const counter =
            current === undefined || current.expiresAt <= now ? { count: 0, expiresAt: now + 60_000 } : current;
        counter.count += 1;
        this.counters.set(key, counter);
        this.evictExpired(now);

        response.setHeader('RateLimit-Limit', String(limit));
        response.setHeader('RateLimit-Remaining', String(Math.max(0, limit - counter.count)));
        response.setHeader('RateLimit-Reset', String(Math.max(1, Math.ceil((counter.expiresAt - now) / 1000))));
        if (counter.count > limit) {
            const requestId = response.getHeader('X-Request-ID')?.toString() ?? randomUUID();
            if (!response.hasHeader('X-Request-ID')) response.setHeader('X-Request-ID', requestId);
            if (!response.hasHeader('X-Correlation-ID')) response.setHeader('X-Correlation-ID', requestId);
            if (!response.hasHeader('Content-Language')) response.setHeader('Content-Language', 'ru-RU');
            response.setHeader('Retry-After', String(Math.max(1, Math.ceil((counter.expiresAt - now) / 1000))));
            response.status(429).json({
                error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Слишком много запросов. Повторите попытку позже.' },
                requestId,
            });
            return;
        }
        next();
    }

    private isEmergencyDisabled(path: string): boolean {
        return (
            (this.environment.EMERGENCY_DISABLE_CONTENT === 'true' && path.startsWith('/v1/content')) ||
            (this.environment.EMERGENCY_DISABLE_ADVERTISING === 'true' && path.startsWith('/v1/advertising')) ||
            (this.environment.EMERGENCY_DISABLE_MINI_GAME === 'true' && path.startsWith('/v1/mini-game'))
        );
    }

    private evictExpired(now: number): void {
        if (this.counters.size < MAXIMUM_TRACKED_CLIENTS) return;
        for (const [key, counter] of this.counters) {
            if (counter.expiresAt <= now || this.counters.size >= MAXIMUM_TRACKED_CLIENTS) this.counters.delete(key);
            if (this.counters.size < MAXIMUM_TRACKED_CLIENTS) return;
        }
    }
}
