import { HttpLoggingMiddleware } from '../../src/common/logging/http-logging.middleware';

describe('HttpLoggingMiddleware', () => {
    it('redacts raw match invite capabilities from structured logs', () => {
        const logger = { log: jest.fn() };
        const middleware = new HttpLoggingMiddleware(logger as never);
        let finish: (() => void) | undefined;
        const response = {
            statusCode: 200,
            once: jest.fn((_event: string, callback: () => void) => {
                finish = callback;
            }),
        };
        middleware.use(
            { method: 'GET', originalUrl: '/v1/match-invites/secret-capability-value?source=share' } as never,
            response as never,
            jest.fn()
        );
        finish?.();
        expect(logger.log).toHaveBeenCalledWith(
            expect.objectContaining({ route: '/v1/match-invites/:inviteToken' }),
            HttpLoggingMiddleware.name
        );
        expect(JSON.stringify(logger.log.mock.calls)).not.toContain('secret-capability-value');
    });

    it('redacts raw club invitation capabilities including command paths', () => {
        const logger = { log: jest.fn() };
        const middleware = new HttpLoggingMiddleware(logger as never);
        let finish: (() => void) | undefined;
        const response = {
            statusCode: 200,
            once: jest.fn((_event: string, callback: () => void) => {
                finish = callback;
            }),
        };
        middleware.use(
            { method: 'POST', originalUrl: '/v1/club-invitations/club-secret-capability/accept' } as never,
            response as never,
            jest.fn()
        );
        finish?.();
        expect(logger.log).toHaveBeenCalledWith(
            expect.objectContaining({ route: '/v1/club-invitations/:invitationToken/accept' }),
            HttpLoggingMiddleware.name
        );
        expect(JSON.stringify(logger.log.mock.calls)).not.toContain('club-secret-capability');
    });
});
