import { Module } from '@nestjs/common';
import { DatabaseService } from './database.js';
import { HealthController } from './health.controller.js';

@Module({
    controllers: [HealthController],
    providers: [DatabaseService],
})
export class AppModule {}
