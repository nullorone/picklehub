import { Module } from '@nestjs/common';

import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxQueueService } from './outbox-queue.service';
import { OutboxService } from './outbox.service';

@Module({
    providers: [OutboxService, OutboxQueueService, OutboxDispatcherService],
    exports: [OutboxService, OutboxQueueService, OutboxDispatcherService],
})
export class OutboxModule {}
