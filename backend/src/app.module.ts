import { Module } from '@nestjs/common';
import { DatabaseService } from './database.js';
import { HealthController } from './health.controller.js';
import { PrismaService } from './prisma.service.js';
import { TelegramSessionsController } from './telegram-sessions.controller.js';
import { SessionAuthGuard } from './session-auth.guard.js';
import { GamesController } from './games.controller.js';

@Module({
    controllers: [HealthController, TelegramSessionsController, GamesController],
    providers: [DatabaseService, PrismaService, SessionAuthGuard],
})
export class AppModule {}
