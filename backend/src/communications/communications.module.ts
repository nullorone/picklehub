import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { OutboxModule } from '../outbox/outbox.module';
import { CommunicationController } from './communication.controller';
import { CommunicationCryptoService } from './communication-crypto.service';
import { CommunicationCursorService } from './communication-cursor.service';
import { CommunicationEventWorkerService } from './communication-event-worker.service';
import { CommunicationGateway } from './communication.gateway';
import { CommunicationIdempotencyService } from './communication-idempotency.service';
import { CommunicationMaintenanceService } from './communication-maintenance.service';
import { CommunicationMetricsService } from './communication-metrics.service';
import { CommunicationService } from './communication.service';
import { NotificationDeliveryDispatcherService } from './notification-delivery-dispatcher.service';
import { NotificationDeliveryQueueService } from './notification-delivery-queue.service';
import { NotificationDeliverySchedulerService } from './notification-delivery-scheduler.service';
import { NotificationDeliveryWorkerService } from './notification-delivery-worker.service';
import {
    ConfiguredEmailNotificationProvider,
    ConfiguredTelegramNotificationProvider,
    EmailNotificationProvider,
    TelegramNotificationProvider,
} from './notification-provider';

@Module({
    imports: [IdentityModule, OutboxModule],
    controllers: [CommunicationController],
    providers: [
        CommunicationService,
        CommunicationCursorService,
        CommunicationCryptoService,
        CommunicationIdempotencyService,
        CommunicationMetricsService,
        CommunicationMaintenanceService,
        CommunicationGateway,
        CommunicationEventWorkerService,
        NotificationDeliveryQueueService,
        NotificationDeliveryDispatcherService,
        NotificationDeliverySchedulerService,
        NotificationDeliveryWorkerService,
        { provide: TelegramNotificationProvider, useClass: ConfiguredTelegramNotificationProvider },
        { provide: EmailNotificationProvider, useClass: ConfiguredEmailNotificationProvider },
    ],
    exports: [CommunicationService, CommunicationMetricsService],
})
export class CommunicationsModule {}
