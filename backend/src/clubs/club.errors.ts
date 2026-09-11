import { HttpException } from '@nestjs/common';

export class ClubException extends HttpException {
    constructor(
        readonly code: string,
        status: number
    ) {
        super({ code }, status);
    }
}

export function clubError(code: string, status: number): ClubException {
    return new ClubException(code, status);
}
