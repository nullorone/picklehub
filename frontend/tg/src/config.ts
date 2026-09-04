import { parseRuntimeConfig, type RuntimeConfig } from '@picklehub/validation';

const developmentConfig: RuntimeConfig = { apiBaseUrl: '/v1', environment: 'development' };

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
    if (import.meta.env.DEV) return developmentConfig;
    const response = await fetch('/runtime-config.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Runtime configuration is unavailable');
    return parseRuntimeConfig(await response.json());
}
