import type { NextFunction, Request, Response } from 'express';

import { RequestContextMiddleware } from '../../src/common/request-context/request-context.middleware';
import { RequestContextService } from '../../src/common/request-context/request-context.service';

describe('RequestContextMiddleware', () => {
    it('keeps valid UUIDv4 identifiers and returns them as headers', () => {
        const service = new RequestContextService();
        const middleware = new RequestContextMiddleware(service);
        const headers = new Map<string, string>();
        const requestId = 'b85e2f1a-ec0d-4b40-b3cc-60a71b1e5f98';
        const correlationId = '8e4398c6-cbee-4386-9871-28206d45ca17';
        const request = {
            headers: { 'x-request-id': requestId, 'x-correlation-id': correlationId },
        } as unknown as Request;
        const response = {
            setHeader: (name: string, value: string) => headers.set(name, value),
        } as unknown as Response;
        const next: NextFunction = jest.fn(() => {
            expect(service.get()).toEqual({ requestId, correlationId, locale: 'ru-RU' });
        });

        middleware.use(request, response, next);

        expect(headers.get('X-Request-ID')).toBe(requestId);
        expect(headers.get('X-Correlation-ID')).toBe(correlationId);
        expect(headers.get('Content-Language')).toBe('ru-RU');
    });

    it('replaces invalid identifiers without reflecting their values', () => {
        const service = new RequestContextService();
        const middleware = new RequestContextMiddleware(service);
        const headers = new Map<string, string>();
        const request = {
            headers: { 'x-request-id': 'secret', 'x-correlation-id': 'also-secret' },
        } as unknown as Request;
        const response = {
            setHeader: (name: string, value: string) => headers.set(name, value),
        } as unknown as Response;

        middleware.use(request, response, jest.fn());

        expect(headers.get('X-Request-ID')).toMatch(/^[0-9a-f-]{36}$/u);
        expect(headers.get('X-Correlation-ID')).toBe(headers.get('X-Request-ID'));
        expect([...headers.values()]).not.toContain('secret');
    });
});
