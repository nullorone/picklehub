import { ApiError, type components, type IdentityClient } from '@picklehub/api-client';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

type Receipt = components['schemas']['SafetyReceipt'];
type ReportSubmission = components['schemas']['ReportSubmission'];

const kindLabels: Record<Receipt['kind'], string> = {
    CONTENT: 'Контент',
    NO_SHOW: 'Неявка',
    RESULT: 'Результат',
    SAFETY: 'Безопасность',
    VENUE: 'Площадка',
};
const statusLabels: Record<Receipt['status'], string> = {
    IN_REVIEW: 'На рассмотрении',
    RECEIVED: 'Получено',
    RESOLVED: 'Рассмотрено',
};

function safetyError(error: unknown): string {
    if (!(error instanceof ApiError)) return 'Не удалось выполнить действие. Попробуйте ещё раз.';
    const code = error.response?.error.code;
    if (code === 'SUBMISSION_WINDOW_CLOSED') return 'Срок отправки истёк.';
    if (code === 'REPORT_NOT_ELIGIBLE') return 'Для этого контекста обращение недоступно.';
    if (code === 'APPEAL_ALREADY_SUBMITTED') return 'Апелляция уже отправлена.';
    if (code === 'INTERACTION_NOT_ALLOWED') return 'Действие недоступно.';
    if (code === 'RATE_LIMITED') return 'Слишком много попыток. Повторите позже.';
    if (code === 'SAFETY_WRITE_UNAVAILABLE') return 'Сервис временно недоступен. Обращение не отправлено.';
    return 'Не удалось выполнить действие. Попробуйте ещё раз.';
}

function useMutationKeys() {
    const keys = useRef(new Map<string, string>());
    return {
        clear: (action: string) => keys.current.delete(action),
        get: (action: string) => {
            const current = keys.current.get(action);
            if (current) return current;
            const next = crypto.randomUUID();
            keys.current.set(action, next);
            return next;
        },
    };
}

function EmergencyNotice() {
    return (
        <aside className="emergency-notice" role="note" aria-labelledby="emergency-title">
            <h2 id="emergency-title">Если опасность непосредственная</h2>
            <p>
                Позвоните 112 или в местную экстренную службу. PickleHub не является экстренной службой и не гарантирует
                немедленный ответ.
            </p>
        </aside>
    );
}

function ReceiptCard({ receipt }: { readonly receipt: Receipt }) {
    return (
        <article className="safety-receipt-card">
            <div>
                <strong>{kindLabels[receipt.kind]}</strong>
                <span className="safety-status">{statusLabels[receipt.status]}</span>
            </div>
            <p>Квитанция {receipt.receiptId}</p>
            {receipt.status === 'RESOLVED' && (
                <p>{receipt.outcomeReason ?? 'Рассмотрение завершено. Подробности о других людях не раскрываются.'}</p>
            )}
            <Link to={`/safety/reports/${receipt.receiptId}`}>Открыть статус</Link>
        </article>
    );
}

export function SafetyCenterScreen({ client, online }: { readonly client: IdentityClient; readonly online: boolean }) {
    const [receipts, setReceipts] = useState<readonly Receipt[]>();
    const [blocks, setBlocks] = useState<readonly components['schemas']['UserBlock'][] | undefined>();
    const [blocksMessage, setBlocksMessage] = useState<string>();
    const [message, setMessage] = useState<string>();
    useEffect(() => {
        let active = true;
        void Promise.allSettled([client.listOwnSafetyReports(undefined, 50), client.listOwnBlocks(undefined, 50)]).then(
            ([receiptResult, blockResult]) => {
                if (!active) return;
                if (receiptResult.status === 'fulfilled') setReceipts(receiptResult.value.items);
                else setMessage(safetyError(receiptResult.reason));
                if (blockResult.status === 'fulfilled') setBlocks(blockResult.value.items);
                else setBlocksMessage('Не удалось загрузить список блокировок.');
            }
        );
        return () => {
            active = false;
        };
    }, [client]);
    return (
        <main className="safety-main" data-ad-free="true">
            <header>
                <p className="eyebrow">Помощь и контроль</p>
                <h1>Безопасность</h1>
                <p>Здесь видны только ваши квитанции. Мы не обещаем результат или срок рассмотрения.</p>
            </header>
            {!online && <p role="status">Нет сети. Загруженные статусы можно читать, новые действия недоступны.</p>}
            <EmergencyNotice />
            {message && (
                <p className="form-message" role="alert">
                    {message}
                </p>
            )}
            <section className="safety-section" aria-labelledby="reports-title">
                <div className="section-heading">
                    <h2 id="reports-title">Мои обращения</h2>
                </div>
                <p>Новое обращение открывается из нужного матча, сообщения, результата или площадки.</p>
                {!receipts && !message && <p role="status">Загружаем квитанции…</p>}
                {receipts?.length === 0 && <p>Обращений пока нет.</p>}
                <div className="safety-receipts">
                    {receipts?.map((item) => (
                        <ReceiptCard key={item.receiptId} receipt={item} />
                    ))}
                </div>
            </section>
            <section className="safety-section" aria-labelledby="blocks-title">
                <h2 id="blocks-title">Заблокированные игроки</h2>
                {!blocks && !blocksMessage && <p role="status">Загружаем список…</p>}
                {blocksMessage && <p role="alert">{blocksMessage}</p>}
                {blocks &&
                    (blocks.length === 0 ? (
                        <p>Вы никого не блокировали.</p>
                    ) : (
                        <ul className="action-list">
                            {blocks.map((block) => (
                                <li key={block.blockedUserId}>
                                    <span>Игрок {block.blockedUserId}</span>
                                    <Link to={`/players/${block.blockedUserId}`}>Управлять</Link>
                                </li>
                            ))}
                        </ul>
                    ))}
            </section>
        </main>
    );
}

export function SafetyReceiptScreen({ client, online }: { readonly client: IdentityClient; readonly online: boolean }) {
    const { receiptId = '' } = useParams();
    const [detail, setDetail] = useState<components['schemas']['OwnSafetyReportDetail']>();
    const [text, setText] = useState('');
    const [appealReason, setAppealReason] =
        useState<components['schemas']['AppealSubmission']['reason']>('FACTUAL_ERROR');
    const [message, setMessage] = useState<string>();
    const [busy, setBusy] = useState(false);
    const feedbackRef = useRef<HTMLDivElement>(null);
    const keys = useMutationKeys();
    const load = useCallback(() => {
        setMessage(undefined);
        return client
            .getOwnSafetyReport(receiptId)
            .then(setDetail)
            .catch((error: unknown) => {
                setMessage(safetyError(error));
            });
    }, [client, receiptId]);
    useEffect(() => void load(), [load]);
    useEffect(() => feedbackRef.current?.focus(), [message]);
    async function mutate(
        action: 'appeal' | 'respond' | 'withdraw',
        operation: (key: string) => Promise<Receipt>,
        success: string
    ) {
        if (!online || busy) return;
        setBusy(true);
        try {
            await operation(keys.get(action));
            keys.clear(action);
            await load();
            setMessage(success);
        } catch (error) {
            setMessage(safetyError(error));
        } finally {
            setText('');
            setBusy(false);
        }
    }
    if (!detail && !message)
        return (
            <main className="safety-main narrow" data-ad-free="true">
                <p role="status">Загружаем квитанцию…</p>
            </main>
        );
    return (
        <main className="safety-main narrow" data-ad-free="true">
            <Link to="/safety">← К моим обращениям</Link>
            <h1>Статус обращения</h1>
            {!online && <p role="status">Нет сети. Новые действия недоступны.</p>}
            {detail && (
                <>
                    <ReceiptCard receipt={detail.receipt} />
                    {detail.submittedEvidence && (
                        <section className="restricted-copy">
                            <h2>Отправленные вами сведения</h2>
                            <p>{detail.submittedEvidence}</p>
                            <p className="field-help">Эта копия доступна только вам и назначенным сотрудникам.</p>
                        </section>
                    )}
                    {detail.receipt.canRespond && (
                        <form
                            className="safety-form"
                            onSubmit={(event) => {
                                event.preventDefault();
                                if (!text.trim()) {
                                    setMessage('Добавьте краткий ответ.');
                                    return;
                                }
                                void mutate(
                                    'respond',
                                    (key) => client.respondToSafetyCase(receiptId, { text: text.trim() }, key),
                                    'Ответ получен.'
                                );
                            }}
                        >
                            <h2>Ответить на запрос</h2>
                            <label>
                                Ваш ответ
                                <textarea
                                    maxLength={2000}
                                    value={text}
                                    onChange={(event) => {
                                        setText(event.target.value);
                                    }}
                                />
                            </label>
                            <p className="field-help">Ответ видят только вы и назначенные сотрудники.</p>
                            <button className="primary-action" disabled={!online || busy} type="submit">
                                Отправить ответ
                            </button>
                        </form>
                    )}
                    {detail.receipt.canAppeal && (
                        <form
                            className="safety-form"
                            onSubmit={(event) => {
                                event.preventDefault();
                                void mutate(
                                    'appeal',
                                    (key) =>
                                        client.appealSafetyDecision(
                                            receiptId,
                                            { reason: appealReason, ...(text.trim() ? { text: text.trim() } : {}) },
                                            key
                                        ),
                                    'Апелляция получена. Её рассмотрит другой сотрудник.'
                                );
                            }}
                        >
                            <h2>Подать апелляцию</h2>
                            <label>
                                Основание
                                <select
                                    value={appealReason}
                                    onChange={(event) => {
                                        setAppealReason(event.target.value as typeof appealReason);
                                    }}
                                >
                                    <option value="FACTUAL_ERROR">Ошибка в фактах</option>
                                    <option value="POLICY_MISAPPLIED">Неверно применено правило</option>
                                    <option value="NEW_INFORMATION">Новая информация</option>
                                    <option value="OTHER">Другое</option>
                                </select>
                            </label>
                            <label>
                                Дополнение — необязательно
                                <textarea
                                    maxLength={2000}
                                    value={text}
                                    onChange={(event) => {
                                        setText(event.target.value);
                                    }}
                                />
                            </label>
                            <button className="primary-action" disabled={!online || busy} type="submit">
                                Отправить апелляцию
                            </button>
                        </form>
                    )}
                    {detail.receipt.canWithdraw && (
                        <section className="safety-section">
                            <h2>Отозвать обращение</h2>
                            <p>
                                Запрос на отзыв не удаляет запись и может не остановить обязательную проверку
                                безопасности.
                            </p>
                            <button
                                className="secondary-action"
                                disabled={!online || busy}
                                onClick={() =>
                                    void mutate(
                                        'withdraw',
                                        (key) => client.requestSafetyReportWithdrawal(receiptId, key),
                                        'Запрос на отзыв получен.'
                                    )
                                }
                            >
                                Запросить отзыв
                            </button>
                        </section>
                    )}
                </>
            )}
            {message && (
                <div ref={feedbackRef} tabIndex={-1} className="form-message" role="status">
                    {message}
                </div>
            )}
        </main>
    );
}

const reasonOptions = {
    CONTENT: [
        ['SPAM', 'Спам'],
        ['HARASSMENT', 'Оскорбления или травля'],
        ['HATE', 'Ненависть'],
        ['THREAT', 'Угроза'],
        ['OTHER', 'Другое'],
    ],
    RESULT: [
        ['WRONG_SCORE', 'Неверный счёт'],
        ['WRONG_WINNER', 'Неверный победитель'],
        ['MATCH_NOT_PLAYED', 'Матч не состоялся'],
        ['OTHER', 'Другое'],
    ],
    SAFETY: [
        ['THREAT', 'Угроза'],
        ['HARASSMENT', 'Преследование или травля'],
        ['HATE_OR_DISCRIMINATION', 'Ненависть или дискриминация'],
        ['STALKING', 'Навязчивое преследование'],
        ['PHYSICAL_SAFETY', 'Физическая безопасность'],
        ['OTHER_SAFETY', 'Другая проблема безопасности'],
    ],
    VENUE: [
        ['PRIVATE_RESIDENCE', 'Частный адрес'],
        ['DUPLICATE', 'Дубликат'],
        ['CLOSED', 'Площадка закрыта'],
    ],
} as const;

export function SafetyReportScreen({ client, online }: { readonly client: IdentityClient; readonly online: boolean }) {
    const [search] = useSearchParams();
    const sourceKind = search.get('sourceKind') ?? 'PROFILE';
    const sourceId = search.get('sourceId') ?? '';
    const subjectPlayerId = search.get('subjectPlayerId') ?? undefined;
    const sourceRevision = Number(search.get('sourceRevision') ?? '1');
    const initialKind = sourceKind === 'VENUE' ? 'VENUE' : sourceKind === 'MATCH_RESULT' ? 'RESULT' : 'SAFETY';
    const [kind, setKind] = useState<keyof typeof reasonOptions>(initialKind);
    const [reason, setReason] = useState<string>(reasonOptions[initialKind][0][0]);
    const [evidence, setEvidence] = useState('');
    const [timeBucket, setTimeBucket] = useState<components['schemas']['ReportTimeBucket']>('TODAY');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string>();
    const [receipt, setReceipt] = useState<Receipt>();
    const feedbackRef = useRef<HTMLDivElement>(null);
    const keys = useMutationKeys();

    useEffect(() => {
        if (message || receipt) feedbackRef.current?.focus();
    }, [message, receipt]);

    async function submit(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        setMessage(undefined);
        if (!online) {
            setMessage('Для отправки нужно подключение к интернету. Обращение не отправлено.');
            return;
        }
        if (!sourceId || !Number.isInteger(sourceRevision) || sourceRevision < 1) {
            setMessage('Откройте форму из матча, чата, профиля, результата или площадки.');
            return;
        }
        setBusy(true);
        const common = { sourceId, sourceRevision };
        const optionalEvidence = evidence.trim() ? { evidence: evidence.trim() } : {};
        let body: ReportSubmission;
        if (kind === 'SAFETY') {
            body = {
                ...common,
                ...optionalEvidence,
                kind,
                reason: reason as components['schemas']['SafetyReason'],
                sourceKind: sourceKind as components['schemas']['ReportSourceKind'],
                ...(subjectPlayerId ? { subjectPlayerId } : {}),
                timeBucket,
            };
        } else if (kind === 'CONTENT') {
            body = {
                ...common,
                ...optionalEvidence,
                kind,
                reason: reason as components['schemas']['ContentReportReason'],
                sourceKind: sourceKind as 'CHAT_MESSAGE' | 'MATCH' | 'PROFILE',
            };
        } else if (kind === 'VENUE') {
            body = {
                ...common,
                ...optionalEvidence,
                kind,
                reason: reason as components['schemas']['TrustVenueReportReason'],
                sourceKind: 'VENUE',
            };
        } else {
            body = {
                ...common,
                ...optionalEvidence,
                kind,
                reason: reason as components['schemas']['ResultReportReason'],
                sourceKind: 'MATCH_RESULT',
            };
        }
        try {
            const value = await client.submitSafetyReport(body, keys.get('report'));
            keys.clear('report');
            setReceipt(value);
        } catch (error) {
            setMessage(safetyError(error));
        } finally {
            setEvidence('');
            setBusy(false);
        }
    }

    if (receipt)
        return (
            <main className="safety-main narrow" data-ad-free="true">
                <div ref={feedbackRef} tabIndex={-1} className="success-card" role="status">
                    <h1>Обращение получено</h1>
                    <p>Квитанция сохранена. Это не обещание результата или срока рассмотрения.</p>
                    <ReceiptCard receipt={receipt} />
                </div>
            </main>
        );
    return (
        <main className="safety-main narrow" data-ad-free="true">
            <Link to="/safety">← К моим обращениям</Link>
            <h1>Сообщить о проблеме</h1>
            <EmergencyNotice />
            <form className="safety-form" onSubmit={(event) => void submit(event)} noValidate>
                <label>
                    Категория
                    <select
                        value={kind}
                        onChange={(event) => {
                            const next = event.target.value as keyof typeof reasonOptions;
                            setKind(next);
                            setReason(reasonOptions[next][0][0]);
                        }}
                    >
                        <option value="SAFETY">Безопасность</option>
                        {(['CHAT_MESSAGE', 'MATCH', 'PROFILE'].includes(sourceKind) || !sourceId) && (
                            <option value="CONTENT">Контент</option>
                        )}
                        {(sourceKind === 'VENUE' || !sourceId) && <option value="VENUE">Площадка</option>}
                        {(sourceKind === 'MATCH_RESULT' || !sourceId) && <option value="RESULT">Результат</option>}
                    </select>
                </label>
                <label>
                    Что произошло
                    <select
                        value={reason}
                        onChange={(event) => {
                            setReason(event.target.value);
                        }}
                    >
                        {reasonOptions[kind].map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
                {kind === 'SAFETY' && (
                    <label>
                        Когда
                        <select
                            value={timeBucket}
                            onChange={(event) => {
                                setTimeBucket(event.target.value as typeof timeBucket);
                            }}
                        >
                            <option value="NOW">Сейчас</option>
                            <option value="TODAY">Сегодня</option>
                            <option value="LAST_7_DAYS">За последние 7 дней</option>
                            <option value="LAST_30_DAYS">За последние 30 дней</option>
                            <option value="OVER_30_DAYS">Более 30 дней назад</option>
                        </select>
                    </label>
                )}
                <label>
                    Дополнительные сведения — необязательно
                    <textarea
                        maxLength={2000}
                        value={evidence}
                        onChange={(event) => {
                            setEvidence(event.target.value);
                        }}
                        aria-describedby="evidence-help"
                    />
                </label>
                <p id="evidence-help" className="field-help">
                    Пишите только необходимое. Текст увидят назначенные сотрудники; он не попадает в аналитику и отчёты
                    об ошибках. Не добавляйте документы, контакты и точные перемещения.
                </p>
                <button className="danger-action" disabled={!online || busy} type="submit">
                    {busy ? 'Отправляем…' : 'Отправить обращение'}
                </button>
            </form>
            {(Boolean(message) || !sourceId) && (
                <div ref={feedbackRef} tabIndex={-1} className="form-message" role="alert">
                    {message ?? 'Откройте эту форму из нужного матча, чата, профиля, результата или площадки.'}
                </div>
            )}
        </main>
    );
}

export function MatchFeedbackScreen({ client, online }: { readonly client: IdentityClient; readonly online: boolean }) {
    const { matchId = '', subjectPlayerId = '' } = useParams();
    const [rating, setRating] = useState(5);
    const [tags, setTags] = useState<components['schemas']['ReviewTag'][]>([]);
    const [reviewText, setReviewText] = useState('');
    const [noShowReason, setNoShowReason] = useState<components['schemas']['NoShowReason']>('DID_NOT_ARRIVE');
    const [evidence, setEvidence] = useState('');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string>();
    const [receipt, setReceipt] = useState<Receipt>();
    const feedbackRef = useRef<HTMLDivElement>(null);
    const keys = useMutationKeys();
    useEffect(() => feedbackRef.current?.focus(), [message, receipt]);

    async function sendReview(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!online || busy) return;
        setMessage(undefined);
        setReceipt(undefined);
        setBusy(true);
        try {
            await client.submitMatchReview(
                matchId,
                subjectPlayerId,
                { experienceRating: rating, tags, ...(reviewText.trim() ? { text: reviewText.trim() } : {}) },
                keys.get('review')
            );
            keys.clear('review');
            setMessage('Отзыв сохранён. Он не публикует текст или обвинения.');
        } catch (error) {
            setMessage(safetyError(error));
        } finally {
            setReviewText('');
            setBusy(false);
        }
    }

    async function sendNoShow(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!online || busy) return;
        setMessage(undefined);
        setReceipt(undefined);
        setBusy(true);
        try {
            const value = await client.submitNoShowReport(
                matchId,
                { reason: noShowReason, subjectPlayerId, ...(evidence.trim() ? { evidence: evidence.trim() } : {}) },
                keys.get('no-show')
            );
            keys.clear('no-show');
            setReceipt(value);
        } catch (error) {
            setMessage(safetyError(error));
        } finally {
            setEvidence('');
            setBusy(false);
        }
    }

    return (
        <main className="safety-main narrow" data-ad-free="true">
            <Link to={`/matches/${matchId}`}>← К матчу</Link>
            <h1>После матча</h1>
            {!online && <p role="status">Для отправки нужно подключение к интернету.</p>}
            <section className="safety-section">
                <h2>Оставить отзыв</h2>
                <p>Оценка учитывается только агрегированно. Текст и теги не публикуются.</p>
                <form className="safety-form" onSubmit={(event) => void sendReview(event)}>
                    <label>
                        Впечатление от игры
                        <select
                            value={rating}
                            onChange={(event) => {
                                setRating(Number(event.target.value));
                            }}
                        >
                            {[5, 4, 3, 2, 1].map((value) => (
                                <option key={value} value={value}>
                                    {value} из 5
                                </option>
                            ))}
                        </select>
                    </label>
                    <fieldset>
                        <legend>Что отметить — необязательно</legend>
                        {(
                            [
                                ['RESPECT', 'Уважение'],
                                ['COMMUNICATION', 'Общение'],
                                ['FAIR_PLAY', 'Честная игра'],
                            ] as const
                        ).map(([value, label]) => (
                            <label className="check" key={value}>
                                <input
                                    type="checkbox"
                                    checked={tags.includes(value)}
                                    onChange={(event) => {
                                        setTags((current) =>
                                            event.target.checked
                                                ? [...current, value]
                                                : current.filter((item) => item !== value)
                                        );
                                    }}
                                />
                                <span>{label}</span>
                            </label>
                        ))}
                    </fieldset>
                    <label>
                        Комментарий — необязательно
                        <textarea
                            maxLength={500}
                            value={reviewText}
                            onChange={(event) => {
                                setReviewText(event.target.value);
                            }}
                        />
                    </label>
                    <p className="field-help">Комментарий видят только уполномоченные сотрудники.</p>
                    <button className="primary-action" disabled={!online || busy} type="submit">
                        Сохранить отзыв
                    </button>
                </form>
            </section>
            <section className="safety-section">
                <h2>Сообщить о возможной неявке</h2>
                <p>Сообщение само по себе не меняет репутацию или статистику игрока.</p>
                <form className="safety-form" onSubmit={(event) => void sendNoShow(event)}>
                    <label>
                        Что произошло
                        <select
                            value={noShowReason}
                            onChange={(event) => {
                                setNoShowReason(event.target.value as typeof noShowReason);
                            }}
                        >
                            <option value="DID_NOT_ARRIVE">Не пришёл</option>
                            <option value="LEFT_BEFORE_PLAY">Ушёл до игры</option>
                            <option value="UNREACHABLE_AT_START">Не отвечал к началу</option>
                        </select>
                    </label>
                    <label>
                        Дополнительные сведения — необязательно
                        <textarea
                            maxLength={2000}
                            value={evidence}
                            onChange={(event) => {
                                setEvidence(event.target.value);
                            }}
                        />
                    </label>
                    <p className="field-help">
                        Текст увидят только назначенные сотрудники. Укажите минимум необходимого.
                    </p>
                    <button className="danger-action" disabled={!online || busy} type="submit">
                        Отправить отметку
                    </button>
                </form>
            </section>
            {(Boolean(message) || receipt !== undefined) && (
                <div ref={feedbackRef} tabIndex={-1} className="form-message" role="status">
                    {message ?? 'Отметка получена. Решение и срок рассмотрения не гарантируются.'}
                    {receipt && <ReceiptCard receipt={receipt} />}
                </div>
            )}
        </main>
    );
}

export function PlayerSafetyActions({
    client,
    online,
    playerId,
}: {
    readonly client: IdentityClient;
    readonly online: boolean;
    readonly playerId: string;
}) {
    const [blocked, setBlocked] = useState<boolean>();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string>();
    const dialogTitle = useRef<HTMLHeadingElement>(null);
    const blockTrigger = useRef<HTMLButtonElement>(null);
    const keys = useMutationKeys();
    useEffect(() => {
        const listOwnBlocks = (client as Partial<IdentityClient>).listOwnBlocks;
        if (!listOwnBlocks) return;
        listOwnBlocks(undefined, 100)
            .then((page) => {
                setBlocked(page.items.some((item) => item.blockedUserId === playerId));
            })
            .catch(() => {
                setMessage('Не удалось проверить состояние блокировки. Прямые действия временно скрыты.');
            });
    }, [client, playerId]);
    useEffect(() => {
        if (!confirming) return undefined;
        dialogTitle.current?.focus();
        const trigger = blockTrigger.current;
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setConfirming(false);
        };
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('keydown', closeOnEscape);
            trigger?.focus();
        };
    }, [confirming]);
    async function toggle() {
        if (!online || busy || blocked === undefined) return;
        setBusy(true);
        try {
            if (blocked) await client.unblockCommunicationUser(playerId, keys.get('unblock'));
            else await client.blockCommunicationUser(playerId, keys.get('block'));
            keys.clear(blocked ? 'unblock' : 'block');
            setBlocked(!blocked);
            setMessage(
                blocked
                    ? 'Игрок разблокирован. Прошлые заявки и сообщения не восстановлены.'
                    : 'Игрок заблокирован. Новые прямые взаимодействия скрыты в обе стороны.'
            );
        } catch (error) {
            setMessage(safetyError(error));
        } finally {
            setBusy(false);
            setConfirming(false);
        }
    }
    return (
        <section className="safety-section player-safety-actions" data-blocked={blocked}>
            <h2>Безопасность</h2>
            {blocked === undefined ? (
                <p>Проверяем состояние блокировки…</p>
            ) : blocked ? (
                <>
                    <p>Игрок заблокирован. Факты общих матчей и история сохранены, новые прямые действия скрыты.</p>
                    <button className="secondary-action" disabled={!online || busy} onClick={() => void toggle()}>
                        Разблокировать
                    </button>
                </>
            ) : (
                <div className="profile-actions">
                    <button
                        ref={blockTrigger}
                        className="danger-action"
                        disabled={!online || busy}
                        onClick={() => {
                            setConfirming(true);
                        }}
                    >
                        Заблокировать
                    </button>
                </div>
            )}
            {message && (
                <p className="form-message" role="status">
                    {message}
                </p>
            )}
            {confirming && (
                <div className="dialog-backdrop">
                    <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="block-title">
                        <h2 id="block-title" ref={dialogTitle} tabIndex={-1}>
                            Заблокировать игрока?
                        </h2>
                        <p>
                            Вы не увидите друг друга в поиске и не сможете отправлять новые заявки, приглашения и
                            сообщения. Общие матчи и системные факты сохранятся.
                        </p>
                        <div className="dialog-actions">
                            <button
                                autoFocus
                                type="button"
                                onClick={() => {
                                    setConfirming(false);
                                }}
                            >
                                Отмена
                            </button>
                            <button className="danger-action" type="button" onClick={() => void toggle()}>
                                Заблокировать
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </section>
    );
}
