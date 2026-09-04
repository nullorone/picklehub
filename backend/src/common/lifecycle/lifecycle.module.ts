import { Global, Module } from '@nestjs/common';

import { ApplicationLifecycleService } from './application-lifecycle.service';
import { ShutdownService } from './shutdown.service';

@Global()
@Module({
    providers: [ApplicationLifecycleService, ShutdownService],
    exports: [ApplicationLifecycleService],
})
export class LifecycleModule {}
