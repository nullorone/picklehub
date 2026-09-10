import { disabledAnalytics } from '@picklehub/analytics';
import { createIdentityClient, type components } from '@picklehub/api-client';
import { readSafeMagicFragment, type RuntimeConfig } from '@picklehub/validation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Route, Routes } from 'react-router-dom';

import { useOnlineStatus } from './connectivity';
import { AccountScreen, EmailLogin, MagicConfirmation, OnboardingScreen } from './identity-ui';
import { VenuesScreen } from './venues-ui';

type Session = components['schemas']['AuthenticatedSession'];

export function App({ config }: { readonly config: RuntimeConfig }) {
    const { t } = useTranslation();
    const online = useOnlineStatus();
    const client = useMemo(() => createIdentityClient({ baseUrl: config.apiBaseUrl }, 'WEB'), [config.apiBaseUrl]);
    const [session, setSession] = useState<Session>();
    const [magic] = useState(() => {
        const value = readSafeMagicFragment(window.location.hash);
        if (window.location.hash) {
            history.replaceState(history.state, '', window.location.pathname + window.location.search);
        }
        return value;
    });

    useEffect(() => {
        disabledAnalytics.track({ name: 'platform.shell_viewed.v1', channel: 'web' });
    }, []);
    useEffect(() => {
        disabledAnalytics.track({ name: 'platform.connectivity_changed.v1', channel: 'web', online });
    }, [online]);
    const acceptSession = useCallback((value: Session) => {
        setSession(value);
    }, []);
    const completed = useCallback(() => {
        if (session) setSession({ ...session, user: { ...session.user, onboardingStatus: 'COMPLETED' } });
    }, [session]);
    const signedOut = useCallback(() => {
        setSession(undefined);
    }, []);
    const requiresOnboarding = session?.user.onboardingStatus !== 'COMPLETED';

    return (
        <div className="app-shell" data-environment={config.environment}>
            {!online && (
                <div className="offline-banner" role="status">
                    {t('offline')}
                </div>
            )}
            <header className="app-header">
                <Link className="brand" to={session ? '/' : '/login'} aria-label={t('appName')}>
                    <span className="brand-mark" aria-hidden="true" />
                    <span>{t('appName')}</span>
                </Link>
                {session?.user.onboardingStatus === 'COMPLETED' && (
                    <nav aria-label="Личный кабинет">
                        <Link to="/venues">Площадки</Link>
                        <Link to="/account">Аккаунт</Link>
                    </nav>
                )}
            </header>
            <Routes>
                <Route
                    path="/auth/email"
                    element={
                        <MagicConfirmation
                            client={client}
                            online={online}
                            attemptId={magic.attemptId}
                            identityId={magic.identityId}
                            token={magic.token}
                            target={magic.target}
                            onSession={acceptSession}
                        />
                    }
                />
                <Route
                    path="/login"
                    element={
                        session ? (
                            <Navigate to={requiresOnboarding ? '/onboarding' : '/'} replace />
                        ) : (
                            <EmailLogin client={client} online={online} onSession={acceptSession} />
                        )
                    }
                />
                <Route
                    path="/onboarding"
                    element={
                        session ? (
                            <OnboardingScreen client={client} online={online} onCompleted={completed} />
                        ) : (
                            <Navigate to="/login" replace />
                        )
                    }
                />
                <Route
                    path="/venues"
                    element={
                        session && !requiresOnboarding ? (
                            <VenuesScreen client={client} config={config} online={online} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/account"
                    element={
                        session && !requiresOnboarding ? (
                            <AccountScreen client={client} onSignedOut={signedOut} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/"
                    element={
                        session ? (
                            requiresOnboarding ? (
                                <Navigate to="/onboarding" replace />
                            ) : (
                                <main className="shell-main">
                                    <section className="hero-card" aria-labelledby="home-title">
                                        <div className="hero-copy">
                                            <p className="eyebrow">Профиль готов</p>
                                            <h1 id="home-title">Пора найти игру</h1>
                                            <p className="hero-description">
                                                Первичная настройка завершена и подтверждена сервером.
                                            </p>
                                        </div>
                                        <div className="court-graphic" aria-hidden="true" />
                                    </section>
                                    <Link className="primary-action" to="/venues">
                                        Найти площадку
                                    </Link>
                                </main>
                            )
                        ) : (
                            <Navigate to="/login" replace />
                        )
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
