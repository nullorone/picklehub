import { Module } from '@nestjs/common';

import { AuditModule } from './audit/audit.module';
import { TypedConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/database/database.module';
import { LifecycleModule } from './common/lifecycle/lifecycle.module';
import { LoggingModule } from './common/logging/logging.module';
import { RedisModule } from './common/redis/redis.module';
import { RequestContextModule } from './common/request-context/request-context.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { OutboxModule } from './outbox/outbox.module';
import { OutboxWorkerService } from './outbox/outbox-worker.service';

@Module({
    imports: [
        TypedConfigModule,
        RequestContextModule,
        LoggingModule,
        LifecycleModule,
        DatabaseModule,
        RedisModule,
        OutboxModule,
        IntegrationsModule,
        AuditModule,
    ],
    providers: [OutboxWorkerService],
})
export class WorkerModule {}
