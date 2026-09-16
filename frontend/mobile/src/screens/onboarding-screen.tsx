import type { components } from '@picklehub/api-client';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import type { MobileApiClient } from '../api/mobile-client';
import { uuidV4 } from '../platform/uuid';
import { Button, Card, Field, Loading, Screen, Status } from '../ui/components';
import { textStyles } from '../ui/styles';

type Schemas = components['schemas'];

export function OnboardingScreen({
    api,
    onComplete,
}: {
    readonly api: MobileApiClient;
    readonly onComplete: () => void;
}) {
    const [draft, setDraft] = useState<Schemas['Onboarding']>();
    const [documents, setDocuments] = useState<Schemas['ConsentDocument'][]>([]);
    const [localities, setLocalities] = useState<Schemas['Locality'][]>([]);
    const [displayName, setDisplayName] = useState('');
    const [localityQuery, setLocalityQuery] = useState('');
    const [localityId, setLocalityId] = useState<string>();
    const [skill, setSkill] = useState<Schemas['SkillLevel']>(2);
    const [accepted, setAccepted] = useState<ReadonlySet<string>>(new Set());
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string>();

    const load = useCallback(async () => {
        try {
            const [onboarding, consentDocuments] = await Promise.all([
                api.authenticatedCall<Schemas['Onboarding']>('/me/onboarding'),
                api.publicCall<Schemas['ConsentDocuments']>('/identity/documents'),
            ]);
            setDraft(onboarding);
            setDisplayName(onboarding.draft.displayName ?? '');
            setLocalityId(onboarding.draft.localityId ?? undefined);
            setSkill(onboarding.draft.skillSelfAssessment ?? 2);
            setDocuments([...consentDocuments.items]);
        } catch {
            setError('Не удалось загрузить первичную настройку.');
        }
    }, [api]);

    useEffect(() => void load(), [load]);
    useEffect(() => {
        const timer = setTimeout(() => {
            void api
                .authenticatedCall<Schemas['LocalityPage']>(
                    `/identity/onboarding-options/localities?limit=20&query=${encodeURIComponent(localityQuery)}`
                )
                .then((page) => {
                    setLocalities([...page.items]);
                })
                .catch(() => {
                    setLocalities([]);
                });
        }, 250);
        return () => {
            clearTimeout(timer);
        };
    }, [api, localityQuery]);

    const finish = async () => {
        if (draft === undefined || localityId === undefined) return;
        setBusy(true);
        setError(undefined);
        try {
            const updated = await api.authenticatedCall<Schemas['Onboarding']>('/me/onboarding', {
                body: {
                    displayName: displayName.trim(),
                    expectedVersion: draft.draft.version,
                    gameFormats: ['SINGLES', 'DOUBLES'],
                    localityId,
                    skillSelfAssessment: skill,
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow',
                },
                idempotencyKey: uuidV4(),
                method: 'PATCH',
            });
            for (const document of documents.filter((item) => item.required)) {
                await api.authenticatedCall('/me/consents', {
                    body: {
                        action: 'ACCEPTED',
                        platform: 'MOBILE',
                        purpose: document.purpose,
                        version: document.version,
                    },
                    idempotencyKey: uuidV4(),
                    method: 'POST',
                });
            }
            const terms = documents.find((item) => item.purpose === 'TERMS');
            const personal = documents.find((item) => item.purpose === 'PERSONAL_DATA');
            if (terms === undefined || personal === undefined) throw new Error('Required documents unavailable.');
            await api.authenticatedCall('/me/onboarding/complete', {
                body: {
                    expectedVersion: updated.draft.version,
                    personalDataVersion: personal.version,
                    termsVersion: terms.version,
                },
                idempotencyKey: uuidV4(),
                method: 'POST',
            });
            onComplete();
        } catch {
            setError('Не удалось сохранить настройку. Обновите данные и попробуйте снова.');
            await load();
        } finally {
            setBusy(false);
        }
    };

    if (draft === undefined && error === undefined) return <Loading />;
    const requiredAccepted = documents.filter((item) => item.required).every((item) => accepted.has(item.purpose));
    return (
        <Screen title="Настройка профиля">
            {error === undefined ? null : <Status kind="error">{error}</Status>}
            <Field label="Имя игрока" maxLength={80} onChangeText={setDisplayName} value={displayName} />
            <Field label="Найти город" onChangeText={setLocalityQuery} value={localityQuery} />
            {localities.map((locality) => (
                <Card
                    key={locality.id}
                    onPress={() => {
                        setLocalityId(locality.id);
                    }}
                >
                    <Text style={textStyles.body}>{locality.name}</Text>
                    {localityId === locality.id ? <Text>Выбрано</Text> : null}
                </Card>
            ))}
            <Text style={textStyles.heading}>Самооценка уровня</Text>
            <View style={{ gap: 8 }}>
                {([1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const).map((value) => (
                    <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{ checked: skill === value }}
                        key={value}
                        onPress={() => {
                            setSkill(value);
                        }}
                    >
                        <Text style={textStyles.body}>
                            {skill === value ? '●' : '○'} {value}
                        </Text>
                    </Pressable>
                ))}
            </View>
            <Text style={textStyles.heading}>Документы</Text>
            {documents.map((document) => (
                <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: accepted.has(document.purpose) }}
                    key={document.purpose}
                    onPress={() => {
                        setAccepted((current) => {
                            const next = new Set(current);
                            if (next.has(document.purpose)) next.delete(document.purpose);
                            else next.add(document.purpose);
                            return next;
                        });
                    }}
                >
                    <Text style={textStyles.body}>
                        {accepted.has(document.purpose) ? '☑' : '☐'} {document.title}
                        {document.required ? ' *' : ''}
                    </Text>
                </Pressable>
            ))}
            <Button
                disabled={busy || displayName.trim().length < 2 || localityId === undefined || !requiredAccepted}
                label={busy ? 'Сохраняем…' : 'Завершить настройку'}
                onPress={() => void finish()}
            />
        </Screen>
    );
}
