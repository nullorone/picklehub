import { Global, MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';

import { ApplicationLogger } from './application-logger.service';
import { HttpLoggingMiddleware } from './http-logging.middleware';

@Global()
@Module({
    providers: [ApplicationLogger, HttpLoggingMiddleware],
    exports: [ApplicationLogger],
})
export class LoggingModule implements NestModule {
    configure(consumer: MiddlewareConsumer): void {
        consumer.apply(HttpLoggingMiddleware).forRoutes('{*path}');
    }
}
