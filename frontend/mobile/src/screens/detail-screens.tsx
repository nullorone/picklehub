import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { components } from '@picklehub/api-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Text } from 'react-native';

import { useAppServices } from '../app-context';
import { useCachedResource } from '../hooks/use-cached-resource';
import { uuidV4 } from '../platform/uuid';
import { MobileRealtimeClient } from '../realtime/realtime-client';
import { Button, Card, Field, Loading, Screen, Status } from '../ui/components';
import { textStyles } from '../ui/styles';
import type { RootParams } from './main-tabs';

type Schemas = components['schemas'];
type Props<Route extends keyof RootParams> = NativeStackScreenProps<RootParams, Route>;

export function MatchDetailScreen({ navigation, route }: Props<'MatchDetail'>) {
    const { api, online } = useAppServices();
    const load = useCallback(
        () => api.authenticatedCall<Schemas['Match']>(`/matches/${route.params.matchId}`),
        [api, route.params.matchId]
    );
    const state = useCachedResource('MATCH', 'USER_READ', load, route.params.matchId);
    const match = state.value;
    const join = async () => {
        if (!online || match === undefined) return;
        await api
            .authenticatedCall(`/matches/${match.id}/join`, {
                body: { expectedVersion: match.version, teamChoice: 'ANY' },
                idempotencyKey: uuidV4(),
                method: 'POST',
            })
            .then(state.refresh)
            .catch(() => undefined);
    };
    return (
        <Screen title="Матч">
            {state.loading ? <Loading /> : null}
            {state.staleAt === undefined ? null : (
                <Status kind="stale">
                    Сохранённое состояние от {new Date(state.staleAt).toLocaleString('ru-RU')}. Перед действием данные
                    будут сверены.
                </Status>
            )}
            {match === undefined ? null : (
                <>
                    <Card>
                        <Text style={textStyles.heading}>{match.format === 'DOUBLES' ? '2 × 2' : '1 × 1'}</Text>
                        <Text style={textStyles.body}>
                            {match.startsAt === null
                                ? 'Время уточняется'
                                : new Date(match.startsAt).toLocaleString('ru-RU', {
                                      timeZone: match.timeZone ?? undefined,
                                  })}
                        </Text>
                        <Text style={textStyles.body}>Статус: {match.state}</Text>
                        <Text style={textStyles.muted}>{match.description ?? 'Без описания'}</Text>
                    </Card>
                    <Button
                        disabled={!online || state.staleAt !== undefined}
                        label={online ? 'Вступить или встать в очередь' : 'Для вступления нужна сеть'}
                        onPress={() => void join()}
                    />
                    <Button
                        label="Открыть чат"
                        onPress={() => {
                            navigation.navigate('Chat', { matchId: match.id });
                        }}
                        secondary
                    />
                    <Status>
                        Результат, подтверждение, спор, отзыв и жалоба доступны только онлайн и всегда проверяются
                        сервером.
                    </Status>
                </>
            )}
            {state.error === undefined ? null : <Status kind="error">{state.error}</Status>}
        </Screen>
    );
}

export function VenueDetailScreen({ route }: Props<'VenueDetail'>) {
    const { api } = useAppServices();
    const load = useCallback(
        () => api.publicCall<Schemas['Venue']>(`/venues/${route.params.venueId}`),
        [api, route.params.venueId]
    );
    const state = useCachedResource('VENUES', 'PUBLIC_READ', load, route.params.venueId);
    return (
        <Screen title="Площадка">
            {state.loading ? <Loading /> : null}
            {state.staleAt === undefined ? null : (
                <Status kind="stale">Офлайн-копия от {new Date(state.staleAt).toLocaleString('ru-RU')}</Status>
            )}
            {state.value === undefined ? null : (
                <Card>
                    <Text style={textStyles.heading}>{state.value.name}</Text>
                    <Text style={textStyles.body}>{state.value.normalizedAddress}</Text>
                    <Text style={textStyles.body}>Кортов: {state.value.pickleballCourtCount ?? 'неизвестно'}</Text>
                    {state.value.attribution.map((item) => (
                        <Text key={`${item.sourceKind}-${item.observedAt}`} style={textStyles.muted}>
                            {item.text}
                            {item.link === undefined ? '' : ` · ${item.link}`}
                        </Text>
                    ))}
                </Card>
            )}
            <Button label="Предложить исправление" onPress={() => undefined} secondary />
            <Button label="Сообщить о площадке" onPress={() => undefined} secondary />
            {state.error === undefined ? null : <Status kind="error">{state.error}</Status>}
        </Screen>
    );
}

export function ChatScreen({ route }: Props<'Chat'>) {
    const { api, online } = useAppServices();
    const [draft, setDraft] = useState('');
    const [connection, setConnection] = useState<'CONNECTING' | 'LIVE' | 'OFFLINE'>('OFFLINE');
    const [refresh, setRefresh] = useState(0);
    const load = useCallback(() => {
        void refresh;
        return api.authenticatedCall<Schemas['ConversationSnapshot']>(`/matches/${route.params.matchId}/conversation`);
    }, [api, refresh, route.params.matchId]);
    const state = useCachedResource('CHAT', 'CHAT_READ', load, route.params.matchId);
    const realtime = useRef<MobileRealtimeClient | undefined>(undefined);

    useEffect(() => {
        const snapshot = state.value;
        if (!online || snapshot === undefined) return undefined;
        const client = new MobileRealtimeClient({
            api,
            onAuthenticationExpired: () => {
                setConnection('OFFLINE');
            },
            onResyncRequired: () => {
                setRefresh((value) => value + 1);
            },
            onStateChange: setConnection,
            onUpdate: () => {
                setRefresh((value) => value + 1);
            },
            url: api.getRealtimeUrl(),
        });
        realtime.current = client;
        client.connect({ cursor: snapshot.catchUpCursor, matchId: route.params.matchId });
        const subscription = AppState.addEventListener('change', (next) => {
            if (next === 'active') {
                setRefresh((value) => value + 1);
                client.connect({ cursor: snapshot.catchUpCursor, matchId: route.params.matchId });
            } else client.close();
        });
        return () => {
            subscription.remove();
            client.close();
        };
    }, [api, online, route.params.matchId, state.value]);

    const send = async () => {
        if (!online || draft.trim() === '') return;
        const value = draft.trim();
        setDraft('');
        try {
            await api.authenticatedCall(`/matches/${route.params.matchId}/conversation/messages`, {
                body: { text: value },
                idempotencyKey: uuidV4(),
                method: 'POST',
            });
            setRefresh((current) => current + 1);
        } catch {
            setDraft(value);
        }
    };
    return (
        <Screen title="Чат матча">
            <Status kind={online ? 'neutral' : 'stale'}>
                {online ? `Соединение: ${connection}` : 'Офлайн: доступна только сохранённая история.'}
            </Status>
            {state.loading ? <Loading /> : null}
            {state.value?.messages.map((message) => (
                <Card key={message.id}>
                    <Text style={textStyles.body}>
                        {message.kind === 'SYSTEM' ? `Событие: ${message.systemType ?? ''}` : message.text}
                    </Text>
                    <Text style={textStyles.muted}>
                        {new Date(message.createdAt).toLocaleString('ru-RU')}
                        {message.editedAt === null ? '' : ' · изменено'}
                    </Text>
                </Card>
            ))}
            <Field label="Сообщение" maxLength={2000} multiline onChangeText={setDraft} value={draft} />
            <Button
                disabled={!online || draft.trim() === ''}
                label={online ? 'Отправить' : 'Отправка доступна онлайн'}
                onPress={() => void send()}
            />
            {state.error === undefined ? null : <Status kind="error">{state.error}</Status>}
        </Screen>
    );
}

export function CreateMatchScreen({ navigation }: Props<'CreateMatch'>) {
    const { api, online } = useAppServices();
    const [venueId, setVenueId] = useState('');
    const [description, setDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();
    const create = async () => {
        setBusy(true);
        setError(undefined);
        try {
            const match = await api.authenticatedCall<Schemas['Match']>('/matches', {
                body: {
                    description,
                    format: 'SINGLES',
                    joinMode: 'AUTO',
                    skillMax: 5,
                    skillMin: 1,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
                    venueId,
                    visibility: 'PUBLIC',
                },
                idempotencyKey: uuidV4(),
                method: 'POST',
            });
            navigation.replace('MatchDetail', { matchId: match.id });
        } catch {
            setError('Не удалось создать черновик. Проверьте площадку и данные.');
        } finally {
            setBusy(false);
        }
    };
    return (
        <Screen title="Новый матч">
            <Field label="Идентификатор выбранной площадки" onChangeText={setVenueId} value={venueId} />
            <Field label="Описание" maxLength={1000} multiline onChangeText={setDescription} value={description} />
            {error === undefined ? null : <Status kind="error">{error}</Status>}
            <Button
                disabled={!online || busy || venueId.length < 36}
                label={!online ? 'Для создания нужна сеть' : busy ? 'Создаём…' : 'Создать черновик'}
                onPress={() => void create()}
            />
            <Status>
                Публикация и изменения состава не подтверждаются оптимистично: итог всегда приходит с сервера.
            </Status>
        </Screen>
    );
}
