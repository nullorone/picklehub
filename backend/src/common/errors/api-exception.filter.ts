import { ArgumentsHost, Catch, HttpException, HttpStatus, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { ApplicationLogger } from '../logging/application-logger.service';
import { RequestContextService } from '../request-context/request-context.service';

interface ValidationIssue {
    property?: string;
    constraints?: Record<string, string>;
    children?: ValidationIssue[];
}

interface NestErrorResponse {
    message?: string | string[] | ValidationIssue[];
    error?: string;
}

function collectValidationDetails(
    issues: ValidationIssue[],
    parent = ''
): { code: string; field: string; message: string }[] {
    return issues.flatMap((issue) => {
        const property = issue.property ?? '';
        const field = parent === '' ? property : `${parent}.${property}`;
        const ownDetails = Object.keys(issue.constraints ?? {}).map(() => ({
            code: 'INVALID_FIELD',
            field: field || 'request',
            message: 'Поле заполнено неверно.',
        }));
        return [...ownDetails, ...collectValidationDetails(issue.children ?? [], field)];
    });
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
    constructor(
        private readonly requestContext: RequestContextService,
        private readonly logger: ApplicationLogger
    ) {}

    catch(exception: unknown, host: ArgumentsHost): void {
        const response = host.switchToHttp().getResponse<Response>();
        const context = this.requestContext.get();
        const requestId = context?.requestId ?? response.getHeader('X-Request-ID')?.toString() ?? 'unknown';
        const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
        const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
        const body: NestErrorResponse = typeof exceptionResponse === 'object' ? exceptionResponse : {};
        const validationIssues =
            Array.isArray(body.message) && body.message.every((item) => typeof item === 'object')
                ? collectValidationDetails(body.message).slice(0, 50)
                : undefined;
        const isValidation = status === 400 && validationIssues !== undefined;

        if (status >= 500) {
            this.logger.error(
                exception instanceof Error ? exception : new Error('Unknown server exception'),
                undefined,
                ApiExceptionFilter.name
            );
        } else {
            this.logger.warn({ event: 'http.request.rejected', statusCode: status }, ApiExceptionFilter.name);
        }

        response.status(status).json({
            error: {
                code: isValidation ? 'VALIDATION_FAILED' : this.codeForStatus(status),
                message: isValidation ? 'Проверьте заполнение полей.' : this.messageForStatus(status),
                ...(validationIssues === undefined || validationIssues.length === 0
                    ? {}
                    : { details: validationIssues }),
            },
            requestId,
        });
    }

    private codeForStatus(status: number): string {
        const codes: Partial<Record<number, string>> = {
            [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
            [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
            [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
            [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
            [HttpStatus.CONFLICT]: 'CONFLICT',
            [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
            [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
            [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMIT_EXCEEDED',
            [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
        };

        return codes[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED');
    }

    private messageForStatus(status: number): string {
        if (status === 404) {
            return 'Ресурс не найден.';
        }
        if (status === 429) {
            return 'Слишком много запросов. Повторите попытку позже.';
        }
        if (status >= 500) {
            return 'Сервис временно недоступен.';
        }
        return 'Запрос не может быть выполнен.';
    }
}
