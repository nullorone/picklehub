// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { createAppI18n } from '@picklehub/i18n';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './app';

describe('Telegram shell', () => {
    afterEach(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    });

    it('renders without business features', async () => {
        const i18n = await createAppI18n();
        render(
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <App config={{ apiBaseUrl: '/v1', environment: 'test' }} />
                </MemoryRouter>
            </I18nextProvider>
        );
        expect(screen.getByRole('heading', { name: 'Основа приложения готова' })).toBeInTheDocument();
        expect(screen.getByLabelText('PickleHub')).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Основа приложения готова' })).toBeInTheDocument();
        expect(screen.queryByText(/турнир/i)).not.toBeInTheDocument();
    });

    it('announces offline mode', async () => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
        const i18n = await createAppI18n();
        render(
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <App config={{ apiBaseUrl: '/v1', environment: 'test' }} />
                </MemoryRouter>
            </I18nextProvider>
        );
        expect(screen.getByRole('status')).toHaveTextContent('Нет подключения к интернету');
    });
});
