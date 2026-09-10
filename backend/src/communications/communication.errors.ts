import { HttpException } from '@nestjs/common';

export type CommunicationErrorCode =
    | 'VALIDATION_FAILED'
    | 'INVALID_CURSOR'
    | 'CURSOR_EXPIRED'
    | 'RESYNC_REQUIRED'
    | 'SESSION_INVALID'
    | 'CONVERSATION_ACCESS_DENIED'
    | 'CONVERSATION_NOT_FOUND'
    | 'MESSAGE_NOT_FOUND'
    | 'NOTIFICATION_NOT_FOUND'
    | 'MESSAGE_MUTATION_FORBIDDEN'
    | 'MESSAGE_REVISION_CONFLICT'
    | 'IDEMPOTENCY_KEY_REUSED'
    | 'PREFERENCE_VERSION_CONFLICT'
    | 'RATE_LIMITED';

export class CommunicationException extends HttpException {
    constructor(
        readonly code: CommunicationErrorCode,
        status: number
    ) {
        super({ code, message: code }, status);
    }
}

export function communicationError(code: CommunicationErrorCode, status: number): CommunicationException {
    return new CommunicationException(code, status);
}
