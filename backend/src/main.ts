import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import dotenv from 'dotenv';
import type { Express, Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

async function bootstrap(): Promise<void> {
    dotenv.config();
    let config;
    try {
        config = loadConfig(process.env);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid configuration';
        process.stderr.write(`${message}\n`);
        process.exitCode = 1;
        return;
    }

    const app = await NestFactory.create(AppModule, { logger: false });
    app.enableShutdownHooks();
    app.enableCors({
        origin: config.frontendOrigins,
        credentials: false,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id'],
        exposedHeaders: ['X-Request-Id'],
    });

    const expressApp = app.getHttpAdapter().getInstance() as unknown as Express;
    expressApp.use((request: Request, response: Response, next: NextFunction) => {
        const suppliedId = request.header('x-request-id');
        const requestId = suppliedId && /^[a-zA-Z0-9._-]{1,80}$/.test(suppliedId) ? suppliedId : randomUUID();
        const startedAt = Date.now();
        response.setHeader('X-Request-Id', requestId);
        response.on('finish', () => {
            process.stdout.write(
                `${JSON.stringify({
                    level: 'info',
                    message: 'http_request',
                    requestId,
                    method: request.method,
                    path: request.path,
                    statusCode: response.statusCode,
                    durationMs: Date.now() - startedAt,
                })}\n`
            );
        });
        next();
    });

    await app.listen(config.port, config.host);
}

void bootstrap();
