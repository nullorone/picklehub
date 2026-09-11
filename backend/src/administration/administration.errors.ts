import { HttpException } from '@nestjs/common';

export class AdministrationException extends HttpException {
    constructor(
        readonly code: string,
        status: number
    ) {
        super({ code, message: code }, status);
    }
}

export function administrationError(code: string, status: number): AdministrationException {
    return new AdministrationException(code, status);
}
