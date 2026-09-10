import { disabledAnalytics } from '@picklehub/analytics';
import { ApiError, type components, type IdentityClient } from '@picklehub/api-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

type Message = components['schemas']['Message'];
type Notification = components['schemas']['Notification'];
type Preference = components['schemas']['NotificationPreference'];
type Category = components['schemas']['NotificationCategory'];
type Channel = components['schemas']['NotificationChannel'];

const categoryLabels: Record<Category, string> = {
    CHAT: 'Чат',
    MATCH_CRITICAL: 'Важные изменения матча',
    REMINDERS: 'Напоминания',
    REQUESTS: 'Заявки',
    RESULTS: 'Результаты',
    ROSTER: 'Состав',
};
const systemLabels: Record<NonNullable<Message['systemType']>, string> = {
    MATCH_CANCELLED: 'Матч отменён',
    MATCH_STARTED: 'Матч начался',
    MATCH_TIME_CHANGED: 'Время матча изменилось',
    MATCH_VENUE_CHANGED: 'Площадка матча изменена',
    RESULT_CONFIRMED: 'Результат подтверждён',
    RESULT_DISPUTED: 'Результат оспорен',
    RESULT_PROPOSED: 'Предложен результат матча',
    ROSTER_JOINED: 'К матчу присоединился игрок',
    ROSTER_LEFT: 'Игрок покинул матч',
};
const notificationLabels: Record<Notification['type'], string> = {
    CHAT_MESSAGE: 'Новое сообщение в чате',
    JOIN_REQUESTED: 'Новая заявка на матч',
    JOIN_REQUEST_RESOLVED: 'Решение по заявке',
    MATCH_CANCELLED: 'Матч отменён',
    MATCH_CHANGED: 'Условия матча изменились',
    MATCH_REMINDER: 'Напоминание о матче',
    RESULT_ACTION_REQUIRED: 'Нужно проверить результат',
    RESULT_CONFIRMED: 'Результат подтверждён',
    RESULT_DISPUTED: 'Результат оспорен',
    ROSTER_CHANGED: 'Состав матча изменился',
    WAITLIST_CHANGED: 'Очередь матча изменилась',
};

interface PendingMessage {
    readonly clientId: string;
    readonly idempotencyKey: string;
    readonly text: string;
    readonly state: 'SENDING' | 'FAILED';
}

function messageFor(error: unknown): string {
    if (error instanceof ApiError && error.status === 401) return 'Сессия устарела. Войдите снова.';
    if (error instanceof ApiError && error.response?.error.code === 'MESSAGE_REVISION_CONFLICT')
        return 'Сообщение уже изменилось. Чат обновлён.';
    if (error instanceof ApiError) return error.response?.error.message ?? 'Не удалось выполнить действие.';
    return 'Нет связи с сервером. Попробуйте ещё раз.';
}

function mergeMessages(current: readonly Message[], incoming: readonly Message[]): Message[] {
    const byId = new Map(current.map((item) => [item.id, item]));
    for (const item of incoming) {
        const previous = byId.get(item.id);
        if (!previous || item.revision >= previous.revision) byId.set(item.id, item);
    }
    return [...byId.values()].sort((left, right) => left.sequence - right.sequence);
}

function formatDate(value: string, timeZone: string): string {
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        timeZone,
        timeZoneName: 'short',
    }).format(new Date(value));
}

function envelope(type: string, data: Record<string, unknown>) {
    return {
        correlationId: crypto.randomUUID(),
        data,
        messageId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        type,
    };
}

export function ChatScreen({
    channel,
    client,
    matchId,
    online,
    userId,
    onAuthenticationExpired,
}: {
    readonly channel: 'web' | 'telegram';
    readonly client: IdentityClient;
    readonly matchId: string;
    readonly online: boolean;
    readonly userId: string;
    readonly onAuthenticationExpired: () => void;
}) {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
    const storageKey = `picklehub:chat-draft:${matchId}`;
    const [draft, setDraft] = useState(() => sessionStorage.getItem(storageKey) ?? '');
    const [messages, setMessages] = useState<readonly Message[]>([]);
    const [pending, setPending] = useState<readonly PendingMessage[]>([]);
    const [backwardCursor, setBackwardCursor] = useState<string | null>(null);
    const [catchUpCursor, setCatchUpCursor] = useState<string>();
    const [conversation, setConversation] = useState<components['schemas']['Conversation']>();
    const [connection, setConnection] = useState<'CONNECTING' | 'LIVE' | 'OFFLINE'>('CONNECTING');
    const [notice, setNotice] = useState<string>();
    const [reported, setReported] = useState<ReadonlySet<string>>(new Set());
    const [reportReason, setReportReason] = useState<components['schemas']['ChatReportReason']>('SPAM');
    const cursorRef = useRef<string | undefined>(undefined);
    const opened = useRef(false);

    useEffect(() => {
        sessionStorage.setItem(storageKey, draft);
    }, [draft, storageKey]);

    const loadSnapshot = useCallback(async () => {
        try {
            const snapshot = await client.getMatchConversation(matchId);
            setConversation(snapshot.conversation);
            setMessages((current) => mergeMessages(current, snapshot.messages));
            setBackwardCursor(snapshot.backwardCursor);
            setCatchUpCursor(snapshot.catchUpCursor);
            cursorRef.current = snapshot.catchUpCursor;
            if (!opened.current) {
                opened.current = true;
                const count = snapshot.conversation.unreadCount;
                disabledAnalytics.track({
                    name: 'chat_opened',
                    channel,
                    entry: 'MATCH',
                    unreadBucket: count === 0 ? 'ZERO' : count <= 5 ? 'ONE_FIVE' : count <= 20 ? 'SIX_TWENTY' : 'GT_20',
                });
            }
            const last = snapshot.messages.at(-1)?.sequence;
            if (online && last !== undefined && last > snapshot.conversation.lastReadSequence) {
                void client.markConversationRead(matchId, { throughSequence: last }).catch(() => undefined);
            }
        } catch (error) {
            if (error instanceof ApiError && error.status === 401) onAuthenticationExpired();
            setNotice(messageFor(error));
        }
    }, [channel, client, matchId, onAuthenticationExpired, online]);

    const catchUp = useCallback(async () => {
        const cursor = cursorRef.current;
        if (!cursor) return;
        try {
            const page = await client.listConversationMessages(matchId, cursor);
            setMessages((current) => mergeMessages(current, page.items));
            setCatchUpCursor(page.catchUpCursor);
            cursorRef.current = page.catchUpCursor;
            const last = page.items.at(-1)?.sequence;
            if (last !== undefined)
                void client.markConversationRead(matchId, { throughSequence: last }).catch(() => undefined);
        } catch (error) {
            if (
                error instanceof ApiError &&
                ['CURSOR_EXPIRED', 'INVALID_CURSOR', 'RESYNC_REQUIRED'].includes(error.response?.error.code ?? '')
            ) {
                disabledAnalytics.track({ name: 'chat_resync_required', reason: 'CURSOR_EXPIRED' });
                await loadSnapshot();
                return;
            }
            setNotice(messageFor(error));
        }
    }, [client, loadSnapshot, matchId]);

    useEffect(() => {
        void loadSnapshot();
    }, [loadSnapshot]);

    const conversationId = conversation?.id;
    useEffect(() => {
        if (!online || !conversationId) {
            setConnection('OFFLINE');
            return undefined;
        }
        let stopped = false;
        let retry: number | undefined;
        let socket: WebSocket | undefined;
        let attempt = 0;
        const connect = async () => {
            setConnection('CONNECTING');
            try {
                const ticket = await client.getRealtimeTicket();
                if (stopped) return;
                socket = new WebSocket(client.getRealtimeUrl());
                socket.addEventListener('open', () => {
                    socket?.send(JSON.stringify(envelope('session.authenticate.v1', { ticket })));
                });
                socket.addEventListener('message', (event) => {
                    let value: { readonly type?: string; readonly data?: Record<string, unknown> };
                    try {
                        value = JSON.parse(String(event.data)) as typeof value;
                    } catch {
                        return;
                    }
                    if (value.type === 'session.authenticated.v1') {
                        socket?.send(
                            JSON.stringify(
                                envelope('chat.subscribe.v1', { cursor: cursorRef.current ?? null, matchId })
                            )
                        );
                    } else if (value.type === 'chat.subscribed.v1') {
                        attempt = 0;
                        setConnection('LIVE');
                    } else if (value.type?.startsWith('chat.message.') || value.type === 'chat.system.event.v1') {
                        void catchUp();
                    } else if (value.type === 'communication.error.v1') {
                        if (value.data?.code === 'AUTHENTICATION_REQUIRED') {
                            onAuthenticationExpired();
                            socket?.close();
                        } else if (value.data?.resyncRequired === true) {
                            void loadSnapshot();
                        }
                    }
                });
                socket.addEventListener('close', () => {
                    if (stopped) return;
                    setConnection('CONNECTING');
                    retry = window.setTimeout(() => void connect(), Math.min(30_000, 1_000 * 2 ** attempt++));
                });
            } catch (error) {
                if (error instanceof ApiError && error.status === 401) onAuthenticationExpired();
                if (!stopped) retry = window.setTimeout(() => void connect(), Math.min(30_000, 1_000 * 2 ** attempt++));
            }
        };
        void connect();
        return () => {
            stopped = true;
            if (retry !== undefined) window.clearTimeout(retry);
            socket?.close();
        };
    }, [catchUp, client, conversationId, loadSnapshot, matchId, onAuthenticationExpired, online]);

    async function loadOlder() {
        if (!backwardCursor) return;
        try {
            const page = await client.listConversationMessages(matchId, backwardCursor);
            setMessages((current) => mergeMessages(page.items, current));
            setBackwardCursor(page.pageInfo.nextCursor);
        } catch (error) {
            setNotice(messageFor(error));
        }
    }

    async function send(item?: PendingMessage) {
        const text = (item?.text ?? draft).trim();
        if (!online || !text || text.length > 2_000) return;
        const optimistic: PendingMessage = item ?? {
            clientId: crypto.randomUUID(),
            idempotencyKey: crypto.randomUUID(),
            state: 'SENDING',
            text,
        };
        setPending((items) => [
            ...items.filter((candidate) => candidate.clientId !== optimistic.clientId),
            { ...optimistic, state: 'SENDING' },
        ]);
        if (!item) {
            setDraft('');
            sessionStorage.removeItem(storageKey);
        }
        try {
            const created = await client.sendConversationMessage(matchId, { text }, optimistic.idempotencyKey);
            setPending((items) => items.filter((candidate) => candidate.clientId !== optimistic.clientId));
            setMessages((items) => mergeMessages(items, [created]));
        } catch (error) {
            setPending((items) =>
                items.map((candidate) =>
                    candidate.clientId === optimistic.clientId ? { ...candidate, state: 'FAILED' } : candidate
                )
            );
            setNotice(messageFor(error));
        }
    }

    async function edit(message: Message) {
        const text = window.prompt('Исправьте сообщение', message.text ?? '')?.trim();
        if (!text || !online) return;
        try {
            const updated = await client.editConversationMessage(
                matchId,
                message.id,
                { expectedRevision: message.revision, text },
                crypto.randomUUID()
            );
            setMessages((items) => mergeMessages(items, [updated]));
        } catch (error) {
            setNotice(messageFor(error));
            if (error instanceof ApiError && error.response?.error.code === 'MESSAGE_REVISION_CONFLICT')
                await loadSnapshot();
        }
    }

    async function remove(message: Message) {
        if (!online || !window.confirm('Удалить сообщение?')) return;
        try {
            const updated = await client.deleteConversationMessage(
                matchId,
                message.id,
                message.revision,
                crypto.randomUUID()
            );
            setMessages((items) => mergeMessages(items, [updated]));
        } catch (error) {
            setNotice(messageFor(error));
        }
    }

    async function report(message: Message) {
        if (!online) return;
        try {
            await client.reportConversationMessage(
                matchId,
                message.id,
                { reason: reportReason, revision: message.revision },
                crypto.randomUUID()
            );
            setReported((items) => new Set(items).add(message.id));
            setNotice('Жалоба отправлена.');
        } catch (error) {
            setNotice(messageFor(error));
        }
    }

    async function toggleBlock(message: Message, blocked: boolean) {
        if (!message.authorId || !online) return;
        try {
            if (blocked) await client.unblockCommunicationUser(message.authorId, crypto.randomUUID());
            else await client.blockCommunicationUser(message.authorId, crypto.randomUUID());
            await loadSnapshot();
        } catch (error) {
            setNotice(messageFor(error));
        }
    }

    return (
        <main className="communications-main">
            <Link to={`/matches/${matchId}`}>← К матчу</Link>
            <header className="communications-heading">
                <div>
                    <p className="eyebrow">Матч</p>
                    <h1>Чат</h1>
                </div>
                <span className={`connection-state state-${connection.toLowerCase()}`} aria-label="Состояние связи">
                    {connection === 'LIVE' ? 'В сети' : connection === 'OFFLINE' ? 'Без сети' : 'Подключаемся…'}
                </span>
            </header>
            {notice && <p role="status">{notice}</p>}
            {backwardCursor && (
                <button type="button" onClick={() => void loadOlder()}>
                    Загрузить более ранние
                </button>
            )}
            <ol className="chat-stream" aria-label="Сообщения чата" aria-live="polite" aria-relevant="additions text">
                {messages.map((message) => {
                    const own = message.authorId === userId;
                    const blocked = message.kind === 'USER' && message.text === null && message.deletedAt === null;
                    return (
                        <li
                            className={message.kind === 'SYSTEM' ? 'system-message' : own ? 'own-message' : ''}
                            key={message.id}
                        >
                            {message.kind === 'SYSTEM' ? (
                                <p>{message.systemType ? systemLabels[message.systemType] : 'Событие матча'}</p>
                            ) : (
                                <>
                                    <p>
                                        {message.deletedAt
                                            ? 'Сообщение удалено'
                                            : blocked
                                              ? 'Сообщение заблокированного пользователя скрыто'
                                              : message.text}
                                    </p>
                                    {message.editedAt && !message.deletedAt && <small>изменено</small>}
                                    {!message.deletedAt && !blocked && (
                                        <div className="message-actions">
                                            {own ? (
                                                <>
                                                    <button disabled={!online} onClick={() => void edit(message)}>
                                                        Изменить
                                                    </button>
                                                    <button disabled={!online} onClick={() => void remove(message)}>
                                                        Удалить
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        disabled={!online || reported.has(message.id)}
                                                        onClick={() => void report(message)}
                                                    >
                                                        {reported.has(message.id)
                                                            ? 'Жалоба отправлена'
                                                            : 'Пожаловаться'}
                                                    </button>
                                                    <button
                                                        disabled={!online}
                                                        onClick={() => void toggleBlock(message, false)}
                                                    >
                                                        Заблокировать
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                    {blocked && (
                                        <button disabled={!online} onClick={() => void toggleBlock(message, true)}>
                                            Разблокировать и показать
                                        </button>
                                    )}
                                </>
                            )}
                            <time dateTime={message.createdAt}>{formatDate(message.createdAt, timeZone)}</time>
                        </li>
                    );
                })}
                {pending.map((message) => (
                    <li className="own-message pending-message" key={message.clientId}>
                        <p>{message.text}</p>
                        <small>{message.state === 'SENDING' ? 'Отправляется…' : 'Не отправлено'}</small>
                        {message.state === 'FAILED' && (
                            <button disabled={!online} onClick={() => void send(message)}>
                                Повторить
                            </button>
                        )}
                    </li>
                ))}
            </ol>
            {conversation?.state === 'READ_ONLY' ? (
                <p className="readonly-notice">Чат доступен только для чтения.</p>
            ) : (
                <form
                    className="chat-composer"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void send();
                    }}
                >
                    <label>
                        Сообщение
                        <textarea
                            maxLength={2_000}
                            value={draft}
                            onChange={(event) => {
                                setDraft(event.target.value);
                            }}
                            placeholder={online ? 'Напишите сообщение' : 'Черновик сохранится на этом устройстве'}
                        />
                    </label>
                    <button className="primary-action" disabled={!online || !draft.trim()} type="submit">
                        Отправить
                    </button>
                </form>
            )}
            <label className="report-reason">
                Причина жалобы
                <select
                    value={reportReason}
                    onChange={(event) => {
                        setReportReason(event.target.value as typeof reportReason);
                    }}
                >
                    <option value="SPAM">Спам</option>
                    <option value="HARASSMENT">Домогательство</option>
                    <option value="HATE">Ненависть</option>
                    <option value="THREAT">Угроза</option>
                    <option value="OTHER">Другое</option>
                </select>
            </label>
            <span className="visually-hidden">Курсор синхронизации: {catchUpCursor ? 'получен' : 'ожидается'}</span>
        </main>
    );
}

export function NotificationBadge({ client }: { readonly client: IdentityClient }) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        let active = true;
        const load = () => {
            void client
                .listNotifications(undefined, 50)
                .then((page) => {
                    if (active) setCount(page.items.filter((item) => item.readAt === null).length);
                })
                .catch(() => undefined);
        };
        const interval = window.setInterval(load, 30_000);
        window.addEventListener('picklehub:notifications-changed', load);
        load();
        return () => {
            active = false;
            window.clearInterval(interval);
            window.removeEventListener('picklehub:notifications-changed', load);
        };
    }, [client]);
    return (
        <span aria-label={`${String(count)} непрочитанных уведомлений`}>{count > 0 ? ` · ${String(count)}` : ''}</span>
    );
}

export function NotificationsScreen({ client, online }: { readonly client: IdentityClient; readonly online: boolean }) {
    const navigate = useNavigate();
    const [items, setItems] = useState<readonly Notification[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [preference, setPreference] = useState<Preference>();
    const [providers, setProviders] = useState<ReadonlySet<string>>(new Set());
    const [notice, setNotice] = useState<string>();
    const categories = useMemo(() => Object.keys(categoryLabels) as Category[], []);

    const load = useCallback(async () => {
        try {
            const page = await client.listNotifications();
            const [settings, identities] = await Promise.all([
                client.getNotificationPreferences(),
                client.getIdentities(),
            ]);
            setItems(page.items);
            setCursor(page.pageInfo.nextCursor);
            setPreference(settings);
            setProviders(new Set(identities.items.map((item) => item.provider)));
        } catch (error) {
            setNotice(messageFor(error));
        }
    }, [client]);
    useEffect(() => {
        const pendingLoad = window.setTimeout(() => void load(), 0);
        return () => {
            window.clearTimeout(pendingLoad);
        };
    }, [load]);

    async function open(item: Notification, openedAt: number) {
        if (!item.route.startsWith('/') || item.route.startsWith('//')) {
            setNotice('Ссылка уведомления недоступна.');
            return;
        }
        if (!item.readAt && online) {
            try {
                await client.markNotificationRead(item.id, crypto.randomUUID());
                setItems((current) =>
                    current.map((candidate) =>
                        candidate.id === item.id ? { ...candidate, readAt: new Date().toISOString() } : candidate
                    )
                );
                window.dispatchEvent(new Event('picklehub:notifications-changed'));
            } catch (error) {
                setNotice(messageFor(error));
                return;
            }
        }
        const age = openedAt - new Date(item.createdAt).getTime();
        disabledAnalytics.track({
            name: 'notification_opened',
            ageBucket: age < 300_000 ? 'LT_5M' : age < 3_600_000 ? '5M_1H' : 'GT_1H',
            category: item.category,
            channel: 'IN_APP',
        });
        void navigate(item.route);
    }

    async function loadMore() {
        if (!cursor) return;
        try {
            const page = await client.listNotifications(cursor);
            setItems((current) => [
                ...current,
                ...page.items.filter((item) => !current.some((old) => old.id === item.id)),
            ]);
            setCursor(page.pageInfo.nextCursor);
        } catch (error) {
            setNotice(messageFor(error));
        }
    }

    function enabled(category: Category, channel: Channel): boolean {
        return (
            preference?.channels.find((item) => item.category === category && item.channel === channel)?.enabled ??
            channel === 'IN_APP'
        );
    }

    function toggle(category: Category, channel: Channel, value: boolean) {
        if (!preference) return;
        const channels = preference.channels.map((item) =>
            item.category === category && item.channel === channel ? { ...item, enabled: value } : item
        );
        setPreference({ ...preference, channels });
    }

    async function savePreferences() {
        if (!preference || !online) return;
        try {
            const saved = await client.updateNotificationPreferences(
                {
                    channels: preference.channels,
                    expectedVersion: preference.version,
                    locale: preference.locale,
                    quietHours: preference.quietHours,
                    timeZone: preference.timeZone,
                },
                crypto.randomUUID()
            );
            setPreference(saved);
            setNotice('Настройки сохранены.');
        } catch (error) {
            setNotice(messageFor(error));
            if (error instanceof ApiError && error.response?.error.code === 'PREFERENCE_VERSION_CONFLICT') await load();
        }
    }

    return (
        <main className="communications-main">
            <header className="communications-heading">
                <div>
                    <p className="eyebrow">События</p>
                    <h1>Уведомления</h1>
                </div>
            </header>
            {notice && <p role="status">{notice}</p>}
            {items.length === 0 ? (
                <p>Новых уведомлений пока нет.</p>
            ) : (
                <ul className="notification-list">
                    {items.map((item) => (
                        <li className={item.readAt ? '' : 'unread-notification'} key={item.id}>
                            <button
                                type="button"
                                onClick={(event) => {
                                    void open(item, performance.timeOrigin + event.timeStamp);
                                }}
                            >
                                <strong>{notificationLabels[item.type]}</strong>
                                <span>
                                    {categoryLabels[item.category]} ·{' '}
                                    {formatDate(item.createdAt, preference?.timeZone ?? 'Europe/Moscow')}
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            {cursor && <button onClick={() => void loadMore()}>Показать ещё</button>}
            {preference && (
                <section className="preference-panel" aria-labelledby="preference-title">
                    <h2 id="preference-title">Каналы и категории</h2>
                    <p>В приложении уведомления включены всегда. Telegram и email не гарантируют доставку.</p>
                    {!providers.has('TELEGRAM') && <p>Привяжите Telegram в аккаунте, чтобы включить этот канал.</p>}
                    {!providers.has('EMAIL') && <p>Привяжите email в аккаунте, чтобы включить этот канал.</p>}
                    <div className="preference-grid" role="group" aria-label="Каналы уведомлений">
                        {categories.map((category) => (
                            <fieldset key={category}>
                                <legend>{categoryLabels[category]}</legend>
                                {(['IN_APP', 'TELEGRAM', 'EMAIL'] as const).map((channel) => (
                                    <label className="check" key={channel}>
                                        <input
                                            checked={enabled(category, channel)}
                                            disabled={
                                                channel === 'IN_APP' ||
                                                (channel === 'TELEGRAM'
                                                    ? !providers.has('TELEGRAM')
                                                    : !providers.has('EMAIL'))
                                            }
                                            type="checkbox"
                                            onChange={(event) => {
                                                toggle(category, channel, event.target.checked);
                                            }}
                                        />
                                        <span>
                                            {channel === 'IN_APP'
                                                ? 'В приложении'
                                                : channel === 'TELEGRAM'
                                                  ? 'Telegram'
                                                  : 'Email'}
                                        </span>
                                    </label>
                                ))}
                            </fieldset>
                        ))}
                    </div>
                    <div className="inline-fields">
                        <label>
                            Часовой пояс
                            <input
                                value={preference.timeZone}
                                onChange={(event) => {
                                    setPreference({ ...preference, timeZone: event.target.value });
                                }}
                            />
                        </label>
                        <label>
                            Язык
                            <input
                                value={preference.locale}
                                onChange={(event) => {
                                    setPreference({ ...preference, locale: event.target.value });
                                }}
                            />
                        </label>
                    </div>
                    <label className="check">
                        <input
                            type="checkbox"
                            checked={preference.quietHours.enabled}
                            onChange={(event) => {
                                setPreference({
                                    ...preference,
                                    quietHours: { ...preference.quietHours, enabled: event.target.checked },
                                });
                            }}
                        />
                        <span>Тихие часы</span>
                    </label>
                    <div className="inline-fields">
                        <label>
                            Начало
                            <input
                                type="time"
                                value={preference.quietHours.startLocal}
                                onChange={(event) => {
                                    setPreference({
                                        ...preference,
                                        quietHours: { ...preference.quietHours, startLocal: event.target.value },
                                    });
                                }}
                            />
                        </label>
                        <label>
                            Конец
                            <input
                                type="time"
                                value={preference.quietHours.endLocal}
                                onChange={(event) => {
                                    setPreference({
                                        ...preference,
                                        quietHours: { ...preference.quietHours, endLocal: event.target.value },
                                    });
                                }}
                            />
                        </label>
                    </div>
                    <p>
                        Критические изменения могут прийти во время тишины, если соответствующий внешний канал включён.
                    </p>
                    <button className="primary-action" disabled={!online} onClick={() => void savePreferences()}>
                        Сохранить настройки
                    </button>
                </section>
            )}
        </main>
    );
}
