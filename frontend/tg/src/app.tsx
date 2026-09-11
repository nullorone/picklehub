import { disabledAnalytics } from '@picklehub/analytics';
import { createIdentityClient, type components } from '@picklehub/api-client';
import type { RuntimeConfig } from '@picklehub/validation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';

import { useOnlineStatus } from './connectivity';
import { ChatScreen, NotificationBadge, NotificationsScreen } from './communications-ui';
import { TelegramAccount, TelegramLogin, TelegramOnboarding } from './identity-ui';
import { CreateMatchScreen, MatchDetailsScreen, MatchesScreen } from './matches-ui';
import { ProfileScreen } from './profiles-ui';
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
            channel="telegram"
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
            channel="telegram"
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
                {session && !onboarding && (
                    <nav aria-label="Личный кабинет">
                        <Link to="/matches">Матчи</Link>
                        <Link to="/venues">Площадки</Link>
                        <Link to="/notifications">
                            Уведомления
                            <NotificationBadge client={client} />
                        </Link>
                        <Link to="/profile">Профиль</Link>
                        <Link to="/account">Аккаунт</Link>
                    </nav>
                )}
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
                    path="/matches"
                    element={
                        <MatchesScreen
                            client={client}
                            config={config}
                            online={online}
                            signedIn={Boolean(session && !onboarding)}
                        />
                    }
                />
                <Route
                    path="/matches/new"
                    element={
                        session && !onboarding ? (
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
                        session && !onboarding ? (
                            <ChatRoute
                                client={client}
                                online={online}
                                userId={session.user.id}
                                onAuthenticationExpired={signOut}
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
                        session && !onboarding ? (
                            <VenuesScreen client={client} config={config} online={online} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/notifications"
                    element={
                        session && !onboarding ? (
                            <NotificationsScreen client={client} online={online} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/profile"
                    element={
                        session && !onboarding ? (
                            <ProfileScreen client={client} online={online} ownership="SELF" />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route path="/players/:playerId" element={<PublicProfileRoute client={client} online={online} />} />
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
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </div>
    );
}
