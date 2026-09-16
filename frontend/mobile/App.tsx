import NetInfo from '@react-native-community/netinfo';
import { createNavigationContainerRef, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { components } from '@picklehub/api-client';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { createMobileApiClient } from './src/api/mobile-client';
import { AppContext } from './src/app-context';
import { createReadCache } from './src/cache/read-cache';
import { runtimeConfig } from './src/config';
import { resolvePushPayload, resolveUniversalLink, type ResolvedLink } from './src/navigation/deep-links';
import { purgeAccountLocalState } from './src/security/local-state';
import { secureSessionStore } from './src/security/secure-session';
import { AuthScreen } from './src/screens/auth-screen';
import { ChatScreen, CreateMatchScreen, MatchDetailScreen, VenueDetailScreen } from './src/screens/detail-screens';
import { MainTabs, type RootParams } from './src/screens/main-tabs';
import { OnboardingScreen } from './src/screens/onboarding-screen';
import { AccountScreen, PlayerScreen, SafetyReceiptScreen, SafetyScreen } from './src/screens/profile-screens';
import { Loading, Status } from './src/ui/components';

type Destination = components['schemas']['MobileDeepLinkTarget'];
type NativeSession = components['schemas']['NativeAuthenticatedSession'];
type Phase = 'BOOT' | 'AUTH' | 'ONBOARDING' | 'MAIN';

const Stack = createNativeStackNavigator<RootParams>();
const navigationRef = createNavigationContainerRef<RootParams>();
const cache = createReadCache(secureSessionStore);
const api = createMobileApiClient({ baseUrl: runtimeConfig.apiUrl, secureStore: secureSessionStore });

Notifications.setNotificationHandler({
    handleNotification: () =>
        Promise.resolve({
            shouldPlaySound: false,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true,
        }),
});

function destinationNavigation(destination: Destination): void {
    if (!navigationRef.isReady()) return;
    if (destination.kind === 'MATCH') navigationRef.navigate('MatchDetail', { matchId: destination.matchId });
    else if (destination.kind === 'MATCH_CHAT') navigationRef.navigate('Chat', { matchId: destination.matchId });
    else if (destination.kind === 'VENUE') navigationRef.navigate('VenueDetail', { venueId: destination.venueId });
    else if (destination.kind === 'PLAYER') navigationRef.navigate('Player', { playerId: destination.playerId });
    else if (destination.kind === 'ACCOUNT') navigationRef.navigate('Account');
    else if (destination.kind === 'SAFETY') navigationRef.navigate('Safety');
    else if (destination.kind === 'SAFETY_RECEIPT')
        navigationRef.navigate('SafetyReceipt', { receiptId: destination.receiptId });
    else {
        const screen =
            destination.kind === 'MATCHES'
                ? 'Matches'
                : destination.kind === 'VENUES'
                  ? 'Venues'
                  : destination.kind === 'NOTIFICATIONS'
                    ? 'Notifications'
                    : 'Profile';
        navigationRef.navigate('Main', { screen });
    }
}

export default function App() {
    const [phase, setPhase] = useState<Phase>('BOOT');
    const [userId, setUserId] = useState('');
    const [online, setOnline] = useState(true);
    const [magicToken, setMagicToken] = useState<string>();
    const [unsupportedLink, setUnsupportedLink] = useState(false);
    const pendingDestination = useRef<Destination | undefined>(undefined);
    const pendingInvite = useRef<string | undefined>(undefined);

    const acceptSession = useCallback((session: NativeSession) => {
        setMagicToken(undefined);
        setUserId(session.user.id);
        if (session.destination !== null) pendingDestination.current = session.destination;
        setPhase(session.user.onboardingStatus === 'COMPLETED' ? 'MAIN' : 'ONBOARDING');
    }, []);

    const logout = useCallback(async () => {
        const currentUserId = api.getUserId() ?? userId;
        if (currentUserId !== '') await cache.clearPartition(currentUserId);
        await purgeAccountLocalState();
        await api.logout();
        pendingDestination.current = undefined;
        pendingInvite.current = undefined;
        setUserId('');
        setPhase('AUTH');
    }, [userId]);

    const handleResolvedLink = useCallback(
        async (resolved: ResolvedLink) => {
            setUnsupportedLink(false);
            if (resolved.kind === 'UNSUPPORTED') {
                setUnsupportedLink(true);
                return;
            }
            if (resolved.kind === 'MAGIC_LINK') {
                if (phase !== 'AUTH' && phase !== 'BOOT') await logout();
                setMagicToken(resolved.token);
                setPhase('AUTH');
                return;
            }
            if (resolved.kind === 'MATCH_INVITE') {
                pendingInvite.current = resolved.token;
                if (phase === 'MAIN') {
                    const invite = await api
                        .publicCall<components['schemas']['Match']>(`/match-invites/${resolved.token}`)
                        .catch(() => null);
                    pendingInvite.current = undefined;
                    if (invite !== null) destinationNavigation({ kind: 'MATCH', matchId: invite.id });
                }
                return;
            }
            if (resolved.kind === 'NOTIFICATION') {
                if (phase !== 'MAIN') {
                    pendingDestination.current = { kind: 'NOTIFICATIONS' };
                    return;
                }
                const page = await api
                    .authenticatedCall<components['schemas']['NotificationPage']>('/notifications?limit=50')
                    .catch(() => null);
                const target = page?.items.find((item) => item.id === resolved.notificationId)?.mobileTarget;
                destinationNavigation(target ?? { kind: 'NOTIFICATIONS' });
                return;
            }
            if (phase === 'MAIN') destinationNavigation(resolved.destination);
            else pendingDestination.current = resolved.destination;
        },
        [logout, phase]
    );

    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener((state) => {
            setOnline(state.isConnected === true);
        });
        return unsubscribe;
    }, []);

    useEffect(() => {
        void api
            .bootstrap()
            .then(acceptSession)
            .catch(() => {
                setPhase('AUTH');
            });
    }, [acceptSession]);

    useEffect(() => {
        const receive = (url: string) =>
            void handleResolvedLink(resolveUniversalLink(url, runtimeConfig.linkHost, runtimeConfig.developmentScheme));
        void Linking.getInitialURL().then((url) => {
            if (url !== null) receive(url);
        });
        const subscription = Linking.addEventListener('url', (event) => {
            receive(event.url);
        });
        return () => {
            subscription.remove();
        };
    }, [handleResolvedLink]);

    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
            void handleResolvedLink(resolvePushPayload(response.notification.request.content.data));
        });
        return () => {
            subscription.remove();
        };
    }, [handleResolvedLink]);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', (state) => {
            if (state === 'active' && phase === 'MAIN') {
                void api
                    .bootstrap()
                    .then((session) => {
                        setUserId(session.user.id);
                    })
                    .catch(() => void logout());
            }
        });
        return () => {
            subscription.remove();
        };
    }, [logout, phase]);

    useEffect(() => {
        if (phase !== 'MAIN' || !navigationRef.isReady()) return;
        const destination = pendingDestination.current;
        if (destination !== undefined) {
            pendingDestination.current = undefined;
            setTimeout(() => {
                destinationNavigation(destination);
            }, 0);
        }
        const inviteToken = pendingInvite.current;
        if (inviteToken !== undefined) {
            pendingInvite.current = undefined;
            void api
                .publicCall<components['schemas']['Match']>(`/match-invites/${inviteToken}`)
                .then((match) => {
                    destinationNavigation({ kind: 'MATCH', matchId: match.id });
                })
                .catch(() => {
                    setUnsupportedLink(true);
                });
        }
    }, [phase]);

    const services = useMemo(() => ({ api, cache, onLogout: logout, online, userId }), [logout, online, userId]);
    return (
        <SafeAreaProvider>
            <StatusBar style="auto" />
            {unsupportedLink ? (
                <View style={{ padding: 12 }}>
                    <Status kind="error">Эта ссылка не поддерживается или больше недействительна.</Status>
                </View>
            ) : null}
            {phase === 'BOOT' ? <Loading /> : null}
            {phase === 'AUTH' ? (
                <AuthScreen
                    api={api}
                    {...(magicToken === undefined ? {} : { magicToken })}
                    onAuthenticated={acceptSession}
                    secureStore={secureSessionStore}
                />
            ) : null}
            {phase === 'ONBOARDING' ? (
                <OnboardingScreen
                    api={api}
                    onComplete={() => {
                        setPhase('MAIN');
                    }}
                />
            ) : null}
            {phase === 'MAIN' ? (
                <AppContext.Provider value={services}>
                    <NavigationContainer ref={navigationRef}>
                        <Stack.Navigator screenOptions={{ headerBackTitle: 'Назад', headerTintColor: '#12634f' }}>
                            <Stack.Screen component={MainTabs} name="Main" options={{ headerShown: false }} />
                            <Stack.Screen
                                component={MatchDetailScreen}
                                name="MatchDetail"
                                options={{ title: 'Матч' }}
                            />
                            <Stack.Screen
                                component={VenueDetailScreen}
                                name="VenueDetail"
                                options={{ title: 'Площадка' }}
                            />
                            <Stack.Screen component={ChatScreen} name="Chat" options={{ title: 'Чат' }} />
                            <Stack.Screen
                                component={CreateMatchScreen}
                                name="CreateMatch"
                                options={{ title: 'Новый матч' }}
                            />
                            <Stack.Screen
                                component={PlayerScreen}
                                name="Player"
                                options={{ title: 'Профиль игрока' }}
                            />
                            <Stack.Screen component={SafetyScreen} name="Safety" options={{ title: 'Безопасность' }} />
                            <Stack.Screen
                                component={SafetyReceiptScreen}
                                name="SafetyReceipt"
                                options={{ title: 'Обращение' }}
                            />
                            <Stack.Screen component={AccountScreen} name="Account" options={{ title: 'Аккаунт' }} />
                        </Stack.Navigator>
                    </NavigationContainer>
                </AppContext.Provider>
            ) : null}
        </SafeAreaProvider>
    );
}
