import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { ApplicationLogger } from './application-logger.service';

@Injectable()
export class HttpLoggingMiddleware implements NestMiddleware {
    constructor(private readonly logger: ApplicationLogger) {}

    use(request: Request, response: Response, next: NextFunction): void {
        const startedAt = performance.now();
        const route = new URL(request.originalUrl, 'http://localhost').pathname;

        response.once('finish', () => {
            this.logger.log(
                {
                    event: 'http.request.completed',
                    method: request.method,
                    route,
                    statusCode: response.statusCode,
                    durationMs: Math.round(performance.now() - startedAt),
                },
                HttpLoggingMiddleware.name
            );
        });

        next();
    }
}
