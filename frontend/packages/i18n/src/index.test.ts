import { describe, expect, it } from 'vitest';

import { createAppI18n } from './index';

describe('createAppI18n', () => {
    it('uses Russian by default', async () => {
        const i18n = await createAppI18n();
        expect(i18n.language).toBe('ru-RU');
        expect(i18n.t('navigation.home')).toBe('Главная');
    });
});
