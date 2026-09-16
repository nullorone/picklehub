import { disabledAnalytics } from '@picklehub/analytics';
import { createIdentityClient, type components } from '@picklehub/api-client';
import { readSafeMagicFragment, type RuntimeConfig } from '@picklehub/validation';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';

import { useOnlineStatus } from './connectivity';
import { AdvertisingSlot } from './advertising-ui';
import { AdminApp } from './admin-ui';
import { ArticleScreen, BookmarksScreen, NewsFeed } from './content-ui';
import { ChatScreen, NotificationBadge, NotificationsScreen } from './communications-ui';
import { ClubDetailsScreen, ClubInvitationScreen, ClubsScreen } from './clubs-ui';
import { ClubGamificationSettings, ClubProgressRoute, LeaderboardScreen, ProgressScreen } from './gamification-ui';
import { AccountScreen, EmailLogin, MagicConfirmation, OnboardingScreen } from './identity-ui';
import { CreateMatchScreen, MatchDetailsScreen, MatchesScreen } from './matches-ui';
import { ProfileScreen } from './profiles-ui';
import { MatchFeedbackScreen, SafetyCenterScreen, SafetyReceiptScreen, SafetyReportScreen } from './safety-ui';
import { TournamentDetailsScreen, TournamentsScreen } from './tournaments-ui';
import { VenuesScreen } from './venues-ui';

const MiniGameRoute = lazy(async () => {
    const module = await import('./mini-game-ui');
    return { default: module.MiniGameRoute };
});

type Session = components['schemas']['AuthenticatedSession'];

function isPublicAdvertisingPath(pathname: string): boolean {
    return ['/clubs', '/match-invites', '/matches', '/news', '/players', '/tournaments'].some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );
}

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
    const routeLocation = useLocation();
    const online = useOnlineStatus();
    const client = useMemo(() => createIdentityClient({ baseUrl: config.apiBaseUrl }, 'WEB'), [config.apiBaseUrl]);
    const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');
    const [session, setSession] = useState<Session>();
    const [magic] = useState(() => {
        const value = readSafeMagicFragment(window.location.hash);
        if (window.location.hash) {
            history.replaceState(history.state, '', window.location.pathname + window.location.search);
        }
        return value;
    });

    useEffect(() => {
        if (isAdminRoute) return;
        disabledAnalytics.track({ name: 'platform.shell_viewed.v1', channel: 'web' });
    }, [isAdminRoute]);
    useEffect(() => {
        if (isAdminRoute) return;
        disabledAnalytics.track({ name: 'platform.connectivity_changed.v1', channel: 'web', online });
    }, [isAdminRoute, online]);
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
    const requestedNext = new URLSearchParams(routeLocation.search).get('next');
    const nextAfterLogin = requestedNext?.startsWith('/club-invitations/') ? requestedNext : '/';

    if (isAdminRoute) return <AdminApp config={config} online={online} />;

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
                <nav aria-label="Открытые разделы">
                    <Link to="/news">Новости</Link>
                </nav>
                {session?.user.onboardingStatus === 'COMPLETED' && (
                    <nav aria-label="Личный кабинет">
                        <Link to="/matches">Матчи</Link>
                        <Link to="/venues">Площадки</Link>
                        <Link to="/clubs">Клубы</Link>
                        <Link to="/tournaments">Турниры</Link>
                        <Link to="/progress">Прогресс</Link>
                        <Link to="/mini-game">Мини-игра</Link>
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
                <Route path="/news" element={<NewsFeed client={client} online={online} />} />
                <Route
                    path="/news/bookmarks"
                    element={
                        session && !requiresOnboarding ? (
                            <BookmarksScreen client={client} online={online} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/news/:locale/:slug"
                    element={
                        <ArticleScreen
                            client={client}
                            online={online}
                            signedIn={Boolean(session && !requiresOnboarding)}
                        />
                    }
                />
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
                            <Navigate to={requiresOnboarding ? '/onboarding' : nextAfterLogin} replace />
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
                    path="/clubs"
                    element={
                        <ClubsScreen
                            channel="web"
                            client={client}
                            online={online}
                            signedIn={Boolean(session && !requiresOnboarding)}
                        />
                    }
                />
                <Route
                    path="/clubs/:clubId"
                    element={
                        <ClubDetailsScreen
                            client={client}
                            online={online}
                            signedIn={Boolean(session && !requiresOnboarding)}
                            userId={session?.user.id}
                        />
                    }
                />
                <Route
                    path="/clubs/:clubId/progress"
                    element={
                        session && !requiresOnboarding ? (
                            <ClubProgressRoute client={client} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/clubs/:clubId/progress/settings"
                    element={
                        session && !requiresOnboarding ? (
                            <ClubGamificationSettings client={client} online={online} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/progress"
                    element={
                        session && !requiresOnboarding ? (
                            <ProgressScreen client={client} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/progress/seasons/:seasonId"
                    element={
                        session && !requiresOnboarding ? (
                            <LeaderboardScreen client={client} online={online} />
                        ) : (
                            <Navigate to={session ? '/onboarding' : '/login'} replace />
                        )
                    }
                />
                <Route
                    path="/tournaments"
                    element={
                        <TournamentsScreen
                            client={client}
                            online={online}
                            signedIn={Boolean(session && !requiresOnboarding)}
                        />
                    }
                />
                <Route
                    path="/tournaments/:tournamentId"
                    element={
                        <TournamentDetailsScreen
                            client={client}
                            online={online}
                            signedIn={Boolean(session && !requiresOnboarding)}
                            userId={session?.user.id}
                        />
                    }
                />
                <Route
                    path="/club-invitations/:invitationToken"
                    element={
                        session && !requiresOnboarding ? (
                            <ClubInvitationScreen client={client} online={online} />
                        ) : (
                            <Navigate
                                to={
                                    session
                                        ? '/onboarding'
                                        : `/login?next=${encodeURIComponent(routeLocation.pathname)}`
                                }
                                replace
                            />
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
                    path="/mini-game"
                    element={
                        session && !requiresOnboarding ? (
                            <Suspense
                                fallback={
                                    <main className="state-card" aria-busy="true">
                                        Загружаем игру…
                                    </main>
                                }
                            >
                                <MiniGameRoute client={client} online={online} />
                            </Suspense>
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
            <AdvertisingSlot
                key={routeLocation.pathname}
                client={client}
                clientKind="WEB"
                online={
                    online &&
                    (Boolean(session && !requiresOnboarding) || isPublicAdvertisingPath(routeLocation.pathname))
                }
                pathname={routeLocation.pathname}
            />
        </div>
    );
}
