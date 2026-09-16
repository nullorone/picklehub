import { randomBytes, randomUUID } from 'node:crypto';

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { RequestContextService } from './request-context.service';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/u;
const ZERO_TRACE_ID = '00000000000000000000000000000000';
const ZERO_PARENT_ID = '0000000000000000';

function acceptedTraceId(value: string | string[] | undefined): string | undefined {
    if (typeof value !== 'string') return undefined;
    const match = TRACEPARENT_PATTERN.exec(value);
    if (match?.[1] === undefined || match[1] === ZERO_TRACE_ID || match[2] === ZERO_PARENT_ID) return undefined;
    return match[1];
}

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
        const traceId = acceptedTraceId(request.headers.traceparent) ?? randomBytes(16).toString('hex');

        response.setHeader('X-Request-ID', requestId);
        response.setHeader('X-Correlation-ID', correlationId);
        response.setHeader('Content-Language', 'ru-RU');
        response.setHeader('X-Trace-ID', traceId);

        this.requestContext.run({ requestId, correlationId, traceId, locale: 'ru-RU' }, next);
    }
}
