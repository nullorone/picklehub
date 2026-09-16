import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { RequestContextService } from './request-context.service';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-[0-9a-f]{16}-0[01]$/u;

function acceptedUuid(value: string | string[] | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.toLowerCase();
    return UUID_V4_PATTERN.test(normalized) ? normalized : undefined;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
    constructor(private readonly requestContext: RequestContextService) {}

    use(request: Request, response: Response, next: NextFunction): void {
        const requestId = acceptedUuid(request.headers['x-request-id']) ?? randomUUID();
        const correlationId = acceptedUuid(request.headers['x-correlation-id']) ?? requestId;
        const traceparent = typeof request.headers.traceparent === 'string' ? request.headers.traceparent : '';
        const traceId = TRACEPARENT_PATTERN.exec(traceparent)?.[1] ?? randomBytes(16).toString('hex');

        response.setHeader('X-Request-ID', requestId);
        response.setHeader('X-Correlation-ID', correlationId);
        response.setHeader('Content-Language', 'ru-RU');
        response.setHeader('X-Trace-ID', traceId);

        this.requestContext.run({ requestId, correlationId, traceId, locale: 'ru-RU' }, next);
    }
}
