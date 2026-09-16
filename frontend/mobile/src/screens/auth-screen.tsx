import type { components } from '@picklehub/api-client';
import { useState } from 'react';
import { Text } from 'react-native';

import type { MobileApiClient } from '../api/mobile-client';
import { createNativeLoginProof } from '../security/pkce';
import type { SecureSessionStore } from '../security/secure-session';
import { Button, Field, Screen, Status } from '../ui/components';
import { textStyles } from '../ui/styles';

type NativeSession = components['schemas']['NativeAuthenticatedSession'];

export function AuthScreen({
    api,
    magicToken,
    onAuthenticated,
    secureStore,
}: {
    readonly api: MobileApiClient;
    readonly magicToken?: string;
    readonly onAuthenticated: (session: NativeSession) => void;
    readonly secureStore: SecureSessionStore;
}) {
    const [email, setEmail] = useState('');
    const [state, setState] = useState<'FORM' | 'SENDING' | 'SENT' | 'CONSUMING'>('FORM');
    const [error, setError] = useState<string>();

    const request = async () => {
        setState('SENDING');
        setError(undefined);
        try {
            const proof = await createNativeLoginProof();
            await secureStore.setVerifier(proof.verifier);
            await api.requestMagicLink(email.trim(), proof.challenge);
            setState('SENT');
        } catch {
            setState('FORM');
            setError('Не удалось отправить ссылку. Проверьте сеть и повторите попытку.');
        }
    };

    const consume = async () => {
        if (magicToken === undefined) return;
        setState('CONSUMING');
        setError(undefined);
        const verifier = await secureStore.getVerifier();
        if (verifier === null) {
            setState('FORM');
            setError('Ссылка была запрошена на другом устройстве или устарела. Запросите новую.');
            return;
        }
        try {
            const session = await api.consumeMagicLink(magicToken, verifier);
            onAuthenticated(session);
        } catch {
            setState('FORM');
            setError('Ссылка недействительна или уже использована. Запросите новую.');
        }
    };

    return (
        <Screen title="Вход в PickleHub">
            <Text style={textStyles.body}>Получите одноразовую ссылку по email. Пароль не нужен.</Text>
            {error === undefined ? null : <Status kind="error">{error}</Status>}
            {magicToken === undefined ? (
                <>
                    <Field
                        autoCapitalize="none"
                        autoComplete="email"
                        inputMode="email"
                        label="Email"
                        onChangeText={setEmail}
                        value={email}
                    />
                    <Button
                        disabled={!email.includes('@') || state === 'SENDING'}
                        label={state === 'SENDING' ? 'Отправляем…' : 'Получить ссылку'}
                        onPress={() => void request()}
                    />
                    {state === 'SENT' ? (
                        <Status>Если адрес можно использовать, письмо придёт в ближайшее время.</Status>
                    ) : null}
                </>
            ) : (
                <Button
                    disabled={state === 'CONSUMING'}
                    label={state === 'CONSUMING' ? 'Проверяем ссылку…' : 'Продолжить вход'}
                    onPress={() => void consume()}
                />
            )}
            <Status>Привязка Telegram в мобильном приложении пока недоступна. Вход выполняется только по email.</Status>
        </Screen>
    );
}
