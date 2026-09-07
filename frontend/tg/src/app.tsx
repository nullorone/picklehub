import { disabledAnalytics } from '@picklehub/analytics';
import type { RuntimeConfig } from '@picklehub/validation';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';

import { useOnlineStatus } from './connectivity';

export function App({ config }: { readonly config: RuntimeConfig }) {
    const { t } = useTranslation();
    const online = useOnlineStatus();
    useEffect(() => {
        disabledAnalytics.track({ name: 'platform.shell_viewed.v1', channel: 'telegram' });
    }, []);
    useEffect(() => {
        disabledAnalytics.track({ name: 'platform.connectivity_changed.v1', channel: 'telegram', online });
    }, [online]);
    return (
        <div className="app-shell" data-environment={config.environment}>
            {!online && (
                <div className="offline-banner" role="status">
                    {t('offline')}
                </div>
            )}
            <header className="app-header">
                <div className="brand" aria-label={t('appName')}>
                    <span className="brand-mark" aria-hidden="true" />
                    <span>{t('appName')}</span>
                </div>
            </header>
            <Routes>
                <Route
                    path="*"
                    element={
                        <main className="shell-main">
                            <section className="hero-card" aria-labelledby="shell-title">
                                <div className="hero-copy">
                                    <p className="eyebrow">{t('navigation.home')}</p>
                                    <h1 id="shell-title">{t('shell.title')}</h1>
                                    <p className="hero-description">{t('shell.description')}</p>
                                </div>
                                <div className="court-graphic" aria-hidden="true" />
                            </section>
                        </main>
                    }
                />
            </Routes>
        </div>
    );
}
