import { disabledAnalytics } from '@picklehub/analytics';
import type { RuntimeConfig } from '@picklehub/validation';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Route, Routes } from 'react-router-dom';

import { useOnlineStatus } from './connectivity';

export function App({ config }: { readonly config: RuntimeConfig }) {
    const { t } = useTranslation();
    const online = useOnlineStatus();
    useEffect(() => {
        disabledAnalytics.track({ name: 'platform.shell_viewed.v1', channel: 'web' });
    }, []);
    useEffect(() => {
        disabledAnalytics.track({ name: 'platform.connectivity_changed.v1', channel: 'web', online });
    }, [online]);

    return (
        <div className="app-shell" data-environment={config.environment}>
            {!online && (
                <div className="offline-banner" role="status">
                    {t('offline')}
                </div>
            )}
            <header className="app-header">
                <Link className="brand" to="/" aria-label={t('appName')}>
                    <span className="brand-mark" aria-hidden="true" />
                    <span>{t('appName')}</span>
                </Link>
            </header>
            <Routes>
                <Route
                    path="/"
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
                <Route
                    path="*"
                    element={
                        <main className="state-card centered">
                            <h1>404</h1>
                            <Link className="primary-action" to="/">
                                {t('navigation.home')}
                            </Link>
                        </main>
                    }
                />
            </Routes>
        </div>
    );
}
