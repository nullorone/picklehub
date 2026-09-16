import { BadRequestException, ValidationPipe, type INestApplication } from '@nestjs/common';
import { WsAdapter } from '@nestjs/platform-ws';
import { json, urlencoded } from 'express';

import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { ApplicationLogger } from './common/logging/application-logger.service';
import { RequestContextService } from './common/request-context/request-context.service';
import { getEnvironment } from './common/config/environment';

export function configureApplication(application: INestApplication): void {
    const logger = application.get(ApplicationLogger);
    const environment = getEnvironment();

    application.useLogger(logger);
    application.use(json({ limit: environment.HTTP_BODY_LIMIT_BYTES, strict: true }));
    application.use(urlencoded({ limit: environment.HTTP_BODY_LIMIT_BYTES, extended: false, parameterLimit: 100 }));
    application.useWebSocketAdapter(
        new WsAdapter(application, {
            messageParser: (data) => {
                const serialized =
                    typeof data === 'string'
                        ? data
                        : Buffer.isBuffer(data)
                          ? data.toString('utf8')
                          : data instanceof ArrayBuffer
                            ? Buffer.from(data).toString('utf8')
                            : Buffer.concat(data).toString('utf8');
                const message = JSON.parse(serialized) as { type?: unknown };
                if (typeof message.type !== 'string') return;
                return { event: message.type, data: message };
            },
        })
    );
    application.setGlobalPrefix('v1');
    application.useGlobalPipes(
        new ValidationPipe({
            transform: true,
            whitelist: true,
            forbidNonWhitelisted: true,
            forbidUnknownValues: true,
            stopAtFirstError: false,
            validationError: {
                target: false,
                value: false,
            },
            exceptionFactory: (errors) => new BadRequestException(errors),
        })
    );
    application.useGlobalFilters(new ApiExceptionFilter(application.get(RequestContextService), logger));
    application.enableShutdownHooks(['SIGTERM', 'SIGINT']);
}
