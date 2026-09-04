import { createAppI18n } from '@picklehub/i18n';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';

import { App } from './app';
import { loadRuntimeConfig } from './config';
import { ErrorBoundary } from './error-boundary';
import './styles.css';

async function bootstrap(): Promise<void> {
    const [config, i18n] = await Promise.all([loadRuntimeConfig(), createAppI18n()]);
    const queryClient = new QueryClient({ defaultOptions: { mutations: { networkMode: 'online' } } });
    registerSW({ immediate: true });
    const root = document.querySelector('#root');
    if (!root) throw new Error('Application root is missing');
    createRoot(root).render(
        <StrictMode>
            <ErrorBoundary
                title={i18n.t('error.title')}
                description={i18n.t('error.description')}
                retryLabel={i18n.t('error.action')}
            >
                <I18nextProvider i18n={i18n}>
                    <QueryClientProvider client={queryClient}>
                        <BrowserRouter>
                            <App config={config} />
                        </BrowserRouter>
                    </QueryClientProvider>
                </I18nextProvider>
            </ErrorBoundary>
        </StrictMode>
    );
}

void bootstrap();
