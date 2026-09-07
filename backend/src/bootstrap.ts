import { BadRequestException, ValidationPipe, type INestApplication } from '@nestjs/common';

import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { ApplicationLogger } from './common/logging/application-logger.service';
import { RequestContextService } from './common/request-context/request-context.service';

export function configureApplication(application: INestApplication): void {
    const logger = application.get(ApplicationLogger);

    application.useLogger(logger);
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
