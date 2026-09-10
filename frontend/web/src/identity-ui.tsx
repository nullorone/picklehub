import { ApiError, type components, type IdentityClient } from '@picklehub/api-client';
import { disabledAnalytics } from '@picklehub/analytics';
import { emailSchema, onboardingFormSchema, type OnboardingForm } from '@picklehub/validation';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';

type Session = components['schemas']['AuthenticatedSession'];
type Onboarding = components['schemas']['Onboarding'];
type Documents = readonly components['schemas']['ConsentDocument'][];
type Options = components['schemas']['OnboardingOptions'];
type Locality = components['schemas']['Locality'];

function errorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        const code = error.response?.error.code;
        if (code === 'MAGIC_LINK_INVALID') return 'Ссылка недействительна. Запросите новую.';
        if (code === 'DRAFT_VERSION_CONFLICT' || code === 'CONSENT_VERSION_CHANGED') {
            return 'Данные изменились. Мы загрузим актуальную версию — проверьте её ещё раз.';
        }
        if (code === 'RATE_LIMITED') {
            return `Слишком много попыток. Повторите через ${String(error.retryAfterSeconds ?? 60)} сек.`;
        }
        if (code === 'AUTH_TEMPORARILY_UNAVAILABLE') return 'Вход временно недоступен. Попробуйте позже.';
        return error.response?.error.message ?? 'Не удалось выполнить запрос.';
    }
    return 'Нет связи с сервером. Проверьте подключение и повторите попытку.';
}

export function EmailLogin({
    client,
    online,
    onSession,
}: {
    readonly client: IdentityClient;
    readonly online: boolean;
    readonly onSession: (session: Session) => void;
}) {
    const [email, setEmail] = useState('');
    const [message, setMessage] = useState<string>();
    const [busy, setBusy] = useState(false);

    async function submit(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        const parsed = emailSchema.safeParse(email);
        if (!parsed.success) {
            setMessage(parsed.error.issues[0]?.message);
            return;
        }
        if (!online) {
            setMessage('Для отправки ссылки нужно подключение к интернету.');
            return;
        }
        setBusy(true);
        setMessage(undefined);
        try {
            const result = await client.requestMagicLink(parsed.data);
            setMessage((result as { readonly message: string }).message);
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }

    useEffect(() => {
        void client
            .bootstrap()
            .then(onSession)
            .catch(() => undefined);
    }, [client, onSession]);

    return (
        <main className="auth-layout">
            <section className="auth-card" aria-labelledby="login-title">
                <p className="eyebrow">Вход без пароля</p>
                <h1 id="login-title">Найдите свою игру</h1>
                <p className="lead">
                    Пришлём одноразовую ссылку. Ответ всегда одинаков и не раскрывает наличие аккаунта.
                </p>
                <form onSubmit={(event) => void submit(event)} noValidate>
                    <label htmlFor="email">Email</label>
                    <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(event) => {
                            setEmail(event.target.value);
                        }}
                    />
                    {message && (
                        <p className="form-message" role="status">
                            {message}
                        </p>
                    )}
                    <button className="primary-action block" type="submit" disabled={busy || !online}>
                        {busy ? 'Отправляем…' : 'Получить ссылку'}
                    </button>
                </form>
            </section>
        </main>
    );
}

export function MagicConfirmation({
    client,
    online,
    token,
    target,
    attemptId,
    identityId,
    onSession,
}: {
    readonly client: IdentityClient;
    readonly online: boolean;
    readonly token: string | undefined;
    readonly target: string;
    readonly attemptId: string | undefined;
    readonly identityId: string | undefined;
    readonly onSession: (session: Session) => void;
}) {
    const navigate = useNavigate();
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState(token ? undefined : 'Ссылка недействительна. Запросите новую.');
    async function confirm() {
        if (!token || !online) {
            setMessage('Для входа нужно подключение к интернету.');
            return;
        }
        setBusy(true);
        try {
            if (attemptId) {
                const session = await client.bootstrap();
                onSession(session);
                const proof = await client.consumeEmailProof(attemptId, token);
                if (proof.status === 'READY' && proof.action === 'LINK') {
                    onSession(await client.linkIdentity({ attemptId }));
                } else if (proof.status === 'READY' && proof.action === 'UNLINK' && identityId) {
                    onSession(await client.unlinkIdentity(identityId, { attemptId }));
                }
                await navigate('/account', { replace: true });
            } else {
                const session = await client.consumeMagicLink(token);
                onSession(session);
                await navigate(target, { replace: true });
            }
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setBusy(false);
        }
    }
    return (
        <main className="auth-layout">
            <section className="auth-card centered" aria-labelledby="confirm-title">
                <p className="eyebrow">Одноразовая ссылка</p>
                <h1 id="confirm-title">Подтвердите вход</h1>
                <p className="lead">Ссылка будет использована только после нажатия кнопки.</p>
                {message && (
                    <p className="form-message error" role="alert">
                        {message}
                    </p>
                )}
                <button
                    className="primary-action"
                    type="button"
                    onClick={() => void confirm()}
                    disabled={!token || busy || !online}
                >
                    {busy ? 'Проверяем…' : 'Войти в PickleHub'}
                </button>
                <Link className="text-action" to="/login">
                    Запросить новую ссылку
                </Link>
            </section>
        </main>
    );
}

function initialForm(onboarding: Onboarding): OnboardingForm {
    return {
        displayName: onboarding.draft.displayName ?? '',
        duprProfileUrl: onboarding.draft.duprProfileUrl ?? '',
        gameFormats: [...onboarding.draft.gameFormats],
        localityId: onboarding.draft.localityId ?? '',
        skillSelfAssessment: onboarding.draft.skillSelfAssessment ?? 2.5,
        timeZone: onboarding.draft.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
}

export function OnboardingScreen({
    client,
    online,
    onCompleted,
}: {
    readonly client: IdentityClient;
    readonly online: boolean;
    readonly onCompleted: () => void;
}) {
    const [data, setData] = useState<{
        onboarding: Onboarding;
        documents: Documents;
        options: Options;
        localities: readonly Locality[];
    }>();
    const [form, setForm] = useState<OnboardingForm>();
    const [accepted, setAccepted] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState<string>();
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const [onboarding, documents, options, localities] = await Promise.all([
                client.getOnboarding(),
                client.getDocuments(),
                client.getOnboardingOptions(),
                client.listLocalities(),
            ]);
            setData({ onboarding, documents: documents.items, options, localities: localities.items });
            setForm(initialForm(onboarding));
            setAccepted(
                Object.fromEntries(
                    documents.items.map((document) => [
                        document.purpose,
                        onboarding.consents.some(
                            (consent) =>
                                consent.purpose === document.purpose && consent.acceptedVersion === document.version
                        ),
                    ])
                )
            );
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }, [client]);
    useEffect(() => {
        void load();
    }, [load]);

    async function save(): Promise<Onboarding | undefined> {
        if (!form || !data) return undefined;
        if (!online) {
            setMessage('Изменения остались только на этом экране. Подключитесь к интернету, чтобы сохранить их.');
            disabledAnalytics.track({
                name: 'onboarding_error_shown',
                channel: 'web',
                reason: 'OFFLINE',
                step: 'PROFILE',
            });
            return undefined;
        }
        const parsed = onboardingFormSchema.safeParse(form);
        if (!parsed.success) {
            setMessage(parsed.error.issues[0]?.message);
            disabledAnalytics.track({
                name: 'onboarding_error_shown',
                channel: 'web',
                reason: 'VALIDATION',
                step: 'PROFILE',
            });
            return undefined;
        }
        if (parsed.data.duprProfileUrl && !data.options.duprLinksEnabled) {
            setMessage('Добавление ссылки DUPR пока недоступно. Оставьте поле пустым.');
            return undefined;
        }
        const saved = await client.updateOnboarding({
            ...parsed.data,
            duprProfileUrl: parsed.data.duprProfileUrl || null,
            expectedVersion: data.onboarding.draft.version,
            skillSelfAssessment: parsed.data.skillSelfAssessment as components['schemas']['SkillLevel'],
        });
        setData({ ...data, onboarding: saved });
        setForm(initialForm(saved));
        return saved;
    }

    async function saveOnly() {
        setBusy(true);
        setMessage(undefined);
        try {
            if (await save()) setMessage('Черновик сохранён. Можно продолжить позже.');
        } catch (error) {
            setMessage(errorMessage(error));
            await load();
        } finally {
            setBusy(false);
        }
    }

    async function complete() {
        if (!data) return;
        setBusy(true);
        setMessage(undefined);
        try {
            let current = await save();
            if (!current) return;
            const required = data.documents.filter((document) => document.required);
            if (required.some((document) => !accepted[document.purpose])) {
                setMessage('Примите каждый обязательный документ отдельно.');
                return;
            }
            for (const document of data.documents) {
                if (accepted[document.purpose]) {
                    await client.changeConsent({
                        action: 'ACCEPTED',
                        purpose: document.purpose,
                        version: document.version,
                    });
                }
            }
            const terms = required.find((document) => document.purpose === 'TERMS');
            const personal = required.find((document) => document.purpose === 'PERSONAL_DATA');
            if (!terms || !personal) throw new Error('Required documents are unavailable');
            current = await client.completeOnboarding(current.draft.version, terms.version, personal.version);
            if (current.draft.status === 'COMPLETED') onCompleted();
        } catch (error) {
            setMessage(errorMessage(error));
            await load();
        } finally {
            setBusy(false);
        }
    }

    if (!data || !form)
        return (
            <main className="state-card centered">
                <h1>Загружаем настройку…</h1>
                {message && <p role="alert">{message}</p>}
            </main>
        );
    return (
        <main className="onboarding-layout">
            <section className="onboarding-card" aria-labelledby="onboarding-title">
                <p className="eyebrow">Шаг 1 из 1 · черновик сохраняется</p>
                <h1 id="onboarding-title">Расскажите, как вы играете</h1>
                <p className="lead">Имя, город, форматы, самооценка и ссылка DUPR будут публичными после завершения.</p>
                <div className="form-grid">
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
                            {data.options.supportedTimeZones.map((zone) => (
                                <option key={zone}>{zone}</option>
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
                            {data.localities.map((item) => (
                                <option value={item.id} key={item.id}>
                                    {item.name}, {item.region}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        Самооценка уровня
                        <select
                            value={String(form.skillSelfAssessment)}
                            onChange={(e) => {
                                setForm({ ...form, skillSelfAssessment: e.target.value });
                            }}
                        >
                            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((level) => (
                                <option value={level} key={level}>
                                    {level.toFixed(1)} — самооценка
                                </option>
                            ))}
                        </select>
                    </label>
                </div>
                <fieldset>
                    <legend>Предпочтительные форматы</legend>
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
                            {format === 'SINGLES' ? 'Одиночная игра 1×1' : 'Парная игра 2×2'}
                        </label>
                    ))}
                </fieldset>
                <label>
                    Ссылка на профиль DUPR — необязательно
                    <input
                        type="url"
                        disabled={!data.options.duprLinksEnabled}
                        placeholder={data.options.duprLinksEnabled ? 'https://…' : 'Пока недоступно'}
                        value={form.duprProfileUrl}
                        onChange={(e) => {
                            setForm({ ...form, duprProfileUrl: e.target.value });
                        }}
                    />
                </label>
                <section className="documents" aria-labelledby="documents-title">
                    <h2 id="documents-title">Согласия</h2>
                    {data.documents.map((document) => (
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
                </section>
                {message && (
                    <p className="form-message" role="alert">
                        {message}
                    </p>
                )}
                <div className="action-row">
                    <button className="secondary-action" type="button" disabled={busy} onClick={() => void saveOnly()}>
                        Сохранить черновик
                    </button>
                    <button
                        className="primary-action"
                        type="button"
                        disabled={busy || !online}
                        onClick={() => void complete()}
                    >
                        {busy ? 'Сохраняем…' : 'Завершить настройку'}
                    </button>
                </div>
            </section>
        </main>
    );
}

export function AccountScreen({
    client,
    onSignedOut,
}: {
    readonly client: IdentityClient;
    readonly onSignedOut: () => void;
}) {
    const [identities, setIdentities] = useState<components['schemas']['Identity'][]>([]);
    const [message, setMessage] = useState<string>();
    const [attempt, setAttempt] = useState<components['schemas']['IdentityAttempt']>();
    const [targetIdentity, setTargetIdentity] = useState<string>();
    const [email, setEmail] = useState('');
    const [proofToken, setProofToken] = useState('');
    const emailProofAvailable =
        attempt?.action === 'LINK' ||
        (attempt?.action === 'UNLINK' &&
            identities.find((identity) => identity.id === targetIdentity)?.provider === 'TELEGRAM');
    useEffect(() => {
        void client
            .getIdentities()
            .then((result) => {
                setIdentities([...result.items]);
            })
            .catch((error: unknown) => {
                setMessage(errorMessage(error));
            });
    }, [client]);
    async function logoutAll() {
        try {
            await client.logoutAll();
            onSignedOut();
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }
    async function reload() {
        const result = await client.getIdentities();
        setIdentities([...result.items]);
        setAttempt(undefined);
    }
    async function startLink() {
        try {
            setMessage(undefined);
            setTargetIdentity(undefined);
            setAttempt(await client.startIdentityAttempt({ action: 'LINK', targetProvider: 'EMAIL' }));
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }
    async function startUnlink(identityId: string) {
        try {
            setMessage(undefined);
            setTargetIdentity(identityId);
            setAttempt(await client.startIdentityAttempt({ action: 'UNLINK', identityId }));
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }
    async function requestProof() {
        if (!attempt) return;
        const parsed = emailSchema.safeParse(email);
        if (!parsed.success) {
            setMessage(parsed.error.issues[0]?.message);
            return;
        }
        try {
            await client.requestEmailProof(attempt.id, attempt.action === 'LINK' ? 'TARGET' : 'CURRENT', parsed.data);
            setMessage('Если адрес подходит, письмо придёт в ближайшее время. Откройте его в этом браузере.');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }
    async function consumeProof() {
        if (!attempt || !/^[A-Za-z0-9_-]{43}$/u.test(proofToken)) {
            setMessage('Введите токен из ссылки.');
            return;
        }
        try {
            setAttempt(await client.consumeEmailProof(attempt.id, proofToken));
            setMessage('Email подтверждён.');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }
    async function finish() {
        if (!attempt) return;
        try {
            if (attempt.action === 'LINK') await client.linkIdentity({ attemptId: attempt.id });
            else if (targetIdentity) await client.unlinkIdentity(targetIdentity, { attemptId: attempt.id });
            await reload();
            setMessage('Способы входа обновлены. Все прежние сессии отозваны.');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }
    return (
        <main className="onboarding-layout">
            <section className="onboarding-card">
                <p className="eyebrow">Безопасность</p>
                <h1>Способы входа</h1>
                <ul className="identity-list">
                    {identities.map((identity) => (
                        <li key={identity.id}>
                            <span>{identity.provider === 'EMAIL' ? 'Email' : 'Telegram'}</span>
                            {identities.length > 1 ? (
                                <button
                                    className="text-button"
                                    type="button"
                                    onClick={() => void startUnlink(identity.id)}
                                >
                                    Отвязать
                                </button>
                            ) : (
                                <span>Подключён</span>
                            )}
                        </li>
                    ))}
                </ul>
                {!identities.some((identity) => identity.provider === 'EMAIL') && (
                    <button className="secondary-action" type="button" onClick={() => void startLink()}>
                        Добавить вход по email
                    </button>
                )}
                {attempt && (
                    <section className="proof-card" aria-labelledby="proof-title">
                        <h2 id="proof-title">Подтверждение операции</h2>
                        <p className="hint">
                            Для связывания нужны подтверждения текущего и нового способов. Telegram подтверждается в
                            Mini App после повторного открытия; email — одноразовой ссылкой.
                        </p>
                        {emailProofAvailable ? (
                            <>
                                <label>
                                    Email для подтверждения
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(event) => {
                                            setEmail(event.target.value);
                                        }}
                                    />
                                </label>
                                <button className="secondary-action" type="button" onClick={() => void requestProof()}>
                                    Отправить ссылку
                                </button>
                                <label>
                                    Токен из ссылки, если она открыта на другом устройстве
                                    <input
                                        value={proofToken}
                                        onChange={(event) => {
                                            setProofToken(event.target.value);
                                        }}
                                    />
                                </label>
                                <button className="secondary-action" type="button" onClick={() => void consumeProof()}>
                                    Подтвердить email
                                </button>
                            </>
                        ) : (
                            <p className="hint">
                                Для подтверждения оставшегося Telegram откройте управление аккаунтом в TMA.
                            </p>
                        )}
                        {attempt.status === 'READY' && (
                            <button className="primary-action" type="button" onClick={() => void finish()}>
                                Завершить операцию
                            </button>
                        )}
                    </section>
                )}
                {message && <p role="alert">{message}</p>}
                <button className="danger-action" type="button" onClick={() => void logoutAll()}>
                    Выйти на всех устройствах
                </button>
            </section>
        </main>
    );
}
