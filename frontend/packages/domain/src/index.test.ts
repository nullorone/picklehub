import { describe, expect, it } from 'vitest';

import { clientChannels, supportedLocales } from './index';

describe('foundation domain values', () => {
    it('keeps client channels and the initial locale explicit', () => {
        expect(clientChannels).toEqual(['web', 'telegram']);
        expect(supportedLocales).toEqual(['ru-RU']);
    });
});
