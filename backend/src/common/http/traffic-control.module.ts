import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { TrafficControlMiddleware } from './traffic-control.middleware';

@Module({ providers: [TrafficControlMiddleware] })
export class TrafficControlModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(TrafficControlMiddleware).forRoutes('{*path}');
    }
}
