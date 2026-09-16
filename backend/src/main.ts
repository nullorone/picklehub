import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { configureApplication } from './bootstrap';
import { getEnvironment } from './common/config/environment';
import { ApplicationLogger } from './common/logging/application-logger.service';
import { ApplicationLifecycleService } from './common/lifecycle/application-lifecycle.service';

async function bootstrap(): Promise<void> {
    const environment = getEnvironment();
    const application = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
    configureApplication(application);
    const lifecycle = application.get(ApplicationLifecycleService);
    process.prependOnceListener('SIGTERM', () => {
        lifecycle.beginShutdown();
    });
    process.prependOnceListener('SIGINT', () => {
        lifecycle.beginShutdown();
    });

    await application.listen(environment.PORT, environment.HOST);
    application.get(ApplicationLogger).log(
        {
            event: 'application.started',
            host: environment.HOST,
            port: environment.PORT,
        },
        'Bootstrap'
    );
}

void bootstrap().catch(() => {
    process.stderr.write(`${JSON.stringify({ level: 'fatal', event: 'application.start.failed' })}\n`);
    process.exitCode = 1;
});
