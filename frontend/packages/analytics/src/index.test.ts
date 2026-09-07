import { describe, expect, it } from 'vitest';

import { disabledAnalytics } from './index';

describe('disabledAnalytics', () => {
    it('accepts safe foundation events without a provider', () => {
        expect(() => {
            disabledAnalytics.track({ name: 'platform.shell_viewed.v1', channel: 'web' });
        }).not.toThrow();
    });
});
