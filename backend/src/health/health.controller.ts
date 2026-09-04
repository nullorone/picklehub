import { Controller, Get, HttpCode, Res } from '@nestjs/common';
import type { Response } from 'express';

import { RequestContextService } from '../common/request-context/request-context.service';
import { HealthService } from './health.service';

interface HealthResponse {
    status: 'ok' | 'not_ready';
    checkedAt: string;
    requestId: string;
}

@Controller('health')
export class HealthController {
    constructor(
        private readonly health: HealthService,
        private readonly requestContext: RequestContextService
    ) {}

    @Get('live')
    liveness(): HealthResponse {
        return this.response('ok');
    }

    @Get('ready')
    @HttpCode(200)
    async readiness(@Res({ passthrough: true }) response: Response): Promise<HealthResponse> {
        const { ready } = await this.health.readiness();

        if (!ready) {
            response.status(503);
            response.setHeader('Retry-After', '1');
        }

        return this.response(ready ? 'ok' : 'not_ready');
    }

    private response(status: HealthResponse['status']): HealthResponse {
        return {
            status,
            checkedAt: new Date().toISOString(),
            requestId: this.requestContext.get()?.requestId ?? '00000000-0000-4000-8000-000000000000',
        };
    }
}
