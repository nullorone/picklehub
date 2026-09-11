import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';

import { ApplicationLogger } from '../common/logging/application-logger.service';
import { WorkerModule } from '../worker.module';
import { ProfileProjectionService } from './profile-projection.service';

async function main(): Promise<void> {
    const context = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
    const logger = context.get(ApplicationLogger);
    context.useLogger(logger);
    try {
        const generationId = await context.get(ProfileProjectionService).rebuild('MANUAL');
        logger.log({ event: 'profile.statistics.rebuild.completed', generationId }, 'ProfileStatisticsRebuild');
    } finally {
        await context.close();
    }
}

void main();
