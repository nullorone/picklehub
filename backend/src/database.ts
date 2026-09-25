import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';
import { loadConfig } from './config.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
    private readonly pool = new Pool({
        connectionString: loadConfig(process.env).databaseUrl,
    });

    constructor() {
        this.pool.on('error', () => undefined);
    }

    async isAvailable(): Promise<boolean> {
        try {
            await this.pool.query('SELECT 1');
            return true;
        } catch {
            return false;
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.pool.end();
    }
}
