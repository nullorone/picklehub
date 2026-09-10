import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../common/database/database.module';
import { RedisModule } from '../common/redis/redis.module';
import { RequestContextModule } from '../common/request-context/request-context.module';
import { OutboxModule } from '../outbox/outbox.module';
import { BrowserSecurityService } from './browser-security.service';
import { Clock, SystemClock } from './clock';
import { CursorService } from './cursor.service';
import { ConfiguredEmailProvider, EmailProvider } from './email-provider';
import { IdentityAttemptService } from './identity-attempt.service';
import { IdentityController } from './identity.controller';
import { IdentityCryptoService } from './identity-crypto.service';
import { IdentityRateLimitService } from './rate-limit.service';
import { IdentityService } from './identity.service';
import { IdempotencyService } from './idempotency.service';
import { NoStoreInterceptor } from './no-store.interceptor';
import { TelegramVerifierService } from './telegram-verifier.service';

@Module({
    imports: [DatabaseModule, RedisModule, RequestContextModule, OutboxModule, AuditModule],
    controllers: [IdentityController],
    providers: [
        IdentityService,
        IdentityAttemptService,
        IdentityCryptoService,
        TelegramVerifierService,
        BrowserSecurityService,
        IdentityRateLimitService,
        NoStoreInterceptor,
        IdempotencyService,
        CursorService,
        { provide: Clock, useClass: SystemClock },
        { provide: EmailProvider, useClass: ConfiguredEmailProvider },
    ],
    exports: [IdentityService, IdentityCryptoService, TelegramVerifierService, Clock, EmailProvider],
})
export class IdentityModule {}
