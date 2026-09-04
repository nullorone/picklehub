import type { Environment } from '../../src/common/config/environment';
import type { PrismaService } from '../../src/common/database/prisma.service';
import { ApplicationLifecycleService } from '../../src/common/lifecycle/application-lifecycle.service';
import type { ApplicationLogger } from '../../src/common/logging/application-logger.service';
import type { RedisService } from '../../src/common/redis/redis.service';
import { HealthService } from '../../src/health/health.service';

describe('HealthService', () => {
    const environment = { DEPENDENCY_TIMEOUT_MS: 100 } as Environment;
    const logger = { warn: jest.fn() } as unknown as ApplicationLogger;

    it('is ready only when PostgreSQL/PostGIS and Redis are ready', async () => {
        const lifecycle = new ApplicationLifecycleService();
        const prisma = { isReady: jest.fn().mockResolvedValue(true) } as unknown as PrismaService;
        const redis = { ping: jest.fn().mockResolvedValue(true) } as unknown as RedisService;
        const service = new HealthService(environment, prisma, redis, lifecycle, logger);

        await expect(service.readiness()).resolves.toEqual({ ready: true });

        (redis.ping as jest.Mock).mockResolvedValue(false);
        await expect(service.readiness()).resolves.toEqual({ ready: false });
    });

    it('becomes not ready as soon as shutdown starts', async () => {
        const lifecycle = new ApplicationLifecycleService();
        lifecycle.beginShutdown();
        const isReady = jest.fn();
        const ping = jest.fn();
        const prisma = { isReady } as unknown as PrismaService;
        const redis = { ping } as unknown as RedisService;
        const service = new HealthService(environment, prisma, redis, lifecycle, logger);

        await expect(service.readiness()).resolves.toEqual({ ready: false });
        expect(isReady).not.toHaveBeenCalled();
        expect(ping).not.toHaveBeenCalled();
    });
});
