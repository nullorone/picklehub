import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { components } from '@picklehub/api-client';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Text } from 'react-native';

import { useAppServices } from '../app-context';
import { runtimeConfig } from '../config';
import { useCachedResource } from '../hooks/use-cached-resource';
import { requestAndRegisterPush } from '../push/push-registration';
import { Button, Card, Loading, Screen, Status } from '../ui/components';
import { textStyles } from '../ui/styles';
import type { RootParams } from './main-tabs';

type Schemas = components['schemas'];
type Props<Route extends keyof RootParams> = NativeStackScreenProps<RootParams, Route>;

export function PlayerScreen({ route }: Props<'Player'>) {
    const { api } = useAppServices();
    const own = route.params.playerId === 'me';
    const profilePath = own ? '/me/profile' : `/players/${route.params.playerId}`;
    const historyPath = own ? '/me/match-history?limit=20' : `/players/${route.params.playerId}/match-history?limit=20`;
    const statisticsPath = own ? '/me/statistics' : `/players/${route.params.playerId}/statistics`;
    const loadProfile = useCallback(
        () => api.authenticatedCall<Schemas['PlayerProfile'] | Schemas['PublicPlayerProfile']>(profilePath),
        [api, profilePath]
    );
    const loadHistory = useCallback(
        () => api.authenticatedCall<Schemas['MatchHistoryPage']>(historyPath),
        [api, historyPath]
    );
    const loadStatistics = useCallback(
        () => api.authenticatedCall<Schemas['PlayerStatistics'] | Schemas['PublicPlayerStatistics']>(statisticsPath),
        [api, statisticsPath]
    );
    const profile = useCachedResource('PROFILE', own ? 'USER_READ' : 'PUBLIC_READ', loadProfile, route.params.playerId);
    const history = useCachedResource('MATCHES', 'USER_READ', loadHistory, `history-${route.params.playerId}`);
    const statistics = useCachedResource('STATISTICS', 'USER_READ', loadStatistics, route.params.playerId);
    const duprLink = profile.value?.externalProfileLink;
    return (
        <Screen title={own ? 'Мои результаты' : 'Игрок'}>
            {profile.loading || history.loading || statistics.loading ? <Loading /> : null}
            {profile.value === undefined ? null : (
                <Card>
                    <Text style={textStyles.heading}>{profile.value.displayName}</Text>
                    <Text style={textStyles.body}>Уровень: {profile.value.skillSelfAssessment}</Text>
                </Card>
            )}
            <Text style={textStyles.heading}>Статистика</Text>
            {statistics.value?.totals.map((total) => (
                <Card key={total.slice}>
                    <Text style={textStyles.body}>
                        {total.slice}: матчей {total.played}, побед {total.wins}
                    </Text>
                </Card>
            ))}
            <Text style={textStyles.heading}>История</Text>
            {history.value?.items.map((match) => (
                <Card key={match.matchId}>
                    <Text style={textStyles.body}>
                        {new Date(match.startsAt).toLocaleDateString('ru-RU')} · {match.format}
                    </Text>
                    <Text style={textStyles.muted}>{match.state}</Text>
                </Card>
            ))}
            {duprLink?.outboundEnabled !== true ? null : (
                <Button label="Открыть профиль DUPR" onPress={() => void Linking.openURL(duprLink.url)} secondary />
            )}
            {[profile, history, statistics].some((value) => value.staleAt !== undefined) ? (
                <Status kind="stale">Показаны сохранённые данные. Сервер остаётся источником статистики.</Status>
            ) : null}
        </Screen>
    );
}

export function SafetyScreen({ navigation }: Props<'Safety'>) {
    const { api, online } = useAppServices();
    const [page, setPage] = useState<Schemas['SafetyReceiptPage']>();
    const [error, setError] = useState<string>();
    useEffect(() => {
        if (!online) return;
        void api
            .authenticatedCall<Schemas['SafetyReceiptPage']>('/me/safety-reports?limit=20')
            .then(setPage)
            .catch(() => {
                setError('Не удалось загрузить обращения.');
            });
    }, [api, online]);
    return (
        <Screen title="Безопасность">
            <Status>Текст обращений и доказательства не сохраняются на устройстве. Все отправки требуют сети.</Status>
            {!online ? <Status kind="error">Для просмотра обращений требуется подключение.</Status> : null}
            {page?.items.length === 0 ? <Status>Обращений пока нет.</Status> : null}
            {page?.items.map((receipt) => (
                <Card
                    key={receipt.receiptId}
                    onPress={() => {
                        navigation.navigate('SafetyReceipt', { receiptId: receipt.receiptId });
                    }}
                >
                    <Text style={textStyles.heading}>Обращение</Text>
                    <Text style={textStyles.body}>Статус: {receipt.status}</Text>
                    <Text style={textStyles.muted}>{new Date(receipt.updatedAt).toLocaleString('ru-RU')}</Text>
                </Card>
            ))}
            {error === undefined ? null : <Status kind="error">{error}</Status>}
        </Screen>
    );
}

export function SafetyReceiptScreen({ route }: Props<'SafetyReceipt'>) {
    const { api, online } = useAppServices();
    const [detail, setDetail] = useState<Schemas['OwnSafetyReportDetail']>();
    useEffect(() => {
        if (online)
            void api
                .authenticatedCall<Schemas['OwnSafetyReportDetail']>(`/me/safety-reports/${route.params.receiptId}`)
                .then(setDetail)
                .catch(() => undefined);
    }, [api, online, route.params.receiptId]);
    return (
        <Screen title="Статус обращения">
            {!online ? <Status kind="error">Этот экран не кешируется и доступен только онлайн.</Status> : null}
            {online && detail === undefined ? <Loading /> : null}
            {detail === undefined ? null : (
                <Card>
                    <Text style={textStyles.heading}>Статус: {detail.receipt.status}</Text>
                    <Text style={textStyles.body}>Тип: {detail.receipt.kind}</Text>
                    <Text style={textStyles.muted}>
                        Обновлено {new Date(detail.receipt.updatedAt).toLocaleString('ru-RU')}
                    </Text>
                </Card>
            )}
        </Screen>
    );
}

export function AccountScreen() {
    const { api, onLogout, online } = useAppServices();
    const [me, setMe] = useState<Schemas['Me']>();
    const [devices, setDevices] = useState<Schemas['NotificationDevicePage']>();
    const [pushNotice, setPushNotice] = useState<string>();
    useEffect(() => {
        if (!online) return;
        void Promise.all([
            api.authenticatedCall<Schemas['Me']>('/me'),
            api.authenticatedCall<Schemas['NotificationDevicePage']>('/notification-devices'),
        ])
            .then(([nextMe, nextDevices]) => {
                setMe(nextMe);
                setDevices(nextDevices);
            })
            .catch(() => undefined);
    }, [api, online]);
    const enablePush = async () => {
        if (!runtimeConfig.pushEnabled) {
            setPushNotice('Push-провайдер ещё не одобрен. Уведомления внутри приложения продолжают работать.');
            return;
        }
        const result = await requestAndRegisterPush(
            api,
            runtimeConfig.appEnvironment === 'production' ? 'PRODUCTION' : 'SANDBOX'
        );
        setPushNotice(
            result === 'REGISTERED'
                ? 'Push-уведомления включены.'
                : result === 'DENIED'
                  ? 'Разрешение не выдано. Его можно изменить в настройках системы.'
                  : 'Push временно недоступен.'
        );
    };
    const confirmLogout = () => {
        Alert.alert('Выйти?', 'Локальные данные этого аккаунта будут удалены.', [
            { text: 'Отмена', style: 'cancel' },
            { text: 'Выйти', style: 'destructive', onPress: () => void onLogout() },
        ]);
    };
    return (
        <Screen title="Аккаунт">
            {!online ? (
                <Status kind="error">Изменения аккаунта требуют сети. Локальный выход доступен всегда.</Status>
            ) : null}
            <Text style={textStyles.heading}>Способы входа</Text>
            {me?.identities.map((identity) => (
                <Card key={identity.id}>
                    <Text style={textStyles.body}>{identity.provider}</Text>
                </Card>
            ))}
            <Status>Привязка Telegram недоступна до появления безопасного server-bound proof.</Status>
            <Text style={textStyles.heading}>Устройства</Text>
            {devices?.items.map((device) => (
                <Card key={device.installationId}>
                    <Text style={textStyles.body}>{device.platform}</Text>
                    <Text style={textStyles.muted}>
                        Активность: {new Date(device.lastSeenAt).toLocaleString('ru-RU')}
                    </Text>
                </Card>
            ))}
            <Button label="Настроить push-уведомления" onPress={() => void enablePush()} secondary />
            {pushNotice === undefined ? null : <Status>{pushNotice}</Status>}
            <Button label="Выйти" onPress={confirmLogout} />
            <Button
                label="Удаление аккаунта"
                onPress={() => {
                    Alert.alert(
                        'Удаление аккаунта',
                        'Необратимая операция требует повторного подтверждения личности и сети.'
                    );
                }}
                secondary
            />
        </Screen>
    );
}
