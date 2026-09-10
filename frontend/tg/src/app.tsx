import { disabledAnalytics } from '@picklehub/analytics';
import { createIdentityClient, type components } from '@picklehub/api-client';
import type { RuntimeConfig } from '@picklehub/validation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Route, Routes } from 'react-router-dom';

import { useOnlineStatus } from './connectivity';
import { TelegramAccount, TelegramLogin, TelegramOnboarding } from './identity-ui';

type Session = components['schemas']['AuthenticatedSession'];

export function App({ config, initData }: { readonly config: RuntimeConfig; readonly initData: string | undefined }) {
    const { t } = useTranslation();
    const online = useOnlineStatus();
    const client = useMemo(() => createIdentityClient({ baseUrl: config.apiBaseUrl }, 'TMA'), [config.apiBaseUrl]);
    const [session, setSession] = useState<Session>();
    useEffect(() => {
        disabledAnalytics.track({ name: 'platform.shell_viewed.v1', channel: 'telegram' });
    }, []);
    useEffect(() => {
        disabledAnalytics.track({ name: 'platform.connectivity_changed.v1', channel: 'telegram', online });
    }, [online]);
    const acceptSession = useCallback((value: Session) => {
        setSession(value);
    }, []);
    const complete = useCallback(() => {
        if (session) setSession({ ...session, user: { ...session.user, onboardingStatus: 'COMPLETED' } });
    }, [session]);
    const signOut = useCallback(() => {
        setSession(undefined);
    }, []);
    const onboarding = session?.user.onboardingStatus !== 'COMPLETED';
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
                {session && !onboarding && <Link to="/account">Аккаунт</Link>}
            </header>
            <Routes>
                <Route
                    path="/login"
                    element={
                        session ? (
                            <Navigate to={onboarding ? '/onboarding' : '/'} replace />
                        ) : (
                            <TelegramLogin
                                client={client}
                                initData={initData}
                                online={online}
                                onSession={acceptSession}
                            />
                        )
                    }
                />
                <Route
                    path="/onboarding"
                    element={
                        session ? (
                            <TelegramOnboarding client={client} online={online} onCompleted={complete} />
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />
                <Route
                    path="/account"
                    element={
                        session && !onboarding ? (
                            <TelegramAccount client={client} initData={initData} onSignedOut={signOut} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/"
                    element={
                        session ? (
                            onboarding ? (
                                <Navigate to="/onboarding" replace />
                            ) : (
                                <main className="shell-main">
                                    <section className="hero-card" aria-labelledby="home-title">
                                        <div className="hero-copy">
                                            <p className="eyebrow">Профиль готов</p>
                                            <h1 id="home-title">Пора найти игру</h1>
                                            <p className="hero-description">Настройка подтверждена сервером.</p>
                                        </div>
                                        <div className="court-graphic" aria-hidden="true" />
                                    </section>
                                </main>
                            )
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    );
}
