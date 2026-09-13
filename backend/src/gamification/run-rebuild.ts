import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { WorkerModule } from '../worker.module';
import { GamificationProjectionService } from './gamification-projection.service';

async function main(): Promise<void> {
    const application = await NestFactory.createApplicationContext(WorkerModule, { logger: false });
    try {
        const count = await application.get(GamificationProjectionService).rebuildAll();
        process.stdout.write(`Rebuilt ${String(count)} gamification projections.\n`);
    } finally {
        await application.close();
    }
}

void main();
