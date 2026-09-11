import { disabledAnalytics } from '@picklehub/analytics';
import { createIdentityClient, type components } from '@picklehub/api-client';
import { readSafeMagicFragment, type RuntimeConfig } from '@picklehub/validation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';

import { useOnlineStatus } from './connectivity';
import { ChatScreen, NotificationBadge, NotificationsScreen } from './communications-ui';
import { AccountScreen, EmailLogin, MagicConfirmation, OnboardingScreen } from './identity-ui';
import { CreateMatchScreen, MatchDetailsScreen, MatchesScreen } from './matches-ui';
import { ProfileScreen } from './profiles-ui';
import { MatchFeedbackScreen, SafetyCenterScreen, SafetyReceiptScreen, SafetyReportScreen } from './safety-ui';
import { VenuesScreen } from './venues-ui';

type Session = components['schemas']['AuthenticatedSession'];

function MatchRoute({
    client,
    online,
    userId,
}: {
    readonly client: ReturnType<typeof createIdentityClient>;
    readonly online: boolean;
    readonly userId?: string | undefined;
}) {
    const { inviteToken, matchId } = useParams();
    return (
        <MatchDetailsScreen
            client={client}
            channel="web"
            inviteToken={inviteToken}
            matchId={matchId}
            online={online}
            userId={userId}
        />
    );
}

function ChatRoute({
    client,
    online,
    userId,
    onAuthenticationExpired,
}: {
    readonly client: ReturnType<typeof createIdentityClient>;
    readonly online: boolean;
    readonly userId: string;
    readonly onAuthenticationExpired: () => void;
}) {
    const { matchId = '' } = useParams();
    return (
        <ChatScreen
            channel="web"
            client={client}
            matchId={matchId}
            online={online}
            userId={userId}
            onAuthenticationExpired={onAuthenticationExpired}
        />
    );
}

function PublicProfileRoute({
    client,
    online,
}: {
    readonly client: ReturnType<typeof createIdentityClient>;
    readonly online: boolean;
}) {
    const { playerId } = useParams();
    return <ProfileScreen client={client} online={online} ownership="OTHER" playerId={playerId} />;
}

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
                        <Link to="/matches">Матчи</Link>
                        <Link to="/venues">Площадки</Link>
                        <Link to="/notifications">
                            Уведомления
                            <NotificationBadge client={client} />
                        </Link>
                        <Link to="/profile">Профиль</Link>
                        <Link to="/safety">Безопасность</Link>
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
                    path="/matches"
                    element={
                        <MatchesScreen
                            client={client}
                            config={config}
                            online={online}
                            signedIn={Boolean(session && !requiresOnboarding)}
                        />
                    }
                />
                <Route
                    path="/matches/new"
                    element={
                        session && !requiresOnboarding ? (
                            <CreateMatchScreen client={client} online={online} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/matches/:matchId"
                    element={<MatchRoute client={client} online={online} userId={session?.user.id} />}
                />
                <Route
                    path="/matches/:matchId/chat"
                    element={
                        session && !requiresOnboarding ? (
                            <ChatRoute
                                client={client}
                                online={online}
                                userId={session.user.id}
                                onAuthenticationExpired={signedOut}
                            />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/match-invites/:inviteToken"
                    element={<MatchRoute client={client} online={online} userId={session?.user.id} />}
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
                    path="/notifications"
                    element={
                        session && !requiresOnboarding ? (
                            <NotificationsScreen client={client} online={online} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/profile"
                    element={
                        session && !requiresOnboarding ? (
                            <ProfileScreen client={client} online={online} ownership="SELF" />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route path="/players/:playerId" element={<PublicProfileRoute client={client} online={online} />} />
                <Route
                    path="/matches/:matchId/feedback/:subjectPlayerId"
                    element={
                        session && !requiresOnboarding ? (
                            <MatchFeedbackScreen client={client} online={online} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/safety"
                    element={
                        session && !requiresOnboarding ? (
                            <SafetyCenterScreen client={client} online={online} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/safety/report"
                    element={
                        session && !requiresOnboarding ? (
                            <SafetyReportScreen client={client} online={online} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/safety/reports/:receiptId"
                    element={
                        session && !requiresOnboarding ? (
                            <SafetyReceiptScreen client={client} online={online} />
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
                                    <Link className="primary-action" to="/matches">
                                        Найти матч
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
