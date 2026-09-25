import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { DatabaseService } from './database.js';

@Controller('health')
export class HealthController {
    constructor(private readonly database: DatabaseService) {}

    @Get('live')
    live(): { status: 'ok' } {
        return { status: 'ok' };
    }

    @Get('ready')
    async ready(): Promise<{ status: 'ok' }> {
        if (!(await this.database.isAvailable())) {
            throw new HttpException({ status: 'unavailable' }, HttpStatus.SERVICE_UNAVAILABLE);
        }
        return { status: 'ok' };
    }
}
