import { Global, Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';
import { InteractionPolicyService } from './interaction-policy.service';

@Global()
@Module({
    providers: [PrismaService, InteractionPolicyService],
    exports: [PrismaService, InteractionPolicyService],
})
export class DatabaseModule {}
