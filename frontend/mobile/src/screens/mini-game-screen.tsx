import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { useAppServices } from '../app-context';
import { runtimeConfig } from '../config';
import { uuidV4 } from '../platform/uuid';
import { Button, Loading, Screen, Status } from '../ui/components';
import { textStyles } from '../ui/styles';
import type { RootParams } from './main-tabs';
import {
    acceptUniqueBridgeMessage,
    isAllowedGameNavigation,
    isExpectedGameOrigin,
    type SafeGameRoute,
} from './mini-game-bridge';

type Props = NativeStackScreenProps<RootParams, 'MiniGame'>;

export function MiniGameScreen({ navigation }: Props) {
    const { api, online, onLogout } = useAppServices();
    const [launch, setLaunch] = useState<Awaited<ReturnType<typeof api.createMiniGameWebViewLaunch>>>();
    const [error, setError] = useState<string>();
    const [ready, setReady] = useState(false);
    const seenMessages = useRef(new Set<string>());
    const allowExit = useRef(false);

    useEffect(() => {
        if (!online) return;
        let active = true;
        void api
            .createMiniGameWebViewLaunch(uuidV4())
            .then((value) => {
                if (!active) return;
                if (value.origin !== runtimeConfig.miniGameOrigin) {
                    setError('Сервер вернул неразрешённый источник игры.');
                    return;
                }
                setLaunch(value);
            })
            .catch(() => {
                if (active)
                    setError('Не удалось безопасно запустить игру. Матчи и остальные разделы продолжают работать.');
            });
        return () => {
            active = false;
        };
    }, [api, online]);

    useEffect(
        () =>
            navigation.addListener('beforeRemove', (event) => {
                if (allowExit.current || launch === undefined) return;
                event.preventDefault();
                Alert.alert('Выйти из игры?', 'Текущий раунд завершится без награды.', [
                    { style: 'cancel', text: 'Продолжить игру' },
                    {
                        onPress: () => {
                            allowExit.current = true;
                            navigation.dispatch(event.data.action);
                        },
                        style: 'destructive',
                        text: 'Выйти',
                    },
                ]);
            }),
        [launch, navigation]
    );

    const close = () => {
        allowExit.current = true;
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.replace('Main', { screen: 'Matches' });
    };
    const reject = () => {
        setError('Игра попыталась выполнить запрещённое действие и была закрыта.');
        setLaunch(undefined);
    };
    const navigateSafeRoute = async (route: SafeGameRoute) => {
        allowExit.current = true;
        try {
            await api.bootstrap();
        } catch {
            await onLogout();
            return;
        }
        if (route === 'MATCH_CREATE') navigation.replace('CreateMatch');
        else navigation.replace('Main', { screen: route === 'MATCH_LIST' ? 'Matches' : 'Profile' });
    };
    const onMessage = (event: WebViewMessageEvent) => {
        if (!isExpectedGameOrigin(event.nativeEvent.url, runtimeConfig.miniGameOrigin)) {
            reject();
            return;
        }
        const envelope = acceptUniqueBridgeMessage(event.nativeEvent.data, seenMessages.current);
        if (!envelope) {
            reject();
            return;
        }
        if (envelope.type === 'READY_V1') setReady(true);
        else if (envelope.type === 'CLOSE_V1') close();
        else if (envelope.type === 'OPEN_SAFE_ROUTE_V1') {
            void navigateSafeRoute(envelope.payload.route as SafeGameRoute);
        }
    };
    const allowNavigation = (request: WebViewNavigation) =>
        isAllowedGameNavigation(request.url, runtimeConfig.miniGameOrigin);

    const visibleError = online
        ? error
        : 'Для безопасного запуска мобильной игры нужна сеть. После загрузки обрыв сети переведёт игру в тренировку.';
    if (visibleError) {
        return (
            <Screen title="Ралли на точность">
                <Status kind="error">{visibleError}</Status>
                <Button label="Вернуться в PickleHub" onPress={close} />
            </Screen>
        );
    }
    if (!launch) return <Loading />;
    return (
        <View style={{ flex: 1 }}>
            {!ready ? (
                <View accessible accessibilityLiveRegion="polite" style={{ padding: 12 }}>
                    <Text style={textStyles.muted}>Защищённая игра загружается…</Text>
                </View>
            ) : null}
            <WebView
                allowsBackForwardNavigationGestures={false}
                allowsFullscreenVideo={false}
                allowsInlineMediaPlayback={false}
                allowsLinkPreview={false}
                cacheEnabled={false}
                domStorageEnabled={false}
                incognito
                javaScriptCanOpenWindowsAutomatically={false}
                javaScriptEnabled
                limitsNavigationsToAppBoundDomains={runtimeConfig.appEnvironment === 'production'}
                mediaPlaybackRequiresUserAction
                mixedContentMode="never"
                onContentProcessDidTerminate={reject}
                onError={reject}
                onHttpError={reject}
                onMessage={onMessage}
                onOpenWindow={reject}
                onShouldStartLoadWithRequest={allowNavigation}
                originWhitelist={[runtimeConfig.miniGameOrigin]}
                pullToRefreshEnabled={false}
                setSupportMultipleWindows={false}
                sharedCookiesEnabled={false}
                source={{
                    body: JSON.stringify({ capability: launch.capability }),
                    headers: { Accept: 'text/html', 'Content-Type': 'application/json' },
                    method: 'POST',
                    uri: launch.origin,
                }}
                thirdPartyCookiesEnabled={false}
            />
        </View>
    );
}
