import { ApiError, type components } from '@picklehub/api-client';
import type { RuntimeConfig } from '@picklehub/validation';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';

import { createAdminClient, type AdminClient } from './admin-client';

type AdminSession = components['schemas']['AdminSessionContext'];
type Capability = components['schemas']['AdminCapability'];
type Reason = components['schemas']['AdminReasonCode'];

const reasons: readonly [Reason, string][] = [
    ['POLICY_VIOLATION', 'Нарушение правил'],
    ['USER_SAFETY', 'Безопасность пользователя'],
    ['DUPLICATE_VENUE', 'Дубликат площадки'],
    ['INVALID_VENUE', 'Некорректная площадка'],
    ['ACCESS_REVIEW', 'Пересмотр доступа'],
    ['OTHER', 'Другое основание'],
];

const roleLabels: Record<components['schemas']['PlatformRole'], string> = {
    ADS_MANAGER: 'Менеджер рекламы',
    EDITOR: 'Редактор',
    MODERATOR: 'Модератор',
    SUPERADMIN: 'Суперадминистратор',
};

function adminError(error: unknown): string {
    if (!(error instanceof ApiError)) return 'Не удалось выполнить действие. Повторите попытку.';
    const code = error.response?.error.code;
    if (code === 'REVISION_CONFLICT') return 'Карточка уже изменена другим сотрудником. Загрузите свежую версию.';
    if (code === 'REAUTH_REQUIRED') return 'Для этого действия нужна свежая повторная аутентификация.';
    if (code === 'CONFIRMATION_REQUIRED') return 'Нужен действующий одноразовый код подтверждения.';
    if (code === 'CAPABILITY_REQUIRED') return 'У текущей роли нет разрешения на это действие.';
    if (code === 'ADMIN_RESOURCE_NOT_FOUND') return 'Объект не найден или недоступен в вашей области.';
    if (code === 'RATE_LIMITED') return 'Слишком много запросов. Повторите позже.';
    if (code === 'ADMIN_SESSION_INVALID') return 'Административная сессия завершена. Войдите снова.';
    return 'Не удалось выполнить действие. Изменение не подтверждено.';
}

function formatDate(value: string): string {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function has(session: AdminSession, capability: Capability): boolean {
    return session.capabilities.includes(capability);
}

function field(data: FormData, name: string): string {
    const value = data.get(name);
    return typeof value === 'string' ? value : '';
}

function ReasonFields({ policyVersion = 'admin-v1' }: { readonly policyVersion?: string }) {
    return (
        <div className="admin-form-grid">
            <label>
                Причина
                <select name="reasonCode" defaultValue="POLICY_VIOLATION" required>
                    {reasons.map(([value, label]) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Версия политики
                <input name="policyVersion" defaultValue={policyVersion} maxLength={128} required />
            </label>
        </div>
    );
}

function Feedback({ message }: { readonly message: string | undefined }) {
    const ref = useRef<HTMLParagraphElement>(null);
    useEffect(() => ref.current?.focus(), [message]);
    return message ? (
        <p className="form-message" ref={ref} role="status" tabIndex={-1}>
            {message}
        </p>
    ) : null;
}

function ConfirmDialog({
    children,
    confirmLabel,
    onCancel,
    onConfirm,
}: {
    readonly children: ReactNode;
    readonly confirmLabel: string;
    readonly onCancel: () => void;
    readonly onConfirm: () => void;
}) {
    return (
        <div className="dialog-backdrop" role="presentation">
            <section aria-labelledby="admin-confirm-title" aria-modal="true" className="confirm-dialog" role="dialog">
                <h2 id="admin-confirm-title">Подтвердите действие</h2>
                {children}
                <div className="action-row">
                    <button className="danger-action" onClick={onConfirm} type="button">
                        {confirmLabel}
                    </button>
                    <button className="secondary-action" onClick={onCancel} type="button">
                        Отмена
                    </button>
                </div>
            </section>
        </div>
    );
}

function AdminAccess({
    client,
    onSession,
}: {
    readonly client: AdminClient;
    readonly onSession: (s: AdminSession) => void;
}) {
    const [message, setMessage] = useState<string>();
    const [busy, setBusy] = useState(false);
    async function submit(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        const token = field(new FormData(form), 'credential').trim();
        if (!token) return;
        setBusy(true);
        setMessage(undefined);
        try {
            const session = await client.authenticate(token);
            form.reset();
            onSession(session);
        } catch (error) {
            form.reset();
            setMessage(adminError(error));
        } finally {
            setBusy(false);
        }
    }
    return (
        <main className="admin-access">
            <section className="admin-access-card" aria-labelledby="admin-access-title">
                <p className="eyebrow">Закрытый контур</p>
                <h1 id="admin-access-title">Вход для сотрудников</h1>
                <p>Используйте отдельную административную сессию с MFA. Обычная сессия игрока здесь не принимается.</p>
                <form onSubmit={(event) => void submit(event)}>
                    <label>
                        Код административной сессии
                        <input autoComplete="current-password" name="credential" type="password" required />
                    </label>
                    <button className="primary-action block" disabled={busy} type="submit">
                        Проверить доступ
                    </button>
                </form>
                <Feedback message={message} />
                <p className="field-help">Код хранится только в памяти этой вкладки и удаляется при выходе.</p>
            </section>
        </main>
    );
}

function AdminLayout({
    children,
    session,
    onSignOut,
}: {
    readonly children: ReactNode;
    readonly session: AdminSession;
    readonly onSignOut: () => void;
}) {
    return (
        <div className="admin-shell" data-admin-role={session.activeRole}>
            <header className="admin-header">
                <Link className="brand" to="/admin">
                    <span className="brand-mark" aria-hidden="true" />
                    <span>PickleHub · операции</span>
                </Link>
                <div className="admin-identity">
                    <span>Текущая роль: {roleLabels[session.activeRole]}</span>
                    <button className="secondary-action" onClick={onSignOut} type="button">
                        Завершить сессию
                    </button>
                </div>
            </header>
            <div className="admin-frame">
                <nav aria-label="Административная панель" className="admin-nav">
                    {has(session, 'SAFETY_CASE_ROUTE') && <Link to="/admin/cases">Обращения</Link>}
                    {has(session, 'VENUE_MODERATE') && <Link to="/admin/venues">Площадки</Link>}
                    {has(session, 'USER_LOOKUP') && <Link to="/admin/users">Пользователи</Link>}
                    {has(session, 'AUDIT_SEARCH') && <Link to="/admin/audit">Аудит</Link>}
                </nav>
                <div className="admin-content">{children}</div>
            </div>
        </div>
    );
}

function CasesScreen({ client }: { readonly client: AdminClient }) {
    const [page, setPage] = useState<components['schemas']['AdminCasePage']>();
    const [filters, setFilters] = useState<Record<string, unknown>>({ limit: 25 });
    const [message, setMessage] = useState<string>();
    const load = useCallback(
        (next = filters) => {
            return client
                .listCases(next)
                .then(setPage)
                .catch((error: unknown) => {
                    setMessage(adminError(error));
                });
        },
        [client, filters]
    );
    useEffect(() => void load(), [load]);
    function filter(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setFilters({
            assignment: field(data, 'assignment'),
            limit: 25,
            priority: field(data, 'priority'),
            state: field(data, 'state'),
        });
    }
    return (
        <main>
            <div className="admin-title">
                <div>
                    <p className="eyebrow">Модерация</p>
                    <h1>Очередь обращений</h1>
                </div>
            </div>
            <form className="admin-filters" onSubmit={filter}>
                <label>
                    Состояние
                    <select name="state" defaultValue="">
                        <option value="">Все</option>
                        <option value="OPEN">Открыто</option>
                        <option value="ASSIGNED">Назначено</option>
                        <option value="INVESTIGATING">Проверка</option>
                        <option value="REOPENED">Переоткрыто</option>
                    </select>
                </label>
                <label>
                    Приоритет
                    <select name="priority" defaultValue="">
                        <option value="">Все</option>
                        <option value="URGENT">Срочный</option>
                        <option value="HIGH">Высокий</option>
                        <option value="NORMAL">Обычный</option>
                    </select>
                </label>
                <label>
                    Назначение
                    <select name="assignment" defaultValue="">
                        <option value="">Все</option>
                        <option value="UNASSIGNED">Без исполнителя</option>
                        <option value="ASSIGNED_TO_ME">Мои</option>
                    </select>
                </label>
                <button className="secondary-action" type="submit">
                    Применить
                </button>
            </form>
            <Feedback message={message} />
            {!page && !message && <p role="status">Загружаем очередь…</p>}
            {page && (
                <div className="admin-table-wrap">
                    <table>
                        <caption className="visually-hidden">Обращения модерации</caption>
                        <thead>
                            <tr>
                                <th scope="col">Обращение</th>
                                <th scope="col">Тип</th>
                                <th scope="col">Состояние</th>
                                <th scope="col">Приоритет</th>
                                <th scope="col">Назначение</th>
                                <th scope="col">Ожидает с</th>
                            </tr>
                        </thead>
                        <tbody>
                            {page.items.map((item) => (
                                <tr key={item.caseId}>
                                    <th scope="row">
                                        <Link to={`/admin/cases/${item.caseId}`}>{item.caseId}</Link>
                                    </th>
                                    <td>{item.kind}</td>
                                    <td>{item.state}</td>
                                    <td>{item.priority}</td>
                                    <td>{item.assignmentState}</td>
                                    <td>{formatDate(item.actionableAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {page?.items.length === 0 && <p className="empty-state">По этим фильтрам обращений нет.</p>}
            {page?.pageInfo.hasMore && page.pageInfo.nextCursor && (
                <button
                    className="secondary-action"
                    onClick={() => {
                        setFilters({ ...filters, cursor: page.pageInfo.nextCursor });
                    }}
                    type="button"
                >
                    Следующая страница
                </button>
            )}
        </main>
    );
}

function CaseDetailScreen({ client, session }: { readonly client: AdminClient; readonly session: AdminSession }) {
    const { caseId = '' } = useParams();
    const [detail, setDetail] = useState<components['schemas']['AdminCaseDetail']>();
    const [message, setMessage] = useState<string>();
    const [pending, setPending] = useState<() => Promise<void>>();
    const load = useCallback(
        () =>
            client
                .getCase(caseId)
                .then(setDetail)
                .catch((e: unknown) => {
                    setMessage(adminError(e));
                }),
        [caseId, client]
    );
    useEffect(() => {
        void load();
    }, [load]);
    async function run(operation: () => Promise<components['schemas']['AdminCaseSummary']>) {
        setMessage(undefined);
        try {
            await operation();
            await load();
            setMessage('Изменение сохранено и подтверждено сервером.');
        } catch (error) {
            setMessage(adminError(error));
        }
    }
    if (!detail)
        return (
            <main>
                <Link to="/admin/cases">← К очереди</Link>
                <p role="status">{message ?? 'Загружаем обращение…'}</p>
            </main>
        );
    const summary = detail.summary;
    return (
        <main>
            <Link to="/admin/cases">← К очереди</Link>
            <div className="admin-title">
                <div>
                    <p className="eyebrow">Обращение {summary.caseId}</p>
                    <h1>Проверка обращения</h1>
                </div>
                <span className="admin-badge">Версия {summary.revision}</span>
            </div>
            <dl className="admin-facts">
                <div>
                    <dt>Тип</dt>
                    <dd>{summary.kind}</dd>
                </div>
                <div>
                    <dt>Состояние</dt>
                    <dd>{summary.state}</dd>
                </div>
                <div>
                    <dt>Приоритет</dt>
                    <dd>{summary.priority}</dd>
                </div>
                <div>
                    <dt>Источников</dt>
                    <dd>{detail.sourceCount}</dd>
                </div>
            </dl>
            <section className="admin-panel restricted-admin-copy" aria-labelledby="case-materials">
                <h2 id="case-materials">Материалы с ограниченным доступом</h2>
                {detail.restrictedNarrative ? (
                    <p>{detail.restrictedNarrative}</p>
                ) : (
                    <p className="empty-state">Описание скрыто политикой доступа.</p>
                )}
                {detail.restrictedResponses?.map((text, index) => (
                    <p key={index}>Ответ: {text}</p>
                ))}
                {detail.restrictedAppeal && <p>Апелляция: {detail.restrictedAppeal}</p>}
            </section>
            {has(session, 'SAFETY_CASE_ROUTE') && (
                <form
                    className="admin-panel"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void run(() =>
                            client.assignCase(
                                caseId,
                                {
                                    assigneeUserId: field(data, 'assigneeUserId'),
                                    expectedRevision: summary.revision,
                                    policyVersion: field(data, 'policyVersion'),
                                    reasonCode: field(data, 'reasonCode') as Reason,
                                },
                                crypto.randomUUID()
                            )
                        );
                    }}
                >
                    <h2>Назначить исполнителя</h2>
                    <label>
                        ID сотрудника
                        <input name="assigneeUserId" required />
                    </label>
                    <ReasonFields policyVersion={detail.policyVersion} />
                    <button className="secondary-action" type="submit">
                        Назначить
                    </button>
                </form>
            )}
            {has(session, 'SAFETY_CASE_DECIDE') && (
                <form
                    className="admin-panel"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const outcome = field(data, 'outcome') as components['schemas']['DecideAdminCase']['outcome'];
                        const operation = () =>
                            run(() =>
                                client.decideCase(
                                    caseId,
                                    {
                                        expectedRevision: summary.revision,
                                        outcome,
                                        policyVersion: field(data, 'policyVersion'),
                                        reasonCode: field(data, 'reasonCode') as Reason,
                                    },
                                    crypto.randomUUID()
                                )
                            );
                        setPending(() => operation);
                    }}
                >
                    <h2>Решение</h2>
                    <label>
                        Результат
                        <select name="outcome" defaultValue="NO_VIOLATION">
                            <option value="NO_VIOLATION">Нарушения нет</option>
                            <option value="WARNING">Предупреждение</option>
                            <option value="CONTENT_RESTRICTED">Ограничить контент</option>
                            <option value="INTERACTION_RESTRICTED">Ограничить взаимодействия</option>
                            <option value="ACCOUNT_RESTRICTED">Ограничить аккаунт</option>
                        </select>
                    </label>
                    <ReasonFields policyVersion={detail.policyVersion} />
                    <button className="danger-action" type="submit">
                        Подготовить решение
                    </button>
                </form>
            )}
            <Feedback message={message} />
            {message?.includes('свежую версию') && (
                <button className="secondary-action" onClick={() => void load()} type="button">
                    Загрузить свежую версию
                </button>
            )}
            {pending && (
                <ConfirmDialog
                    confirmLabel="Зафиксировать решение"
                    onCancel={() => {
                        setPending(undefined);
                    }}
                    onConfirm={() => {
                        const operation = pending;
                        setPending(undefined);
                        void operation();
                    }}
                >
                    <p>
                        Решение изменит состояние обращения и может повлечь ограничения. Действие будет записано в
                        аудит.
                    </p>
                </ConfirmDialog>
            )}
        </main>
    );
}

function VenuesScreen({ client }: { readonly client: AdminClient }) {
    const [page, setPage] = useState<components['schemas']['AdminVenueQueuePage']>();
    const [message, setMessage] = useState<string>();
    const [filters, setFilters] = useState<Record<string, unknown>>({ limit: 25 });
    useEffect(() => {
        void client
            .listVenues(filters)
            .then(setPage)
            .catch((e: unknown) => {
                setMessage(adminError(e));
            });
    }, [client, filters]);
    return (
        <main>
            <div className="admin-title">
                <div>
                    <p className="eyebrow">Качество каталога</p>
                    <h1>Площадки-кандидаты</h1>
                </div>
            </div>
            <form
                className="admin-filters"
                onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    setFilters({
                        kind: field(data, 'kind'),
                        limit: 25,
                        locality: field(data, 'locality'),
                        state: field(data, 'state'),
                    });
                }}
            >
                <label>
                    Тип
                    <select name="kind" defaultValue="">
                        <option value="">Все</option>
                        <option value="CANDIDATE">Кандидат</option>
                        <option value="REVISION">Правка</option>
                        <option value="REPORT">Жалоба</option>
                    </select>
                </label>
                <label>
                    Состояние
                    <select name="state" defaultValue="">
                        <option value="">Все</option>
                        <option value="PENDING_REVIEW">На проверке</option>
                        <option value="PENDING">Ожидает</option>
                        <option value="APPROVED">Одобрено</option>
                        <option value="REJECTED">Отклонено</option>
                    </select>
                </label>
                <label>
                    Населённый пункт
                    <input name="locality" />
                </label>
                <button className="secondary-action" type="submit">
                    Применить
                </button>
            </form>
            <Feedback message={message} />
            {page && (
                <div className="admin-table-wrap">
                    <table>
                        <caption className="visually-hidden">Кандидаты площадок</caption>
                        <thead>
                            <tr>
                                <th scope="col">Объект</th>
                                <th scope="col">Тип</th>
                                <th scope="col">Состояние</th>
                                <th scope="col">Источник</th>
                                <th scope="col">Город</th>
                                <th scope="col">Возраст</th>
                            </tr>
                        </thead>
                        <tbody>
                            {page.items.map((item) => (
                                <tr key={item.itemId}>
                                    <th scope="row">
                                        <Link to={`/admin/venues/${item.itemId}`}>{item.itemId}</Link>
                                    </th>
                                    <td>{item.kind}</td>
                                    <td>{item.state}</td>
                                    <td>{item.sourceClass}</td>
                                    <td>{item.locality}</td>
                                    <td>{item.ageBucket}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {!page && !message && <p role="status">Загружаем очередь…</p>}
        </main>
    );
}

function VenueDetailScreen({ client }: { readonly client: AdminClient }) {
    const { itemId = '' } = useParams();
    const [detail, setDetail] = useState<components['schemas']['AdminVenueCandidateDetail']>();
    const [message, setMessage] = useState<string>();
    const [pending, setPending] = useState<{ label: string; operation: () => Promise<unknown> }>();
    const load = useCallback(
        () =>
            client
                .getVenue(itemId)
                .then(setDetail)
                .catch((e: unknown) => {
                    setMessage(adminError(e));
                }),
        [client, itemId]
    );
    useEffect(() => void load(), [load]);
    async function run(operation: () => Promise<unknown>) {
        try {
            await operation();
            await load();
            setMessage('Решение сохранено сервером.');
        } catch (error) {
            setMessage(adminError(error));
        }
    }
    if (!detail)
        return (
            <main>
                <Link to="/admin/venues">← К очереди</Link>
                <p role="status">{message ?? 'Загружаем карточку…'}</p>
            </main>
        );
    const item = detail.item;
    return (
        <main>
            <Link to="/admin/venues">← К очереди</Link>
            <div className="admin-title">
                <div>
                    <p className="eyebrow">Площадка {item.itemId}</p>
                    <h1>{detail.name}</h1>
                </div>
                <span className="admin-badge">Версия {item.revision}</span>
            </div>
            <section className="admin-panel">
                <h2>Данные кандидата</h2>
                <dl className="admin-facts">
                    <div>
                        <dt>Адрес</dt>
                        <dd>{detail.normalizedAddress}</dd>
                    </div>
                    <div>
                        <dt>Координаты</dt>
                        <dd>
                            {detail.latitude.toFixed(4)}, {detail.longitude.toFixed(4)}
                        </dd>
                    </div>
                    <div>
                        <dt>Источник</dt>
                        <dd>{detail.provenance.join(', ')}</dd>
                    </div>
                    <div>
                        <dt>Состояние</dt>
                        <dd>{item.state}</dd>
                    </div>
                </dl>
            </section>
            <form
                className="admin-panel"
                onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const decision = field(data, 'decision') as components['schemas']['AdminVenueDecision'];
                    const operation = () =>
                        client.decideVenue(
                            itemId,
                            {
                                decision,
                                expectedRevision: item.revision,
                                policyVersion: field(data, 'policyVersion'),
                                reasonCode: field(data, 'reasonCode') as Reason,
                            },
                            crypto.randomUUID()
                        );
                    setPending({
                        label: decision === 'APPROVE' ? 'Одобрить площадку' : 'Отклонить площадку',
                        operation,
                    });
                }}
            >
                <h2>Решение по кандидату</h2>
                <label>
                    Решение
                    <select name="decision">
                        <option value="APPROVE">Одобрить</option>
                        <option value="REJECT">Отклонить</option>
                    </select>
                </label>
                <ReasonFields />
                <button className="danger-action" type="submit">
                    Подготовить решение
                </button>
            </form>
            <form
                className="admin-panel"
                onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const survivorVenueId = field(data, 'survivorVenueId');
                    const duplicateVenueId = field(data, 'duplicateVenueId');
                    const confirmationToken = field(data, 'confirmationToken');
                    const operation = () =>
                        client.mergeVenue(
                            itemId,
                            {
                                confirmationToken,
                                duplicateVenueId,
                                expectedRevision: item.revision,
                                policyVersion: field(data, 'policyVersion'),
                                reasonCode: field(data, 'reasonCode') as Reason,
                                survivorVenueId,
                            },
                            crypto.randomUUID()
                        );
                    setPending({ label: 'Объединить площадки', operation });
                }}
            >
                <h2>Сравнить и объединить</h2>
                <div className="admin-compare" role="group" aria-label="Сравнение площадок">
                    <div>
                        <strong>Кандидат</strong>
                        <span>{detail.name}</span>
                        <span>{detail.normalizedAddress}</span>
                    </div>
                    <div>
                        <strong>Опубликованная площадка</strong>
                        <label>
                            ID сохраняемой площадки
                            <select name="survivorVenueId" required>
                                {detail.nearbyPublishedVenueIds.map((id) => (
                                    <option key={id}>{id}</option>
                                ))}
                            </select>
                        </label>
                    </div>
                </div>
                <label>
                    ID дубликата
                    <input name="duplicateVenueId" defaultValue={item.itemId} required />
                </label>
                <label>
                    Одноразовый код подтверждения
                    <input autoComplete="one-time-code" name="confirmationToken" required />
                </label>
                <ReasonFields />
                <button className="danger-action" disabled={detail.nearbyPublishedVenueIds.length === 0} type="submit">
                    Подготовить слияние
                </button>
            </form>
            <Feedback message={message} />
            {pending && (
                <ConfirmDialog
                    confirmLabel={pending.label}
                    onCancel={() => {
                        setPending(undefined);
                    }}
                    onConfirm={() => {
                        const operation = pending.operation;
                        setPending(undefined);
                        void run(operation);
                    }}
                >
                    <p>
                        Слияние меняет каноническую площадку и связи. Проверьте сохраняемый ID, причину и одноразовый
                        код.
                    </p>
                </ConfirmDialog>
            )}
        </main>
    );
}

function UsersScreen({ client }: { readonly client: AdminClient }) {
    const [user, setUser] = useState<components['schemas']['AdminUserProjection']>();
    const [message, setMessage] = useState<string>();
    const [pending, setPending] = useState<() => Promise<unknown>>();
    async function lookup(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        const form = event.currentTarget;
        setUser(undefined);
        const data = new FormData(form);
        const kind = field(data, 'kind');
        const value = field(data, 'value').trim();
        const key =
            kind === 'userId'
                ? { userId: value }
                : kind === 'receiptId'
                  ? { receiptId: value }
                  : kind === 'exactEmail'
                    ? { exactEmail: value }
                    : { exactTelegramSubject: value };
        try {
            setUser(
                await client.lookupUser({
                    includeMaskedIdentity: data.get('masked') === 'on',
                    key,
                    purpose: field(data, 'purpose') as components['schemas']['AdminPurpose'],
                })
            );
            form.reset();
        } catch (error) {
            setMessage(adminError(error));
        }
    }
    async function run(operation: () => Promise<unknown>) {
        try {
            await operation();
            setMessage('Ограничение сохранено сервером.');
        } catch (error) {
            setMessage(adminError(error));
        }
    }
    return (
        <main>
            <div className="admin-title">
                <div>
                    <p className="eyebrow">Точный поиск</p>
                    <h1>Пользователь</h1>
                </div>
            </div>
            <form className="admin-panel" onSubmit={(event) => void lookup(event)}>
                <p className="field-help">
                    Частичный поиск и просмотр общего списка отключены. Значение не попадает в URL.
                </p>
                <div className="admin-form-grid">
                    <label>
                        Тип ключа
                        <select name="kind">
                            <option value="userId">ID пользователя</option>
                            <option value="receiptId">ID квитанции</option>
                            <option value="exactEmail">Точный email</option>
                            <option value="exactTelegramSubject">Точный Telegram subject</option>
                        </select>
                    </label>
                    <label>
                        Точное значение
                        <input autoComplete="off" name="value" required />
                    </label>
                    <label>
                        Цель
                        <select name="purpose">
                            <option value="SUPPORT">Поддержка</option>
                            <option value="SECURITY">Безопасность</option>
                            <option value="MODERATION">Модерация</option>
                        </select>
                    </label>
                    <label className="check">
                        <input name="masked" type="checkbox" />
                        Показать маскированный идентификатор, если разрешено
                    </label>
                </div>
                <button className="primary-action" type="submit">
                    Найти
                </button>
            </form>
            {user && (
                <section className="admin-panel">
                    <h2>{user.displayName ?? 'Пользователь без публичного имени'}</h2>
                    <dl className="admin-facts">
                        <div>
                            <dt>ID</dt>
                            <dd>{user.userId}</dd>
                        </div>
                        <div>
                            <dt>Состояние</dt>
                            <dd>{user.accountState}</dd>
                        </div>
                        <div>
                            <dt>Идентификатор</dt>
                            <dd>{user.maskedIdentity ?? 'Скрыт'}</dd>
                        </div>
                        <div>
                            <dt>Ограничения</dt>
                            <dd>{user.restrictionScopes.join(', ') || 'Нет'}</dd>
                        </div>
                    </dl>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            const confirmationToken = field(data, 'confirmationToken');
                            const expiresAt = field(data, 'expiresAt');
                            const operation = () =>
                                client.createRestriction(
                                    user.userId,
                                    {
                                        ...(confirmationToken ? { confirmationToken } : {}),
                                        decisionId: field(data, 'decisionId'),
                                        expectedRevision: 0,
                                        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
                                        policyVersion: field(data, 'policyVersion'),
                                        reasonCode: field(data, 'reasonCode') as Reason,
                                        scope: field(data, 'scope') as components['schemas']['AdminRestrictionScope'],
                                    },
                                    crypto.randomUUID()
                                );
                            setPending(() => operation);
                        }}
                    >
                        <h3>Новое обратимое ограничение</h3>
                        <div className="admin-form-grid">
                            <label>
                                ID решения
                                <input name="decisionId" required />
                            </label>
                            <label>
                                Область
                                <select name="scope">
                                    <option value="DIRECT_INTERACTIONS">Прямые взаимодействия</option>
                                    <option value="MATCH_CREATION">Создание матчей</option>
                                    <option value="PLATFORM_ACCESS">Доступ к платформе</option>
                                </select>
                            </label>
                            <label>
                                Истекает
                                <input name="expiresAt" type="datetime-local" />
                            </label>
                            <label>
                                Одноразовый код для бессрочного или platform-wide действия
                                <input autoComplete="one-time-code" name="confirmationToken" />
                            </label>
                        </div>
                        <ReasonFields />
                        <button className="danger-action" type="submit">
                            Подготовить ограничение
                        </button>
                    </form>
                </section>
            )}
            <Feedback message={message} />
            {pending && (
                <ConfirmDialog
                    confirmLabel="Создать ограничение"
                    onCancel={() => {
                        setPending(undefined);
                    }}
                    onConfirm={() => {
                        const operation = pending;
                        setPending(undefined);
                        void run(operation);
                    }}
                >
                    <p>Ограничение повлияет на действия пользователя. Оно будет версионировано и записано в аудит.</p>
                </ConfirmDialog>
            )}
        </main>
    );
}

function AuditScreen({ client }: { readonly client: AdminClient }) {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86_400_000);
    const [page, setPage] = useState<components['schemas']['AuditEntryPage']>();
    const [message, setMessage] = useState<string>();
    async function search(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const optional = (name: string) => {
            const value = field(data, name).trim();
            return value || undefined;
        };
        try {
            const action = optional('action');
            const actorId = optional('actorId');
            const outcome = optional('outcome') as components['schemas']['AuditOutcome'] | undefined;
            const targetId = optional('targetId');
            const targetType = optional('targetType');
            setPage(
                await client.searchAudit({
                    ...(action ? { action } : {}),
                    ...(actorId ? { actorId } : {}),
                    from: new Date(field(data, 'from')).toISOString(),
                    limit: 25,
                    ...(outcome ? { outcome } : {}),
                    ...(targetId ? { targetId } : {}),
                    ...(targetType ? { targetType } : {}),
                    to: new Date(field(data, 'to')).toISOString(),
                })
            );
        } catch (error) {
            setMessage(adminError(error));
        }
    }
    const local = (date: Date) =>
        new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    return (
        <main>
            <div className="admin-title">
                <div>
                    <p className="eyebrow">Неизменяемый журнал</p>
                    <h1>Аудит</h1>
                </div>
            </div>
            <form className="admin-filters admin-audit-filters" onSubmit={(event) => void search(event)}>
                <label>
                    С<input name="from" type="datetime-local" defaultValue={local(yesterday)} required />
                </label>
                <label>
                    По
                    <input name="to" type="datetime-local" defaultValue={local(now)} required />
                </label>
                <label>
                    Действие
                    <input name="action" pattern="[A-Z][A-Z0-9_]+" />
                </label>
                <label>
                    Результат
                    <select name="outcome" defaultValue="">
                        <option value="">Все</option>
                        <option value="SUCCEEDED">Успех</option>
                        <option value="DENIED">Отказ</option>
                        <option value="FAILED">Ошибка</option>
                        <option value="CONFLICT">Конфликт</option>
                    </select>
                </label>
                <label>
                    ID исполнителя
                    <input name="actorId" />
                </label>
                <label>
                    Тип цели
                    <input name="targetType" />
                </label>
                <label>
                    ID цели
                    <input name="targetId" />
                </label>
                <button className="secondary-action" type="submit">
                    Найти
                </button>
            </form>
            <p className="field-help">
                Интервал не более 31 дня. Свободный текст, evidence и полные before/after не ищутся и не показываются.
            </p>
            <Feedback message={message} />
            {page && (
                <div className="admin-table-wrap">
                    <table>
                        <caption className="visually-hidden">Записи аудита</caption>
                        <thead>
                            <tr>
                                <th scope="col">Время</th>
                                <th scope="col">Действие</th>
                                <th scope="col">Исполнитель</th>
                                <th scope="col">Цель</th>
                                <th scope="col">Результат</th>
                                <th scope="col">Причина</th>
                            </tr>
                        </thead>
                        <tbody>
                            {page.items.map((entry) => (
                                <tr key={entry.auditEntryId}>
                                    <td>{formatDate(entry.createdAt)}</td>
                                    <th scope="row">{entry.action}</th>
                                    <td>{entry.actorId ?? 'SYSTEM'}</td>
                                    <td>
                                        {entry.targetType} · {entry.targetId}
                                    </td>
                                    <td>{entry.outcome}</td>
                                    <td>{entry.reasonCode}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </main>
    );
}

export function AdminApp({ config, online }: { readonly config: RuntimeConfig; readonly online: boolean }) {
    const [session, setSession] = useState<AdminSession>();
    const navigate = useNavigate();
    const client = useMemo(
        () =>
            createAdminClient({
                baseUrl: config.apiBaseUrl,
                onUnauthorized: () => {
                    setSession(undefined);
                },
            }),
        [config.apiBaseUrl]
    );
    const signOut = useCallback(() => {
        client.clear();
        setSession(undefined);
        history.replaceState(null, '', '/admin/access');
        void navigate('/admin/access', { replace: true });
    }, [client, navigate]);
    useEffect(() => {
        const clear = () => {
            client.clear();
            setSession(undefined);
        };
        window.addEventListener('pagehide', clear);
        return () => {
            window.removeEventListener('pagehide', clear);
        };
    }, [client]);
    useEffect(() => {
        document.title = session ? `Операции · ${roleLabels[session.activeRole]}` : 'Вход сотрудников · PickleHub';
        return () => {
            document.title = 'PickleHub';
        };
    }, [session]);
    if (!session) return <AdminAccess client={client} onSession={setSession} />;
    return (
        <AdminLayout session={session} onSignOut={signOut}>
            {!online && (
                <p className="offline-banner" role="status">
                    Нет сети. Административные изменения недоступны.
                </p>
            )}
            <Routes>
                <Route path="/admin/access" element={<Navigate replace to="/admin" />} />
                <Route
                    path="/admin/cases"
                    element={
                        has(session, 'SAFETY_CASE_ROUTE') ? (
                            <CasesScreen client={client} />
                        ) : (
                            <Navigate replace to="/admin" />
                        )
                    }
                />
                <Route
                    path="/admin/cases/:caseId"
                    element={
                        has(session, 'SAFETY_CASE_ROUTE') ? (
                            <CaseDetailScreen client={client} session={session} />
                        ) : (
                            <Navigate replace to="/admin" />
                        )
                    }
                />
                <Route
                    path="/admin/venues"
                    element={
                        has(session, 'VENUE_MODERATE') ? (
                            <VenuesScreen client={client} />
                        ) : (
                            <Navigate replace to="/admin" />
                        )
                    }
                />
                <Route
                    path="/admin/venues/:itemId"
                    element={
                        has(session, 'VENUE_MODERATE') ? (
                            <VenueDetailScreen client={client} />
                        ) : (
                            <Navigate replace to="/admin" />
                        )
                    }
                />
                <Route
                    path="/admin/users"
                    element={
                        has(session, 'USER_LOOKUP') ? <UsersScreen client={client} /> : <Navigate replace to="/admin" />
                    }
                />
                <Route
                    path="/admin/audit"
                    element={
                        has(session, 'AUDIT_SEARCH') ? (
                            <AuditScreen client={client} />
                        ) : (
                            <Navigate replace to="/admin" />
                        )
                    }
                />
                <Route
                    path="/admin/*"
                    element={
                        <main className="admin-welcome">
                            <p className="eyebrow">Доступ подтверждён</p>
                            <h1>Операционная панель</h1>
                            <p>
                                Выберите доступный раздел. Видимость интерфейса не заменяет проверку разрешений на
                                сервере.
                            </p>
                        </main>
                    }
                />
            </Routes>
        </AdminLayout>
    );
}
