import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { components } from '@picklehub/api-client';
import * as Location from 'expo-location';
import { useCallback, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { useAppServices } from '../app-context';
import { useCachedResource } from '../hooks/use-cached-resource';
import { uuidV4 } from '../platform/uuid';
import { Button, Card, Field, Loading, Screen, Status } from '../ui/components';
import { textStyles } from '../ui/styles';

type Schemas = components['schemas'];
interface TabParamSpec {
    Matches: undefined;
    Notifications: undefined;
    Profile: undefined;
    Venues: undefined;
}
interface RootParamSpec {
    Account: undefined;
    Chat: { readonly matchId: string };
    CreateMatch: undefined;
    Main: NavigatorScreenParams<TabParams> | undefined;
    MatchDetail: { readonly matchId: string };
    MiniGame: undefined;
    Player: { readonly playerId: string };
    Safety: undefined;
    SafetyReceipt: { readonly receiptId: string };
    VenueDetail: { readonly venueId: string };
}
type ParamList<Spec> = { [Route in keyof Spec]: Spec[Route] };
export type TabParams = ParamList<TabParamSpec>;
export type RootParams = ParamList<RootParamSpec>;

const Tabs = createBottomTabNavigator<TabParams>();
type TabProps<Route extends keyof TabParams> = CompositeScreenProps<
    BottomTabScreenProps<TabParams, Route>,
    NativeStackScreenProps<RootParams>
>;

const notificationLabels: Readonly<Record<Schemas['NotificationType'], string>> = {
    CHAT_MESSAGE: 'Новое сообщение',
    JOIN_REQUESTED: 'Новая заявка',
    JOIN_REQUEST_RESOLVED: 'Решение по заявке',
    MATCH_CANCELLED: 'Матч отменён',
    MATCH_CHANGED: 'Матч изменён',
    MATCH_REMINDER: 'Напоминание о матче',
    RESULT_ACTION_REQUIRED: 'Нужно проверить результат',
    RESULT_CONFIRMED: 'Результат подтверждён',
    RESULT_DISPUTED: 'Результат оспорен',
    ROSTER_CHANGED: 'Состав изменён',
    WAITLIST_CHANGED: 'Очередь изменилась',
};

function MatchesScreen({ navigation }: TabProps<'Matches'>) {
    const { api } = useAppServices();
    const [query, setQuery] = useState('');
    const load = useCallback(
        () => api.authenticatedCall<Schemas['MatchPage']>(`/matches?limit=30&query=${encodeURIComponent(query)}`),
        [api, query]
    );
    const state = useCachedResource('MATCHES', 'USER_READ', load);
    return (
        <Screen title="Матчи">
            <Field label="Поиск матчей" onChangeText={setQuery} value={query} />
            <Button
                label="Создать матч"
                onPress={() => {
                    navigation.navigate('CreateMatch');
                }}
            />
            {state.staleAt === undefined ? null : (
                <Status kind="stale">Сохранённые данные от {new Date(state.staleAt).toLocaleString('ru-RU')}</Status>
            )}
            {state.loading ? <Loading /> : null}
            {state.error === undefined ? null : <Status kind="error">{state.error}</Status>}
            {state.value?.items.length === 0 ? (
                <Status>Подходящих матчей пока нет. Измените фильтры или создайте свой.</Status>
            ) : null}
            {state.value?.items.map((match) => (
                <Card
                    key={match.id}
                    onPress={() => {
                        navigation.navigate('MatchDetail', { matchId: match.id });
                    }}
                >
                    <Text style={textStyles.heading}>
                        {match.format === 'DOUBLES' ? 'Парный матч' : 'Одиночный матч'}
                    </Text>
                    <Text style={textStyles.body}>
                        {new Date(match.startsAt).toLocaleString('ru-RU', { timeZone: match.timeZone })}
                    </Text>
                    <Text style={textStyles.muted}>
                        Статус: {match.state} · участников:{' '}
                        {match.teams.reduce((sum, team) => sum + team.occupiedPlaces, 0)}
                    </Text>
                </Card>
            ))}
        </Screen>
    );
}

function VenuesScreen({ navigation }: TabProps<'Venues'>) {
    const { api } = useAppServices();
    const [mode, setMode] = useState<'LIST' | 'MAP'>('LIST');
    const [query, setQuery] = useState('');
    const [location, setLocation] = useState<{ readonly latitude: number; readonly longitude: number }>();
    const [locationNotice, setLocationNotice] = useState<string>();
    const load = useCallback(() => {
        const coordinates =
            location === undefined
                ? ''
                : `&latitude=${String(location.latitude)}&longitude=${String(location.longitude)}`;
        return api.publicCall<Schemas['VenuePage']>(
            `/venues?limit=30&query=${encodeURIComponent(query)}${coordinates}`
        );
    }, [api, location, query]);
    const state = useCachedResource('VENUES', 'PUBLIC_READ', load);

    const nearby = async () => {
        setLocationNotice('Геопозиция используется один раз и не сохраняется. Можно продолжить без неё.');
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
            setLocationNotice('Доступ не выдан. Используйте поиск или перемещайте карту вручную.');
            return;
        }
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ latitude: current.coords.latitude, longitude: current.coords.longitude });
    };

    return (
        <Screen title="Площадки">
            <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button
                    label="Список"
                    onPress={() => {
                        setMode('LIST');
                    }}
                    secondary={mode !== 'LIST'}
                />
                <Button
                    label="Карта"
                    onPress={() => {
                        setMode('MAP');
                    }}
                    secondary={mode !== 'MAP'}
                />
            </View>
            <Field label="Название или район" onChangeText={setQuery} value={query} />
            <Button label="Рядом со мной" onPress={() => void nearby()} secondary />
            {locationNotice === undefined ? null : <Status>{locationNotice}</Status>}
            {state.staleAt === undefined ? null : (
                <Status kind="stale">Офлайн-копия от {new Date(state.staleAt).toLocaleString('ru-RU')}</Status>
            )}
            {state.loading ? <Loading /> : null}
            {mode === 'MAP' && (state.value?.items.length ?? 0) > 0 ? (
                <View>
                    <MapView
                        accessibilityLabel="Карта площадок. Все площадки доступны также списком."
                        initialRegion={{
                            latitude: state.value?.items[0]?.location.latitude ?? 55.75,
                            latitudeDelta: 0.2,
                            longitude: state.value?.items[0]?.location.longitude ?? 37.62,
                            longitudeDelta: 0.2,
                        }}
                        style={{ height: 360, width: '100%' }}
                    >
                        {state.value?.items.map((venue) => (
                            <Marker
                                coordinate={venue.location}
                                key={venue.id}
                                onPress={() => {
                                    navigation.navigate('VenueDetail', { venueId: venue.id });
                                }}
                                title={venue.name}
                            />
                        ))}
                    </MapView>
                    <Text style={textStyles.muted}>
                        © OpenStreetMap contributors. Условия тайлового провайдера должны быть одобрены до production.
                    </Text>
                </View>
            ) : null}
            {mode === 'LIST'
                ? state.value?.items.map((venue) => (
                      <Card
                          key={venue.id}
                          onPress={() => {
                              navigation.navigate('VenueDetail', { venueId: venue.id });
                          }}
                      >
                          <Text style={textStyles.heading}>{venue.name}</Text>
                          <Text style={textStyles.body}>{venue.normalizedAddress}</Text>
                          <Text style={textStyles.muted}>
                              {venue.distanceMeters === undefined
                                  ? venue.locality
                                  : `${String(Math.round(venue.distanceMeters))} м`}
                          </Text>
                      </Card>
                  ))
                : null}
            {state.error === undefined ? null : <Status kind="error">{state.error}</Status>}
        </Screen>
    );
}

function NotificationsScreen({ navigation }: TabProps<'Notifications'>) {
    const { api, online } = useAppServices();
    const load = useCallback(
        () => api.authenticatedCall<Schemas['NotificationPage']>('/notifications?limit=50'),
        [api]
    );
    const state = useCachedResource('NOTIFICATIONS', 'USER_READ', load);
    const open = async (notification: Schemas['Notification']) => {
        if (online && notification.readAt === null) {
            await api
                .authenticatedCall(`/notifications/${notification.id}/read`, {
                    body: {},
                    idempotencyKey: uuidV4(),
                    method: 'POST',
                })
                .catch(() => undefined);
        }
        const target = notification.mobileTarget;
        if (target?.kind === 'MATCH') navigation.navigate('MatchDetail', { matchId: target.matchId });
        else if (target?.kind === 'MATCH_CHAT') navigation.navigate('Chat', { matchId: target.matchId });
    };
    return (
        <Screen title="Уведомления">
            {state.staleAt === undefined ? null : (
                <Status kind="stale">
                    Сохранённые уведомления · {new Date(state.staleAt).toLocaleString('ru-RU')}
                </Status>
            )}
            {state.loading ? <Loading /> : null}
            {state.value?.items.length === 0 ? <Status>Новых уведомлений нет.</Status> : null}
            {state.value?.items.map((item) => (
                <Card key={item.id} onPress={() => void open(item)}>
                    <Text style={textStyles.heading}>{notificationLabels[item.type]}</Text>
                    <Text style={textStyles.muted}>
                        {new Date(item.createdAt).toLocaleString('ru-RU')}{' '}
                        {item.readAt === null ? '· не прочитано' : ''}
                    </Text>
                </Card>
            ))}
            {state.error === undefined ? null : <Status kind="error">{state.error}</Status>}
        </Screen>
    );
}

function ProfileScreen({ navigation }: TabProps<'Profile'>) {
    const { api } = useAppServices();
    const load = useCallback(() => api.authenticatedCall<Schemas['PlayerProfile']>('/me/profile'), [api]);
    const state = useCachedResource('PROFILE', 'USER_READ', load);
    return (
        <Screen title="Профиль">
            {state.loading ? <Loading /> : null}
            {state.staleAt === undefined ? null : (
                <Status kind="stale">Офлайн-копия от {new Date(state.staleAt).toLocaleString('ru-RU')}</Status>
            )}
            {state.value === undefined ? null : (
                <Card>
                    <Text style={textStyles.heading}>{state.value.displayName}</Text>
                    <Text style={textStyles.body}>Уровень: {state.value.skillSelfAssessment}</Text>
                    <Text style={textStyles.muted}>
                        Матчи: {state.value.statistics.totals.find((item) => item.slice === 'ALL')?.played ?? 0}
                    </Text>
                </Card>
            )}
            <Button
                label="Ралли на точность"
                onPress={() => {
                    navigation.navigate('MiniGame');
                }}
            />
            <Button
                label="История и статистика"
                onPress={() => {
                    navigation.navigate('Player', { playerId: 'me' });
                }}
                secondary
            />
            <Button
                label="Безопасность"
                onPress={() => {
                    navigation.navigate('Safety');
                }}
                secondary
            />
            <Button
                label="Аккаунт"
                onPress={() => {
                    navigation.navigate('Account');
                }}
                secondary
            />
            {state.error === undefined ? null : <Status kind="error">{state.error}</Status>}
        </Screen>
    );
}

export function MainTabs() {
    return (
        <Tabs.Navigator
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: '#12634f',
                tabBarLabelStyle: { fontSize: Platform.OS === 'ios' ? 12 : 13 },
                tabBarStyle: { minHeight: 56 },
            }}
        >
            <Tabs.Screen
                component={MatchesScreen}
                name="Matches"
                options={{ tabBarAccessibilityLabel: 'Матчи', tabBarLabel: 'Матчи' }}
            />
            <Tabs.Screen
                component={VenuesScreen}
                name="Venues"
                options={{ tabBarAccessibilityLabel: 'Площадки', tabBarLabel: 'Площадки' }}
            />
            <Tabs.Screen
                component={NotificationsScreen}
                name="Notifications"
                options={{ tabBarAccessibilityLabel: 'Уведомления', tabBarLabel: 'Уведомления' }}
            />
            <Tabs.Screen
                component={ProfileScreen}
                name="Profile"
                options={{ tabBarAccessibilityLabel: 'Профиль', tabBarLabel: 'Профиль' }}
            />
        </Tabs.Navigator>
    );
}
