import { ApiError, type components, type IdentityClient } from '@picklehub/api-client';
import { emailSchema, onboardingFormSchema, type OnboardingForm } from '@picklehub/validation';
import { useCallback, useEffect, useState } from 'react';

type Onboarding = components['schemas']['Onboarding'];
interface ReferenceData {
    readonly documents: readonly components['schemas']['ConsentDocument'][];
    readonly localities: readonly components['schemas']['Locality'][];
    readonly options: components['schemas']['OnboardingOptions'];
}

function message(error: unknown): string {
    if (error instanceof ApiError) {
        const code = error.response?.error.code;
        if (code === 'TELEGRAM_AUTH_INVALID')
            return 'Не удалось войти. Закройте и заново откройте приложение в Telegram.';
        if (code === 'DRAFT_VERSION_CONFLICT' || code === 'CONSENT_VERSION_CHANGED')
            return 'Данные изменились. Проверьте актуальную версию.';
        if (code === 'RATE_LIMITED')
            return `Слишком много попыток. Повторите через ${String(error.retryAfterSeconds ?? 60)} сек.`;
        return error.response?.error.message ?? 'Не удалось выполнить запрос.';
    }
    return 'Нет связи с сервером. Проверьте подключение.';
}

function values(onboarding: Onboarding): OnboardingForm {
    return {
        displayName: onboarding.draft.displayName ?? '',
        duprProfileUrl: onboarding.draft.duprProfileUrl ?? '',
        gameFormats: [...onboarding.draft.gameFormats],
        localityId: onboarding.draft.localityId ?? '',
        skillSelfAssessment: onboarding.draft.skillSelfAssessment ?? 2.5,
        timeZone: onboarding.draft.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
}

export function TelegramLogin({
    client,
    initData,
    online,
    onSession,
}: {
    readonly client: IdentityClient;
    readonly initData: string | undefined;
    readonly online: boolean;
    readonly onSession: (session: components['schemas']['AuthenticatedSession']) => void;
}) {
    const [error, setError] = useState<string>();
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        if (!online) return;
        const login = client.bootstrap().catch(() => {
            if (!initData) throw new Error('Telegram init data is unavailable');
            return client.exchangeTelegram(initData);
        });
        void login.then(onSession).catch((reason: unknown) => {
            setError(message(reason));
        });
    }, [client, initData, online, onSession, retry]);
    return (
        <main className="state-card centered">
            <p className="eyebrow">Вход через Telegram</p>
            <h1>{error ? 'Не удалось войти' : 'Проверяем вход…'}</h1>
            <p>{error ?? 'Данные Telegram проверяются только на сервере.'}</p>
            {error && (
                <button
                    className="primary-action"
                    type="button"
                    onClick={() => {
                        setError(undefined);
                        setRetry((value) => value + 1);
                    }}
                >
                    Повторить
                </button>
            )}
        </main>
    );
}

export function TelegramOnboarding({
    client,
    online,
    onCompleted,
}: {
    readonly client: IdentityClient;
    readonly online: boolean;
    readonly onCompleted: () => void;
}) {
    const [onboarding, setOnboarding] = useState<Onboarding>();
    const [reference, setReference] = useState<ReferenceData>();
    const [form, setForm] = useState<OnboardingForm>();
    const [accepted, setAccepted] = useState<Record<string, boolean>>({});
    const [status, setStatus] = useState<string>();
    const [busy, setBusy] = useState(false);
    const load = useCallback(async () => {
        try {
            const [draft, documents, options, localities] = await Promise.all([
                client.getOnboarding(),
                client.getDocuments(),
                client.getOnboardingOptions(),
                client.listLocalities(),
            ]);
            setOnboarding(draft);
            setForm(values(draft));
            setReference({ documents: documents.items, localities: localities.items, options });
            setAccepted(
                Object.fromEntries(
                    documents.items.map((document) => [
                        document.purpose,
                        draft.consents.some(
                            (consent) =>
                                consent.purpose === document.purpose && consent.acceptedVersion === document.version
                        ),
                    ])
                )
            );
        } catch (error) {
            setStatus(message(error));
        }
    }, [client]);
    useEffect(() => {
        void load();
    }, [load]);
    async function save() {
        if (!form || !onboarding || !reference) return undefined;
        if (!online) {
            setStatus('Изменения не сохранены. Подключитесь к интернету.');
            return undefined;
        }
        const parsed = onboardingFormSchema.safeParse(form);
        if (!parsed.success) {
            setStatus(parsed.error.issues[0]?.message);
            return undefined;
        }
        if (parsed.data.duprProfileUrl && !reference.options.duprLinksEnabled) {
            setStatus('Ссылка DUPR пока недоступна.');
            return undefined;
        }
        const result = await client.updateOnboarding({
            ...parsed.data,
            duprProfileUrl: parsed.data.duprProfileUrl || null,
            expectedVersion: onboarding.draft.version,
            skillSelfAssessment: parsed.data.skillSelfAssessment as components['schemas']['SkillLevel'],
        });
        setOnboarding(result);
        setForm(values(result));
        return result;
    }
    async function saveOnly() {
        setBusy(true);
        setStatus(undefined);
        try {
            if (await save()) setStatus('Черновик сохранён.');
        } catch (error) {
            setStatus(message(error));
            await load();
        } finally {
            setBusy(false);
        }
    }
    async function complete() {
        if (!reference) return;
        setBusy(true);
        setStatus(undefined);
        try {
            const current = await save();
            if (!current) return;
            const required = reference.documents.filter((item) => item.required);
            if (required.some((item) => !accepted[item.purpose])) {
                setStatus('Примите оба обязательных документа.');
                return;
            }
            for (const item of reference.documents)
                if (accepted[item.purpose])
                    await client.changeConsent({ action: 'ACCEPTED', purpose: item.purpose, version: item.version });
            const terms = required.find((item) => item.purpose === 'TERMS');
            const personal = required.find((item) => item.purpose === 'PERSONAL_DATA');
            if (!terms || !personal) throw new Error('Required documents are unavailable');
            const result = await client.completeOnboarding(current.draft.version, terms.version, personal.version);
            if (result.draft.status === 'COMPLETED') onCompleted();
        } catch (error) {
            setStatus(message(error));
            await load();
        } finally {
            setBusy(false);
        }
    }
    if (!onboarding || !reference || !form)
        return (
            <main className="state-card centered">
                <h1>Загружаем…</h1>
                {status && <p role="alert">{status}</p>}
            </main>
        );
    return (
        <main className="onboarding-main">
            <section className="onboarding-card" aria-labelledby="onboarding-title">
                <p className="eyebrow">Первичная настройка</p>
                <h1 id="onboarding-title">Ваш профиль игрока</h1>
                <p className="lead">Имя, город, форматы и самооценка станут публичными после завершения.</p>
                <label>
                    Отображаемое имя
                    <input
                        value={form.displayName}
                        onChange={(e) => {
                            setForm({ ...form, displayName: e.target.value });
                        }}
                    />
                </label>
                <label>
                    Часовой пояс
                    <select
                        value={form.timeZone}
                        onChange={(e) => {
                            setForm({ ...form, timeZone: e.target.value });
                        }}
                    >
                        {reference.options.supportedTimeZones.map((item) => (
                            <option key={item}>{item}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Населённый пункт
                    <select
                        value={form.localityId}
                        onChange={(e) => {
                            setForm({ ...form, localityId: e.target.value });
                        }}
                    >
                        <option value="">Выберите город</option>
                        {reference.localities.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name}, {item.region}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Самооценка
                    <select
                        value={String(form.skillSelfAssessment)}
                        onChange={(e) => {
                            setForm({ ...form, skillSelfAssessment: e.target.value });
                        }}
                    >
                        {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((item) => (
                            <option key={item} value={item}>
                                {item.toFixed(1)} — не подтверждено
                            </option>
                        ))}
                    </select>
                </label>
                <fieldset>
                    <legend>Форматы игры</legend>
                    {(['SINGLES', 'DOUBLES'] as const).map((format) => (
                        <label className="check" key={format}>
                            <input
                                type="checkbox"
                                checked={form.gameFormats.includes(format)}
                                onChange={(e) => {
                                    setForm({
                                        ...form,
                                        gameFormats: e.target.checked
                                            ? [...form.gameFormats, format]
                                            : form.gameFormats.filter((item) => item !== format),
                                    });
                                }}
                            />
                            {format === 'SINGLES' ? 'Одиночная 1×1' : 'Парная 2×2'}
                        </label>
                    ))}
                </fieldset>
                <label>
                    DUPR — необязательно
                    <input
                        type="url"
                        disabled={!reference.options.duprLinksEnabled}
                        value={form.duprProfileUrl}
                        placeholder="Пока недоступно"
                        onChange={(e) => {
                            setForm({ ...form, duprProfileUrl: e.target.value });
                        }}
                    />
                </label>
                <h2>Согласия</h2>
                {reference.documents.map((document) => (
                    <div className="document" key={document.purpose}>
                        <details>
                            <summary>{document.title}</summary>
                            <p>{document.text}</p>
                        </details>
                        <label className="check">
                            <input
                                type="checkbox"
                                checked={accepted[document.purpose] ?? false}
                                onChange={(e) => {
                                    setAccepted({ ...accepted, [document.purpose]: e.target.checked });
                                }}
                            />
                            {document.required ? 'Принимаю обязательный документ' : 'Разрешаю — необязательно'}
                        </label>
                    </div>
                ))}
                {status && (
                    <p className="form-message" role="alert">
                        {status}
                    </p>
                )}
                <div className="actions">
                    <button className="secondary-action" type="button" disabled={busy} onClick={() => void saveOnly()}>
                        Сохранить
                    </button>
                    <button
                        className="primary-action"
                        type="button"
                        disabled={busy || !online}
                        onClick={() => void complete()}
                    >
                        {busy ? 'Сохраняем…' : 'Завершить'}
                    </button>
                </div>
            </section>
        </main>
    );
}

export function TelegramAccount({
    client,
    initData,
    onSignedOut,
}: {
    readonly client: IdentityClient;
    readonly initData: string | undefined;
    readonly onSignedOut: () => void;
}) {
    const [items, setItems] = useState<components['schemas']['Identity'][]>([]);
    const [status, setStatus] = useState<string>();
    const [attempt, setAttempt] = useState<components['schemas']['IdentityAttempt']>();
    const [email, setEmail] = useState('');
    useEffect(() => {
        void client
            .getIdentities()
            .then((result) => {
                setItems([...result.items]);
            })
            .catch((error: unknown) => {
                setStatus(message(error));
            });
    }, [client]);
    async function logout() {
        try {
            await client.logoutAll();
            onSignedOut();
        } catch (error) {
            setStatus(message(error));
        }
    }
    async function startLink() {
        if (!initData) {
            setStatus('Переоткройте Mini App, чтобы получить свежее подтверждение Telegram.');
            return;
        }
        try {
            const started = await client.startIdentityAttempt({ action: 'LINK', targetProvider: 'EMAIL' });
            setAttempt(await client.proveTelegram(started.id, 'CURRENT', initData));
            setStatus('Telegram подтверждён. Теперь подтвердите новый email.');
        } catch (error) {
            setStatus(message(error));
        }
    }
    async function requestEmail() {
        if (!attempt || !emailSchema.safeParse(email).success) {
            setStatus('Введите корректный email.');
            return;
        }
        try {
            await client.requestEmailProof(attempt.id, attempt.action === 'LINK' ? 'TARGET' : 'CURRENT', email.trim());
            setStatus('Если адрес подходит, письмо придёт. Откройте ссылку в браузере на этом устройстве.');
        } catch (error) {
            setStatus(message(error));
        }
    }
    async function unlink(identity: components['schemas']['Identity']) {
        try {
            const started = await client.startIdentityAttempt({ action: 'UNLINK', identityId: identity.id });
            if (identity.provider === 'EMAIL') {
                if (!initData) {
                    setStatus('Переоткройте Mini App для свежего подтверждения Telegram.');
                    return;
                }
                const proof = await client.proveTelegram(started.id, 'CURRENT', initData);
                if (proof.status === 'READY') await client.unlinkIdentity(identity.id, { attemptId: started.id });
                const result = await client.getIdentities();
                setItems([...result.items]);
                setStatus('Email отвязан, прежние сессии отозваны.');
            } else {
                setAttempt(started);
                setStatus('Подтвердите оставшийся email одноразовой ссылкой.');
            }
        } catch (error) {
            setStatus(message(error));
        }
    }
    return (
        <main className="onboarding-main">
            <section className="onboarding-card">
                <p className="eyebrow">Безопасность</p>
                <h1>Способы входа</h1>
                <ul className="identity-list">
                    {items.map((item) => (
                        <li key={item.id}>
                            {item.provider === 'EMAIL' ? 'Email' : 'Telegram'}
                            {items.length > 1 ? (
                                <button className="text-button" type="button" onClick={() => void unlink(item)}>
                                    Отвязать
                                </button>
                            ) : (
                                <span>Подключён</span>
                            )}
                        </li>
                    ))}
                </ul>
                <p className="lead">
                    Для связывания или отвязывания нужны свежие подтверждения обоих способов. Переоткройте Mini App для
                    нового подтверждения Telegram.
                </p>
                {!items.some((item) => item.provider === 'EMAIL') && (
                    <button className="secondary-action" type="button" onClick={() => void startLink()}>
                        Добавить вход по email
                    </button>
                )}
                {attempt && (
                    <section className="proof-card" aria-labelledby="email-proof-title">
                        <h2 id="email-proof-title">Подтверждение email</h2>
                        <label>
                            Email
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => {
                                    setEmail(event.target.value);
                                }}
                            />
                        </label>
                        <button className="primary-action" type="button" onClick={() => void requestEmail()}>
                            Отправить одноразовую ссылку
                        </button>
                    </section>
                )}
                {status && <p role="alert">{status}</p>}
                <button className="danger-action" type="button" onClick={() => void logout()}>
                    Выйти на всех устройствах
                </button>
            </section>
        </main>
    );
}
