import { describe, expect, it } from 'vitest';

import { parseRuntimeConfig } from './index';

describe('parseRuntimeConfig', () => {
    it('accepts a root-relative API URL', () => {
        expect(parseRuntimeConfig({ apiBaseUrl: '/v1', environment: 'production' })).toEqual({
            apiBaseUrl: '/v1',
            environment: 'production',
        });
    });

    it('rejects unknown configuration keys', () => {
        expect(() => parseRuntimeConfig({ apiBaseUrl: '/v1', environment: 'production', token: 'secret' })).toThrow();
    });
});
