import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { ApplicationLogger } from './common/logging/application-logger.service';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
    const application = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
    const logger = application.get(ApplicationLogger);
    application.useLogger(logger);
    application.enableShutdownHooks(['SIGTERM', 'SIGINT']);
    logger.log({ event: 'worker.started' }, 'Bootstrap');
}

void bootstrap().catch(() => {
    process.stderr.write(`${JSON.stringify({ level: 'fatal', event: 'worker.start.failed' })}\n`);
    process.exitCode = 1;
});
