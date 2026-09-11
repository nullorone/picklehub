import { ApiError, type components, type createIdentityClient, type operations } from '@picklehub/api-client';
import { disabledAnalytics } from '@picklehub/analytics';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

type Client = ReturnType<typeof createIdentityClient>;
type Club = components['schemas']['Club'];
type Member = components['schemas']['ClubMembership'];
type Rule = components['schemas']['RecurringMatchRule'];

const policyLabel = { APPROVAL: 'Вступление по заявке', INVITE_ONLY: 'Только по приглашению', OPEN: 'Открытый клуб' };
const roleLabel = { ADMIN: 'Администратор', MEMBER: 'Участник', OWNER: 'Владелец' };

function errorMessage(error: unknown): string {
    if (error instanceof ApiError) {
        if (error.status === 403) return 'У вас нет разрешения на это действие.';
        if (error.status === 409) return 'Данные изменились. Загрузите свежую версию и повторите действие.';
        return error.response?.error.message ?? 'Не удалось выполнить запрос.';
    }
    return 'Не удалось выполнить запрос.';
}

function formValue(data: FormData, name: string): string {
    const value = data.get(name);
    return typeof value === 'string' ? value : '';
}

function State({ message, retry }: { readonly message: string; readonly retry?: () => void }) {
    return (
        <div className="state-card" role="status">
            <p>{message}</p>
            {retry && <button onClick={retry}>Повторить</button>}
        </div>
    );
}

export function ClubsScreen({
    client,
    online,
    signedIn,
    channel,
}: {
    readonly client: Client;
    readonly online: boolean;
    readonly signedIn: boolean;
    readonly channel: 'web' | 'telegram';
}) {
    const navigate = useNavigate();
    const [items, setItems] = useState<readonly components['schemas']['ClubSummary'][]>([]);
    const [query, setQuery] = useState('');
    const [locality, setLocality] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [createOpen, setCreateOpen] = useState(false);
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const filters: NonNullable<operations['searchClubs']['parameters']['query']> = {
                limit: 50,
                ...(locality.trim() ? { locality: locality.trim() } : {}),
                ...(query.trim() ? { query: query.trim() } : {}),
            };
            const result = (await client.searchClubs(filters)).items;
            setItems(result);
            disabledAnalytics.track({
                channel,
                filter: locality.trim() ? 'LOCALITY' : 'NONE',
                name: 'club_search_completed',
                resultBucket:
                    result.length === 0
                        ? 'ZERO'
                        : result.length <= 5
                          ? 'ONE_FIVE'
                          : result.length <= 20
                            ? 'SIX_TWENTY'
                            : 'GT_TWENTY',
            });
        } catch (reason) {
            setError(errorMessage(reason));
        } finally {
            setLoading(false);
        }
    }, [channel, client, locality, query]);
    useEffect(() => void load(), [load]);
    async function create(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!online) return;
        const data = new FormData(event.currentTarget);
        try {
            const club = await client.createClub({
                description: formValue(data, 'description').trim(),
                locality: formValue(data, 'locality').trim(),
                membershipPolicy: formValue(data, 'policy') as Club['membershipPolicy'],
                name: formValue(data, 'name').trim(),
            });
            void navigate(`/clubs/${club.id}`);
        } catch (reason) {
            setError(errorMessage(reason));
        }
    }
    return (
        <main className="shell-main clubs-screen">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Сообщества</p>
                    <h1>Клубы</h1>
                </div>
                {signedIn && (
                    <button
                        className="primary-action"
                        onClick={() => {
                            setCreateOpen(!createOpen);
                        }}
                    >
                        Создать клуб
                    </button>
                )}
            </div>
            {createOpen && (
                <form className="state-card club-form" onSubmit={(event) => void create(event)}>
                    <h2>Новый клуб</h2>
                    <label>
                        Название
                        <input name="name" minLength={2} maxLength={120} required />
                    </label>
                    <label>
                        Город
                        <input name="locality" required />
                    </label>
                    <label>
                        Описание
                        <textarea name="description" maxLength={2000} />
                    </label>
                    <label>
                        Вступление
                        <select name="policy" defaultValue="OPEN">
                            <option value="OPEN">Открытое</option>
                            <option value="APPROVAL">По заявке</option>
                            <option value="INVITE_ONLY">По приглашению</option>
                        </select>
                    </label>
                    <button className="primary-action" disabled={!online}>
                        Создать
                    </button>
                </form>
            )}
            <form
                className="match-filters"
                onSubmit={(event) => {
                    event.preventDefault();
                    void load();
                }}
            >
                <label>
                    Название
                    <input
                        value={query}
                        onChange={(event) => {
                            setQuery(event.target.value);
                        }}
                    />
                </label>
                <label>
                    Город
                    <input
                        value={locality}
                        onChange={(event) => {
                            setLocality(event.target.value);
                        }}
                    />
                </label>
                <button className="primary-action" disabled={loading}>
                    Найти
                </button>
            </form>
            {loading ? (
                <State message="Загружаем клубы…" />
            ) : error ? (
                <State
                    message={error}
                    retry={() => {
                        void load();
                    }}
                />
            ) : items.length === 0 ? (
                <State message="Клубы не найдены. Измените фильтры или создайте первый клуб." />
            ) : (
                <ul className="result-list club-list">
                    {items.map((club) => (
                        <li key={club.id}>
                            <Link className="result-card" to={`/clubs/${club.id}`}>
                                <strong>{club.name}</strong>
                                <span>
                                    {club.locality} · {club.memberCount} участников
                                </span>
                                <span>{policyLabel[club.membershipPolicy]}</span>
                                {club.venueIds.length === 0 && <span>Без привязанных площадок</span>}
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}

export function ClubDetailsScreen({
    client,
    online,
    signedIn,
    userId,
}: {
    readonly client: Client;
    readonly online: boolean;
    readonly signedIn: boolean;
    readonly userId: string | undefined;
}) {
    const { clubId = '' } = useParams();
    const [club, setClub] = useState<Club>();
    const [members, setMembers] = useState<readonly Member[]>([]);
    const [requests, setRequests] = useState<readonly components['schemas']['ClubJoinRequest'][]>([]);
    const [invitations, setInvitations] = useState<readonly components['schemas']['ClubInvitation'][]>([]);
    const [rules, setRules] = useState<readonly Rule[]>([]);
    const [occurrences, setOccurrences] = useState<
        Record<string, readonly components['schemas']['RecurringMatchOccurrence'][]>
    >({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const me = members.find((member) => member.userId === userId && member.state === 'ACTIVE');
    const manager = me?.role === 'OWNER' || me?.role === 'ADMIN';
    const owner = me?.role === 'OWNER';
    const refresh = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [nextClub, venuePage] = await Promise.all([client.getClub(clubId), client.listClubVenues(clubId)]);
            setClub({ ...nextClub, venues: venuePage.items });
            if (signedIn) {
                try {
                    setMembers((await client.listClubMembers(clubId)).items);
                } catch (reason) {
                    if (!(reason instanceof ApiError && reason.status === 403)) throw reason;
                }
            }
        } catch (reason) {
            setError(errorMessage(reason));
        } finally {
            setLoading(false);
        }
    }, [client, clubId, signedIn]);
    useEffect(() => void refresh(), [refresh]);
    const loadManagement = useCallback(async () => {
        if (!manager) return;
        try {
            const [requestPage, invitationPage, rulePage] = await Promise.all([
                client.listClubJoinRequests(clubId),
                client.listClubInvitations(clubId),
                client.listRecurringMatchRules(clubId),
            ]);
            setRequests(requestPage.items);
            setInvitations(invitationPage.items);
            setRules(rulePage.items);
        } catch (reason) {
            setError(errorMessage(reason));
        }
    }, [client, clubId, manager]);
    useEffect(() => void loadManagement(), [loadManagement]);
    async function action(run: () => Promise<unknown>, success: string) {
        if (!online) {
            setError('Для изменения требуется подключение к интернету.');
            return;
        }
        setNotice('');
        setError('');
        try {
            await run();
            setNotice(success);
            await refresh();
            await loadManagement();
        } catch (reason) {
            setError(errorMessage(reason));
        }
    }
    if (loading && !club)
        return (
            <main className="shell-main">
                <State message="Загружаем клуб…" />
            </main>
        );
    if (!club)
        return (
            <main className="shell-main">
                <State message={error || 'Клуб не найден.'} retry={() => void refresh()} />
            </main>
        );
    return (
        <main className="shell-main clubs-screen">
            <Link to="/clubs">← Все клубы</Link>
            <section className="hero-card">
                <div className="hero-copy">
                    <p className="eyebrow">{club.locality}</p>
                    <h1>{club.name}</h1>
                    <p>{club.description || 'Описание пока не добавлено.'}</p>
                    <p>
                        {policyLabel[club.membershipPolicy]} · {club.memberCount} участников
                    </p>
                </div>
            </section>
            {club.state === 'ARCHIVED' && (
                <State message="Клуб в архиве: вступление, приглашения и новые события недоступны. История сохранена." />
            )}
            {!online && <State message="Показаны последние загруженные данные. Изменения недоступны без сети." />}
            {error && <State message={error} retry={() => void refresh()} />}
            {notice && (
                <p className="success-banner" role="status">
                    {notice}
                </p>
            )}
            {signedIn && club.state === 'ACTIVE' && !me && (
                <button
                    className="primary-action"
                    disabled={!online || club.membershipPolicy === 'INVITE_ONLY'}
                    onClick={() =>
                        void action(
                            () => client.joinClub(club.id, club.version),
                            club.membershipPolicy === 'OPEN' ? 'Вы вступили в клуб.' : 'Заявка отправлена.'
                        )
                    }
                >
                    {club.membershipPolicy === 'OPEN'
                        ? 'Вступить'
                        : club.membershipPolicy === 'APPROVAL'
                          ? 'Подать заявку'
                          : 'Нужно приглашение'}
                </button>
            )}
            {!signedIn && (
                <p>
                    <Link to="/login">Войдите</Link>, чтобы вступить и увидеть доступные вам действия.
                </p>
            )}
            <section aria-labelledby="venues-title">
                <h2 id="venues-title">Площадки</h2>
                {club.venues.length === 0 ? (
                    <State message="У клуба пока нет привязанных площадок. Клуб может работать без них." />
                ) : (
                    <ul className="result-list">
                        {club.venues.map((venue) => (
                            <li key={venue.venueId}>
                                <Link to={`/venues?venueId=${venue.venueId}`}>Открыть площадку</Link>
                                {manager && (
                                    <button
                                        disabled={!online}
                                        onClick={() =>
                                            void action(
                                                () => client.unlinkClubVenue(club.id, venue.venueId, club.version),
                                                'Связь с площадкой удалена. Сама площадка и история сохранены.'
                                            )
                                        }
                                    >
                                        Отвязать
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
                {manager && (
                    <form
                        className="inline-form"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const venueId = formValue(new FormData(event.currentTarget), 'venueId');
                            void action(
                                () => client.linkClubVenue(club.id, { expectedVersion: club.version, venueId }),
                                'Площадка привязана.'
                            );
                        }}
                    >
                        <label>
                            ID канонической площадки
                            <input name="venueId" required />
                        </label>
                        <button disabled={!online}>Привязать</button>
                    </form>
                )}
            </section>
            {me && (
                <Roster
                    club={club}
                    client={client}
                    members={members}
                    online={online}
                    manager={manager}
                    owner={owner}
                    userId={userId}
                    action={action}
                />
            )}
            {manager && (
                <Management
                    club={club}
                    client={client}
                    requests={requests}
                    invitations={invitations}
                    rules={rules}
                    occurrences={occurrences}
                    setOccurrences={setOccurrences}
                    online={online}
                    owner={owner}
                    action={action}
                />
            )}
            <section>
                <h2>События клуба</h2>
                <p>
                    Каждая встреча имеет собственные места и участников. Изменение серии не меняет уже созданную
                    встречу.
                </p>
                {Object.values(occurrences)
                    .flat()
                    .filter((item) => item.matchId).length === 0 ? (
                    <State message="Доступных клубных встреч пока нет." />
                ) : (
                    <ul>
                        {Object.values(occurrences)
                            .flat()
                            .filter((item): item is typeof item & { readonly matchId: string } => item.matchId !== null)
                            .map((item) => (
                                <li key={item.id}>
                                    <Link to={`/matches/${item.matchId}`}>
                                        {new Date(item.startsAt ?? '').toLocaleString('ru-RU')}
                                    </Link>{' '}
                                    <span className="status-pill">Встреча создана из серии</span>
                                </li>
                            ))}
                    </ul>
                )}
                <Link className="secondary-action" to="/matches">
                    Все публичные матчи
                </Link>
            </section>
        </main>
    );
}

function Roster({
    club,
    client,
    members,
    online,
    manager,
    owner,
    userId,
    action,
}: {
    readonly club: Club;
    readonly client: Client;
    readonly members: readonly Member[];
    readonly online: boolean;
    readonly manager: boolean;
    readonly owner: boolean;
    readonly userId: string | undefined;
    readonly action: (run: () => Promise<unknown>, message: string) => Promise<void>;
}) {
    return (
        <section>
            <h2>Состав</h2>
            <ul className="result-list">
                {members.map((member) => (
                    <li className="state-card" key={member.id}>
                        <Link to={`/players/${member.userId}`}>
                            {member.userId === userId ? 'Вы' : `Игрок ${member.userId.slice(0, 8)}`}
                        </Link>
                        <span>{roleLabel[member.role]}</span>
                        {owner && member.role !== 'OWNER' && (
                            <>
                                <button
                                    disabled={!online}
                                    onClick={() =>
                                        void action(
                                            () =>
                                                client.changeClubMemberRole(club.id, member.id, {
                                                    expectedClubVersion: club.version,
                                                    expectedRevision: member.revision,
                                                    reasonCode: 'MANAGER_DECISION',
                                                    role: member.role === 'ADMIN' ? 'MEMBER' : 'ADMIN',
                                                }),
                                            'Роль обновлена.'
                                        )
                                    }
                                >
                                    {member.role === 'ADMIN' ? 'Сделать участником' : 'Сделать администратором'}
                                </button>
                                <button
                                    disabled={!online}
                                    onClick={() =>
                                        void action(
                                            () =>
                                                client.transferClubOwnership(club.id, {
                                                    expectedVersion: club.version,
                                                    reasonCode: 'OWNER_TRANSFER',
                                                    targetMembershipId: member.id,
                                                }),
                                            'Владение передано.'
                                        )
                                    }
                                >
                                    Передать владение
                                </button>
                            </>
                        )}
                        {manager && member.role === 'MEMBER' && member.userId !== userId && (
                            <>
                                <button
                                    disabled={!online}
                                    onClick={() =>
                                        void action(
                                            () =>
                                                client.excludeClubMember(club.id, member.id, {
                                                    expectedClubVersion: club.version,
                                                    expectedRevision: member.revision,
                                                    reasonCode: 'MANAGER_DECISION',
                                                }),
                                            'Участник исключён. История встреч сохранена.'
                                        )
                                    }
                                >
                                    Исключить
                                </button>
                                <button
                                    disabled={!online}
                                    onClick={() =>
                                        void action(
                                            () =>
                                                client.blockClubMember(club.id, member.id, {
                                                    expectedClubVersion: club.version,
                                                    expectedRevision: member.revision,
                                                    reasonCode: 'SAFETY_DECISION',
                                                }),
                                            'Участник исключён и заблокирован в этом клубе.'
                                        )
                                    }
                                >
                                    Исключить и заблокировать
                                </button>
                            </>
                        )}
                    </li>
                ))}
            </ul>
            {members.find((member) => member.userId === userId)?.role !== 'OWNER' && (
                <button
                    disabled={!online}
                    onClick={() => {
                        const member = members.find((item) => item.userId === userId);
                        if (member)
                            void action(
                                () => client.leaveClub(club.id, member.id, club.version, member.revision),
                                'Вы вышли из клуба.'
                            );
                    }}
                >
                    Выйти из клуба
                </button>
            )}
        </section>
    );
}

function Management({
    club,
    client,
    requests,
    invitations,
    rules,
    occurrences,
    setOccurrences,
    online,
    owner,
    action,
}: {
    readonly club: Club;
    readonly client: Client;
    readonly requests: readonly components['schemas']['ClubJoinRequest'][];
    readonly invitations: readonly components['schemas']['ClubInvitation'][];
    readonly rules: readonly Rule[];
    readonly occurrences: Record<string, readonly components['schemas']['RecurringMatchOccurrence'][]>;
    readonly setOccurrences: (
        value: Record<string, readonly components['schemas']['RecurringMatchOccurrence'][]>
    ) => void;
    readonly online: boolean;
    readonly owner: boolean;
    readonly action: (run: () => Promise<unknown>, message: string) => Promise<void>;
}) {
    return (
        <section className="club-management" aria-labelledby="manage-title">
            <h2 id="manage-title">Управление клубом</h2>
            <details>
                <summary>Профиль и политика</summary>
                <form
                    className="club-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void action(
                            () =>
                                client.updateClub(club.id, {
                                    description: formValue(data, 'description'),
                                    expectedVersion: club.version,
                                    membershipPolicy: formValue(data, 'policy') as Club['membershipPolicy'],
                                    name: formValue(data, 'name'),
                                    locality: formValue(data, 'locality'),
                                }),
                            'Профиль клуба обновлён.'
                        );
                    }}
                >
                    <label>
                        Название
                        <input name="name" defaultValue={club.name} required />
                    </label>
                    <label>
                        Город
                        <input name="locality" defaultValue={club.locality} required />
                    </label>
                    <label>
                        Описание
                        <textarea name="description" defaultValue={club.description} />
                    </label>
                    <label>
                        Вступление
                        <select name="policy" defaultValue={club.membershipPolicy}>
                            <option value="OPEN">Открытое</option>
                            <option value="APPROVAL">По заявке</option>
                            <option value="INVITE_ONLY">По приглашению</option>
                        </select>
                    </label>
                    <button disabled={!online}>Сохранить</button>
                </form>
                {owner && (
                    <button
                        disabled={!online}
                        onClick={() =>
                            void action(
                                () =>
                                    club.state === 'ACTIVE'
                                        ? client.archiveClub(club.id, {
                                              expectedVersion: club.version,
                                              reasonCode: 'OWNER_DECISION',
                                          })
                                        : client.restoreClub(club.id, {
                                              expectedVersion: club.version,
                                              reasonCode: 'OWNER_DECISION',
                                          }),
                                club.state === 'ACTIVE' ? 'Клуб архивирован.' : 'Клуб восстановлен.'
                            )
                        }
                    >
                        {club.state === 'ACTIVE' ? 'Архивировать клуб' : 'Восстановить клуб'}
                    </button>
                )}
            </details>
            <details>
                <summary>Заявки ({requests.filter((item) => item.state === 'PENDING').length})</summary>
                {requests.length === 0 ? (
                    <p>Новых заявок нет.</p>
                ) : (
                    <ul>
                        {requests.map((request) => (
                            <li key={request.id}>
                                Игрок {request.requesterId.slice(0, 8)} · {request.state}
                                {request.state === 'PENDING' && (
                                    <>
                                        <button
                                            disabled={!online}
                                            onClick={() =>
                                                void action(
                                                    () =>
                                                        client.decideClubJoinRequest(
                                                            club.id,
                                                            request.id,
                                                            'approve',
                                                            club.version,
                                                            request.revision
                                                        ),
                                                    'Заявка одобрена.'
                                                )
                                            }
                                        >
                                            Одобрить
                                        </button>
                                        <button
                                            disabled={!online}
                                            onClick={() =>
                                                void action(
                                                    () =>
                                                        client.decideClubJoinRequest(
                                                            club.id,
                                                            request.id,
                                                            'reject',
                                                            club.version,
                                                            request.revision
                                                        ),
                                                    'Заявка отклонена.'
                                                )
                                            }
                                        >
                                            Отклонить
                                        </button>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </details>
            <details>
                <summary>Приглашения</summary>
                <form
                    className="inline-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const inviteeId = formValue(new FormData(event.currentTarget), 'inviteeId');
                        void action(async () => {
                            const delivery = await client.createClubInvitation(club.id, {
                                expectedVersion: club.version,
                                inviteeId,
                            });
                            await navigator.clipboard.writeText(
                                `${location.origin}/club-invitations/${delivery.token}`
                            );
                        }, 'Ссылка приглашения создана и скопирована. Покажите её только адресату.');
                    }}
                >
                    <label>
                        ID игрока
                        <input name="inviteeId" required />
                    </label>
                    <button disabled={!online}>Создать приглашение</button>
                </form>
                <ul>
                    {invitations.map((invitation) => (
                        <li key={invitation.id}>
                            {invitation.inviteeId.slice(0, 8)} · {invitation.state}
                            {invitation.state === 'PENDING' && (
                                <button
                                    disabled={!online}
                                    onClick={() =>
                                        void action(
                                            () =>
                                                client.revokeClubInvitation(
                                                    club.id,
                                                    invitation.id,
                                                    club.version,
                                                    invitation.revision
                                                ),
                                            'Приглашение отозвано.'
                                        )
                                    }
                                >
                                    Отозвать
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            </details>
            <details>
                <summary>Разовая клубная встреча</summary>
                <p>После создания это обычная независимая встреча: места и заявки управляются на экране матча.</p>
                <form
                    className="club-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void action(async () => {
                            const match = await client.createClubMatch(club.id, {
                                expectedVersion: club.version,
                                match: {
                                    description: formValue(data, 'description'),
                                    format: formValue(data, 'format') as components['schemas']['MatchFormat'],
                                    joinMode: 'AUTO',
                                    skillMax: 5,
                                    skillMin: 1,
                                    startsAt: new Date(formValue(data, 'startsAt')).toISOString(),
                                    timeZone: formValue(data, 'zone'),
                                    venueId: formValue(data, 'venueId') || null,
                                    visibility: 'PUBLIC',
                                },
                            });
                            location.assign(`/matches/${match.id}`);
                        }, 'Встреча создана.');
                    }}
                >
                    <label>
                        Описание
                        <input name="description" required />
                    </label>
                    <label>
                        Формат
                        <select name="format">
                            <option value="SINGLES">1 × 1</option>
                            <option value="DOUBLES">2 × 2</option>
                        </select>
                    </label>
                    <label>
                        Начало
                        <input name="startsAt" type="datetime-local" required />
                    </label>
                    <label>
                        Часовой пояс
                        <input name="zone" defaultValue="Europe/Moscow" required />
                    </label>
                    <label>
                        ID площадки (необязательно)
                        <input name="venueId" />
                    </label>
                    <button disabled={!online || club.state === 'ARCHIVED'}>Создать встречу</button>
                </form>
            </details>
            <details open>
                <summary>Повторяющиеся матчи</summary>
                <p>
                    Серия задаёт шаблон. Каждая созданная встреча независима: её состав и вместимость не
                    синхронизируются обратно.
                </p>
                <form
                    className="club-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void action(
                            () =>
                                client.createRecurringMatchRule(club.id, {
                                    dstGapPolicy: 'SKIP',
                                    dstOverlapPolicy: 'EARLIER_OFFSET',
                                    expectedVersion: club.version,
                                    frequency: 'WEEKLY',
                                    intervalWeeks: 1,
                                    localStartTime: formValue(data, 'time'),
                                    startsOn: formValue(data, 'date'),
                                    timeZone: formValue(data, 'zone'),
                                    weekdays: [Number(formValue(data, 'weekday'))],
                                    template: {
                                        bookingState: 'UNKNOWN',
                                        description: formValue(data, 'description'),
                                        format: 'DOUBLES',
                                        joinMode: 'AUTO',
                                        skillMax: 5,
                                        skillMin: 1,
                                        venueId: formValue(data, 'venueId'),
                                        visibility: 'PUBLIC',
                                    },
                                }),
                            'Серия создана.'
                        );
                    }}
                >
                    <label>
                        Дата начала
                        <input name="date" type="date" required />
                    </label>
                    <label>
                        Время
                        <input name="time" type="time" required />
                    </label>
                    <label>
                        День недели (1–7)
                        <input name="weekday" type="number" min="1" max="7" required />
                    </label>
                    <label>
                        Часовой пояс
                        <input name="zone" defaultValue="Europe/Moscow" required />
                    </label>
                    <label>
                        ID площадки
                        <input name="venueId" required />
                    </label>
                    <label>
                        Описание
                        <input name="description" required />
                    </label>
                    <button disabled={!online || club.state === 'ARCHIVED'}>Создать серию</button>
                </form>
                <ul>
                    {rules.map((rule) => (
                        <li className="state-card" key={rule.id}>
                            <strong>
                                {rule.state}: {rule.localStartTime}, {rule.timeZone}
                            </strong>
                            <span>
                                Версия {rule.revision}; горизонт {rule.generationHorizonDays} дней
                            </span>
                            <button
                                onClick={() => {
                                    void client.listRecurringMatchOccurrences(club.id, rule.id).then(
                                        (page) => {
                                            setOccurrences({ ...occurrences, [rule.id]: page.items });
                                        },
                                        (reason: unknown) => {
                                            void action(
                                                () =>
                                                    Promise.reject(
                                                        reason instanceof Error
                                                            ? reason
                                                            : new Error(errorMessage(reason))
                                                    ),
                                                ''
                                            );
                                        }
                                    );
                                }}
                            >
                                Показать встречи
                            </button>
                            {rule.state !== 'ENDED' && (
                                <button
                                    disabled={!online}
                                    onClick={() =>
                                        void action(
                                            () =>
                                                client.transitionRecurringMatchRule(
                                                    club.id,
                                                    rule.id,
                                                    rule.state === 'ACTIVE' ? 'pause' : 'resume',
                                                    {
                                                        expectedClubVersion: club.version,
                                                        expectedRevision: rule.revision,
                                                        reasonCode: 'MANAGER_DECISION',
                                                    }
                                                ),
                                            rule.state === 'ACTIVE'
                                                ? 'Серия приостановлена. Уже созданные встречи не изменены.'
                                                : 'Серия возобновлена без заполнения пропусков.'
                                        )
                                    }
                                >
                                    {rule.state === 'ACTIVE' ? 'Приостановить' : 'Возобновить'}
                                </button>
                            )}
                            {rule.state !== 'ENDED' && (
                                <button
                                    disabled={!online}
                                    onClick={() =>
                                        void action(
                                            () =>
                                                client.transitionRecurringMatchRule(club.id, rule.id, 'end', {
                                                    expectedClubVersion: club.version,
                                                    expectedRevision: rule.revision,
                                                    reasonCode: 'MANAGER_DECISION',
                                                }),
                                            'Серия завершена. Уже созданные встречи сохранены.'
                                        )
                                    }
                                >
                                    Завершить серию
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            </details>
        </section>
    );
}

export function ClubInvitationScreen({ client, online }: { readonly client: Client; readonly online: boolean }) {
    const { invitationToken = '' } = useParams();
    const [invitation, setInvitation] = useState<components['schemas']['ClubInvitation']>();
    const [clubVersion, setClubVersion] = useState<number>();
    const [error, setError] = useState('');
    useEffect(() => {
        void client
            .getClubInvitation(invitationToken)
            .then(async (value) => {
                setInvitation(value);
                setClubVersion((await client.getClub(value.clubId)).version);
            })
            .catch((reason: unknown) => {
                setError(errorMessage(reason));
            });
    }, [client, invitationToken]);
    if (!invitation || clubVersion === undefined)
        return (
            <main className="shell-main">
                <State message={error || 'Проверяем приглашение…'} />
            </main>
        );
    return (
        <main className="shell-main">
            <section className="state-card">
                <p className="eyebrow">Персональное приглашение</p>
                <h1>Вступить в клуб</h1>
                <p>Приглашение адресовано вашему аккаунту и не даёт прав до принятия.</p>
                <p>Статус: {invitation.state}</p>
                <button
                    className="primary-action"
                    disabled={!online || invitation.state !== 'PENDING'}
                    onClick={() =>
                        void client
                            .decideClubInvitation(invitationToken, 'accept', clubVersion, invitation.revision)
                            .then(() => {
                                location.assign(`/clubs/${invitation.clubId}`);
                            })
                            .catch((reason: unknown) => {
                                setError(errorMessage(reason));
                            })
                    }
                >
                    Принять
                </button>
                <button
                    disabled={!online || invitation.state !== 'PENDING'}
                    onClick={() =>
                        void client
                            .decideClubInvitation(invitationToken, 'decline', clubVersion, invitation.revision)
                            .then((value) => {
                                if ('inviteeId' in value) setInvitation(value);
                            })
                            .catch((reason: unknown) => {
                                setError(errorMessage(reason));
                            })
                    }
                >
                    Отклонить
                </button>
                {error && <State message={error} />}
            </section>
        </main>
    );
}
