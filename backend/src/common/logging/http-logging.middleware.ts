import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { ApplicationLogger } from './application-logger.service';
import { OperationalMetricsService } from '../../operations/operational-metrics.service';

function scenario(method: string, route: string): string {
    if (route.includes('/auth/') || route.includes('/sessions')) return 'AUTHENTICATION';
    if (method === 'GET' && (route.includes('/matches') || route.includes('/venues'))) return 'SEARCH';
    if (route.includes('/join') || route.includes('/applications')) return 'JOIN';
    if (route.includes('/chat') || route.includes('/messages')) return 'CHAT';
    if (route.includes('/result') || route.includes('/completion')) return 'MATCH_COMPLETION';
    return 'OTHER';
}

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
    constructor(
        private readonly logger: ApplicationLogger,
        private readonly metrics: OperationalMetricsService
    ) {}

    use(request: Request, response: Response, next: NextFunction): void {
        const startedAt = performance.now();
        const route = new URL(request.originalUrl, 'http://localhost').pathname
            .replace(/^(\/v1\/match-invites\/)[^/]+$/u, '$1:inviteToken')
            .replace(/^(\/v1\/club-invitations\/)[^/]+(\/(?:accept|decline))?$/u, '$1:invitationToken$2')
            .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?=\/|$)/gu, '/:id')
            .replace(/^(\/v1\/content\/articles\/[^/]+\/)[^/]+$/u, '$1:slug');

        response.once('finish', () => {
            const durationSeconds = (performance.now() - startedAt) / 1000;
            const statusClass = `${String(Math.floor(response.statusCode / 100))}xx`;
            const outcome = response.statusCode >= 500 ? 'ERROR' : response.statusCode >= 400 ? 'REJECTED' : 'SUCCESS';
            this.metrics.observeHttp(scenario(request.method, route), outcome, statusClass, durationSeconds);
            this.logger.log(
                {
                    event: 'http.request.completed',
                    method: request.method,
                    route,
                    statusCode: response.statusCode,
                    durationMs: Math.round(durationSeconds * 1000),
                },
                HttpLoggingMiddleware.name
            );
        });

        next();
    }
}
