import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { NotificationDeliveryDispatcherService } from './notification-delivery-dispatcher.service';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function run(): Promise<void> {
    const flag = process.argv.indexOf('--delivery-id');
    const deliveryId = flag < 0 ? undefined : process.argv[flag + 1];
    if (deliveryId === undefined || !UUID_PATTERN.test(deliveryId)) {
        throw new Error('A valid --delivery-id is required');
    }
    const application = await NestFactory.createApplicationContext(AppModule, { logger: false });
    try {
        const retried = await application.get(NotificationDeliveryDispatcherService).retryFailed(deliveryId);
        process.stdout.write(`${JSON.stringify({ event: 'notification.delivery.retry', retried })}\n`);
        if (!retried) process.exitCode = 2;
    } finally {
        await application.close();
    }
}

void run().catch(() => {
    process.stderr.write(`${JSON.stringify({ event: 'notification.delivery.retry.failed' })}\n`);
    process.exitCode = 1;
});
