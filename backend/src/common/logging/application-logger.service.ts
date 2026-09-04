import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';

import { ENVIRONMENT } from '../config/config.module';
import type { Environment } from '../config/environment';
import { RequestContextService } from '../request-context/request-context.service';

const REDACTED_PATHS = [
    'authorization',
    'cookie',
    "['set-cookie']",
    '*.authorization',
    '*.cookie',
    '*.token',
    '*.accessToken',
    '*.refreshToken',
    '*.magicLink',
    '*.email',
    '*.initData',
    '*.chatText',
    '*.latitude',
    '*.longitude',
    'req.headers.authorization',
    'req.headers.cookie',
    "req.headers['x-telegram-init-data']",
] as const;

const SENSITIVE_KEYS = new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'token',
    'accesstoken',
    'refreshtoken',
    'magiclink',
    'email',
    'initdata',
    'chattext',
    'latitude',
    'longitude',
]);

export function redactSensitiveData(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(redactSensitiveData);
    }
    if (typeof value !== 'object' || value === null) {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, nestedValue]) => [
            key,
            SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redactSensitiveData(nestedValue),
        ])
    );
}

@Injectable()
export class ApplicationLogger implements LoggerService {
    private readonly logger: Logger;

    constructor(
        @Inject(ENVIRONMENT) environment: Environment,
        private readonly requestContext: RequestContextService
    ) {
        this.logger = pino({
            level: environment.LOG_LEVEL,
            base: {
                service: 'picklehub-backend',
                role: environment.APP_ROLE,
                environment: environment.NODE_ENV,
            },
            timestamp: pino.stdTimeFunctions.isoTime,
            redact: {
                paths: [...REDACTED_PATHS],
                censor: '[REDACTED]',
            },
            serializers: {
                err: pino.stdSerializers.err,
            },
        });
    }

    log(message: unknown, context?: string): void {
        this.write('info', message, context);
    }

    error(message: unknown, trace?: string, context?: string): void {
        this.write('error', message, context, trace === undefined ? undefined : { trace });
    }

    warn(message: unknown, context?: string): void {
        this.write('warn', message, context);
    }

    debug(message: unknown, context?: string): void {
        this.write('debug', message, context);
    }

    verbose(message: unknown, context?: string): void {
        this.write('trace', message, context);
    }

    private write(
        level: 'info' | 'error' | 'warn' | 'debug' | 'trace',
        message: unknown,
        context?: string,
        extra?: Record<string, unknown>
    ): void {
        const request = this.requestContext.get();
        const bindings = {
            ...extra,
            ...(context === undefined ? {} : { context }),
            ...(request === undefined
                ? {}
                : {
                      requestId: request.requestId,
                      correlationId: request.correlationId,
                  }),
        };

        if (message instanceof Error) {
            this.logger[level]({ ...bindings, errorType: message.name }, 'Application error');
            return;
        }

        if (typeof message === 'object' && message !== null) {
            this.logger[level]({ ...bindings, data: redactSensitiveData(message) }, 'Structured application log');
            return;
        }

        this.logger[level](bindings, String(message));
    }
}
