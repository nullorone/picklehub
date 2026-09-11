import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../common/database/database.module';
import { RequestContextModule } from '../common/request-context/request-context.module';
import { IdentityModule } from '../identity/identity.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ConfiguredProfileAvatarStorage, ProfileAvatarStorage } from './profile-avatar-storage';
import { ProfileController } from './profile.controller';
import { ProfileCursorService } from './profile-cursor.service';
import { ProfileIdempotencyService } from './profile-idempotency.service';
import { ProfileProjectionWorkerService } from './profile-projection-worker.service';
import { ProfileProjectionService } from './profile-projection.service';
import { ProfileService } from './profile.service';

@Module({
    imports: [DatabaseModule, IdentityModule, OutboxModule, AuditModule, RequestContextModule],
    controllers: [ProfileController],
    providers: [
        ProfileService,
        ProfileCursorService,
        ProfileIdempotencyService,
        ProfileProjectionService,
        ProfileProjectionWorkerService,
        { provide: ProfileAvatarStorage, useClass: ConfiguredProfileAvatarStorage },
    ],
    exports: [ProfileService, ProfileProjectionService],
})
export class ProfilesModule {}
