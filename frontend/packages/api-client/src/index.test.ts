import { describe, expect, it, vi } from 'vitest';

import { createApiClient } from './index';

describe('createApiClient', () => {
    it('uses the generated health route and Russian locale', async () => {
        const body = { checkedAt: '2026-09-04T00:00:00.000Z', requestId: crypto.randomUUID(), status: 'ok' };
        const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(body));
        const client = createApiClient({ baseUrl: '/v1/', fetch });

        await expect(client.getLiveness()).resolves.toEqual(body);
        expect(fetch).toHaveBeenCalledWith('/v1/health/live', {
            headers: { Accept: 'application/json', 'Accept-Language': 'ru-RU' },
        });
    });
});
