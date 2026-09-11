import { HttpException } from '@nestjs/common';

export class TrustSafetyException extends HttpException {
    constructor(
        readonly code: string,
        status: number
    ) {
        super({ code, message: code }, status);
    }
}

export function trustSafetyError(code: string, status: number): TrustSafetyException {
    return new TrustSafetyException(code, status);
}
