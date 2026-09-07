import type { SchemaErrorEnvelope, SchemaHealthResponse } from './generated/openapi';

export type { components, operations, paths } from './generated/openapi';

export interface ApiClientOptions {
    readonly baseUrl: string;
    readonly fetch?: typeof globalThis.fetch;
    readonly locale?: string;
}

export class ApiError extends Error {
    readonly status: number;
    readonly response: SchemaErrorEnvelope | undefined;

    constructor(status: number, response?: SchemaErrorEnvelope) {
        super(response?.error.message ?? `API request failed with status ${String(status)}`);
        this.name = 'ApiError';
        this.status = status;
        this.response = response;
    }
}

function joinUrl(baseUrl: string, path: string): string {
    return `${baseUrl.replace(/\/$/, '')}${path}`;
}

function isErrorEnvelope(value: unknown): value is SchemaErrorEnvelope {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.requestId === 'string' && typeof candidate.error === 'object' && candidate.error !== null;
}

export function createApiClient(options: ApiClientOptions) {
    const request = options.fetch ?? globalThis.fetch;
    const getHealth = async (path: '/health/live' | '/health/ready'): Promise<SchemaHealthResponse> => {
        const response = await request(joinUrl(options.baseUrl, path), {
            headers: { Accept: 'application/json', 'Accept-Language': options.locale ?? 'ru-RU' },
        });
        const body: unknown = await response.json();
        if (!response.ok) throw new ApiError(response.status, isErrorEnvelope(body) ? body : undefined);
        return body as SchemaHealthResponse;
    };

    return {
        getLiveness: () => getHealth('/health/live'),
        getReadiness: () => getHealth('/health/ready'),
    } as const;
}

export type ApiClient = ReturnType<typeof createApiClient>;
