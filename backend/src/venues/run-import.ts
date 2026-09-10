import 'reflect-metadata';
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { VenueImportService } from './venue-import.service';

function option(name: string): string | undefined {
    const index = process.argv.indexOf(name);
    return index < 0 ? undefined : process.argv[index + 1];
}

async function run(): Promise<void> {
    const scope = option('--scope');
    if (scope === undefined) throw new Error('Usage: venues:import -- --scope <json> [--dry-run]');
    const application = await NestFactory.createApplicationContext(AppModule, { logger: false });
    try {
        const result = await application.get(VenueImportService).import(scope, process.argv.includes('--dry-run'));
        process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally {
        await application.close();
    }
}

void run().catch((error: unknown) => {
    const code =
        error instanceof Error && /^[A-Z][A-Z0-9_]+$/u.test(error.message) ? error.message : 'VENUE_IMPORT_FAILED';
    process.stderr.write(`${JSON.stringify({ status: 'FAILED', code })}\n`);
    process.exitCode = 1;
});
