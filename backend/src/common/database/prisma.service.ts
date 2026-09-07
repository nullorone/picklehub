import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

import { ENVIRONMENT } from '../config/config.module';
import type { Environment } from '../config/environment';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor(@Inject(ENVIRONMENT) environment: Environment) {
        super({ adapter: new PrismaPg({ connectionString: environment.DATABASE_URL }) });
    }

    async onModuleInit(): Promise<void> {
        await this.$connect();
    }

    async onModuleDestroy(): Promise<void> {
        await this.$disconnect();
    }

    async isReady(): Promise<boolean> {
        const rows = await this.$queryRaw<{ postgis: boolean }[]>`
            SELECT EXISTS (
                SELECT 1
                FROM pg_extension
                WHERE extname = 'postgis'
            ) AS postgis
        `;

        return rows[0]?.postgis === true;
    }
}
