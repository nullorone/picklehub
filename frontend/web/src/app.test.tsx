// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { createAppI18n } from '@picklehub/i18n';
import { render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from './app';

describe('web shell', () => {
    afterEach(() => {
        Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    });

    it('renders the Russian accessible shell', async () => {
        const i18n = await createAppI18n();
        render(
            <I18nextProvider i18n={i18n}>
                <MemoryRouter>
                    <App config={{ apiBaseUrl: '/v1', environment: 'test' }} />
                </MemoryRouter>
            </I18nextProvider>
        );
        expect(screen.getByRole('heading', { name: 'Основа приложения готова' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'PickleHub' })).toHaveAttribute('href', '/');
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

    it('offers an accessible route back from an unknown page', async () => {
        const i18n = await createAppI18n();
        render(
            <I18nextProvider i18n={i18n}>
                <MemoryRouter initialEntries={['/missing']}>
                    <App config={{ apiBaseUrl: '/v1', environment: 'test' }} />
                </MemoryRouter>
            </I18nextProvider>
        );
        expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Главная' })).toHaveAttribute('href', '/');
    });
});
