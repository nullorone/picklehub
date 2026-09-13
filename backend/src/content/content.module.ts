import { Module } from '@nestjs/common';

import { AdministrationModule } from '../administration/administration.module';
import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ContentController } from './content.controller';
import { ContentCursorService } from './content-cursor.service';
import { ContentIdempotencyService } from './content-idempotency.service';
import { ContentIngestionQueueService } from './content-ingestion-queue.service';
import { ContentIngestionWorkerService } from './content-ingestion-worker.service';
import { ContentIngestionService } from './content-ingestion.service';
import { ContentMaintenanceService } from './content-maintenance.service';
import { ContentMediaService, ContentMediaStoragePort, DisabledContentMediaStorage } from './content-media-storage';
import { AllowlistedContentSourceAdapter, ContentSourceAdapterPort } from './content-source.adapter';
import { ContentService } from './content.service';

@Module({
    imports: [AdministrationModule, AuditModule, IdentityModule, OutboxModule],
    controllers: [ContentController],
    providers: [
        ContentService,
        ContentCursorService,
        ContentIdempotencyService,
        ContentIngestionService,
        ContentIngestionQueueService,
        ContentIngestionWorkerService,
        ContentMaintenanceService,
        ContentMediaService,
        { provide: ContentSourceAdapterPort, useClass: AllowlistedContentSourceAdapter },
        { provide: ContentMediaStoragePort, useClass: DisabledContentMediaStorage },
    ],
    exports: [ContentService, ContentMediaService],
})
export class ContentModule {}
