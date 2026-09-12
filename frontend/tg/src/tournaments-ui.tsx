import { ApiError, type components, type createIdentityClient, type operations } from '@picklehub/api-client';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

type Client = ReturnType<typeof createIdentityClient>;
type Tournament = components['schemas']['Tournament'];
type Entrant = components['schemas']['Entrant'];
type FormatCode = Exclude<components['schemas']['TournamentFormatCode'], 'CUSTOM_DSL'>;

const codes: readonly FormatCode[] = [
    'AMERICANO',
    'ROUND_ROBIN',
    'SINGLE_ELIMINATION',
    'DOUBLE_ELIMINATION',
    'POOL_PLAY',
    'SWISS',
    'LADDER',
    'KING_OF_COURT',
];
const formatName: Record<FormatCode, string> = {
    AMERICANO: 'Американо',
    ROUND_ROBIN: 'Круговой',
    SINGLE_ELIMINATION: 'Олимпийский',
    DOUBLE_ELIMINATION: 'Двойное выбывание',
    POOL_PLAY: 'Группы + плей-офф',
    SWISS: 'Швейцарский',
    LADDER: 'Лестница',
    KING_OF_COURT: 'Король корта',
};
const stateName: Record<Tournament['state'], string> = {
    DRAFT: 'Черновик',
    PUBLISHED: 'Регистрация',
    CHECK_IN: 'Прибытие',
    SEEDED: 'Посев',
    IN_PROGRESS: 'Идёт',
    PAUSED: 'Пауза',
    COMPLETED: 'Завершён',
    CANCELLED: 'Отменён',
};
const paymentName: Record<components['schemas']['TournamentPaymentState'], string> = {
    NOT_REQUIRED: 'Не требуется',
    PENDING_EXTERNAL: 'Ожидается вне сервиса',
    MARKED_PAID: 'Отмечена оплаченной',
    WAIVED: 'Не требуется по решению организатора',
    REFUND_REPORTED: 'Сообщён возврат',
};

function value(data: FormData, name: string): string {
    const result = data.get(name);
    return typeof result === 'string' ? result.trim() : '';
}

function powerOfTwo(number: number): boolean {
    return number > 0 && (number & (number - 1)) === 0;
}

function moveItem(items: readonly string[], item: string, offset: -1 | 1): readonly string[] {
    const next = [...items];
    const index = next.indexOf(item);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= next.length) return items;
    const moved = next.splice(index, 1)[0];
    if (moved === undefined) return items;
    next.splice(target, 0, moved);
    return next;
}

function message(error: unknown): { readonly text: string; readonly stale: boolean } {
    if (!(error instanceof ApiError)) return { stale: false, text: 'Не удалось выполнить запрос.' };
    const code = error.response?.error.code ?? '';
    if (code.includes('VERSION_CONFLICT') || code.includes('REVISION_CONFLICT')) {
        return { stale: true, text: 'Версия устарела: кто-то уже изменил данные. Обновите экран.' };
    }
    if (code === 'TOURNAMENT_DEPENDENCY_STARTED') {
        return { stale: true, text: 'Следующая встреча уже началась. Результат не переписан.' };
    }
    if (code === 'TOURNAMENT_PROJECTION_MISMATCH') {
        return { stale: true, text: 'Проверка сетки не пройдена. Турнир должен остаться на паузе.' };
    }
    if (error.status === 403) return { stale: false, text: 'У вас нет разрешения на это действие.' };
    return { stale: false, text: error.response?.error.message ?? 'Не удалось выполнить запрос.' };
}

function State({ text, retry }: { readonly text: string; readonly retry?: () => void }) {
    return (
        <div className="state-card" role="status">
            <p>{text}</p>
            {retry && <button onClick={retry}>Обновить</button>}
        </div>
    );
}

function date(value: string, timeZone: string): string {
    try {
        return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
            new Date(value)
        );
    } catch {
        return new Date(value).toLocaleString('ru-RU');
    }
}

function buildFormat(data: FormData): {
    readonly capacity: number;
    readonly definition: components['schemas']['FormatDefinition'];
} {
    const formatCode = value(data, 'formatCode') as FormatCode;
    const capacity = Number(value(data, 'capacity'));
    const courtCount = Number(value(data, 'courtCount'));
    if (!codes.includes(formatCode) || !Number.isInteger(capacity) || !Number.isInteger(courtCount) || courtCount < 1) {
        throw new Error('Проверьте формат, вместимость и корты.');
    }
    const invalid =
        (formatCode === 'AMERICANO' && (capacity < 4 || capacity > 64 || capacity % 4 !== 0)) ||
        (formatCode === 'ROUND_ROBIN' && (capacity < 3 || capacity > 64)) ||
        (formatCode === 'SINGLE_ELIMINATION' && (capacity < 2 || capacity > 128)) ||
        (formatCode === 'DOUBLE_ELIMINATION' && (capacity < 4 || capacity > 64 || !powerOfTwo(capacity))) ||
        (formatCode === 'POOL_PLAY' && (capacity < 6 || capacity > 64)) ||
        (formatCode === 'SWISS' && (capacity < 4 || capacity > 128)) ||
        (formatCode === 'LADDER' && (capacity < 4 || capacity > 64)) ||
        (formatCode === 'KING_OF_COURT' && (capacity < 4 || capacity > 64 || capacity % 2 !== 0));
    if (invalid) throw new Error('Вместимость несовместима с выбранным форматом.');
    const base = { courtCount, schemaVersion: '1.0.0' as const };
    let configuration: components['schemas']['TournamentPresetConfiguration'];
    if (formatCode === 'AMERICANO') {
        const rounds = Number(value(data, 'rounds'));
        if (rounds < 3 || rounds > capacity - 1) throw new Error('Американо: от 3 до N−1 раундов.');
        configuration = { ...base, formatCode, rounds };
    } else if (formatCode === 'ROUND_ROBIN') {
        configuration = { ...base, formatCode, legs: Number(value(data, 'legs')) as 1 | 2 };
    } else if (formatCode === 'SINGLE_ELIMINATION') {
        configuration = { ...base, bronzeMatch: data.get('bronzeMatch') === 'on', formatCode };
    } else if (formatCode === 'DOUBLE_ELIMINATION') {
        configuration = { ...base, formatCode, grandFinalReset: true };
    } else if (formatCode === 'POOL_PLAY') {
        const poolCount = Number(value(data, 'poolCount'));
        const qualifiersPerPool = Number(value(data, 'qualifiersPerPool'));
        const wildcardCount = Number(value(data, 'wildcardCount'));
        const playoffSize = Number(value(data, 'playoffSize'));
        if (
            poolCount < Math.ceil(capacity / 6) ||
            poolCount > Math.floor(capacity / 3) ||
            qualifiersPerPool < 1 ||
            qualifiersPerPool > 5 ||
            qualifiersPerPool * poolCount + wildcardCount !== playoffSize ||
            !powerOfTwo(playoffSize) ||
            playoffSize > 32
        ) {
            throw new Error('В группе должно быть 3–6 участников, а выходящие образуют сетку 2/4/8/16/32.');
        }
        configuration = { ...base, formatCode, playoffSize, poolCount, qualifiersPerPool, wildcardCount };
    } else if (formatCode === 'SWISS') {
        const rounds = Number(value(data, 'rounds'));
        if (rounds < 3 || rounds > Math.min(9, capacity - 1)) throw new Error('Swiss: 3–9 раундов, не больше N−1.');
        configuration = { ...base, formatCode, rounds };
    } else if (formatCode === 'LADDER') {
        const rounds = Number(value(data, 'rounds'));
        const challengeSpan = Number(value(data, 'challengeSpan'));
        if (rounds < 3 || rounds > 20 || challengeSpan < 1 || challengeSpan > 5)
            throw new Error('Проверьте раунды и шаг вызова.');
        configuration = { ...base, challengeSpan, formatCode, rounds };
    } else {
        const rounds = Number(value(data, 'rounds'));
        if (rounds < 1 || rounds > 20) throw new Error('Выберите от 1 до 20 раундов.');
        configuration = { ...base, formatCode, rounds };
    }
    return {
        capacity,
        definition: {
            configuration,
            formatCode,
            playMode:
                formatCode === 'AMERICANO'
                    ? 'INDIVIDUAL_DOUBLES'
                    : (value(data, 'playMode') as components['schemas']['TournamentPlayMode']),
            scoringProfile: value(data, 'scoringProfile') as components['schemas']['TournamentScoringProfile'],
            seedingPolicy: value(data, 'seedingPolicy') as components['schemas']['TournamentSeedingPolicy'],
            strategyVersion: '1.0.0',
        },
    };
}

function PresetFields({ code }: { readonly code: FormatCode }) {
    if (code === 'ROUND_ROBIN')
        return (
            <label>
                Кругов
                <select name="legs" defaultValue="1">
                    <option value="1">Один</option>
                    <option value="2">Два</option>
                </select>
            </label>
        );
    if (code === 'SINGLE_ELIMINATION')
        return (
            <label className="check">
                <input name="bronzeMatch" type="checkbox" /> Матч за третье место
            </label>
        );
    if (code === 'DOUBLE_ELIMINATION') return <p>Повторный гранд-финал включён.</p>;
    if (code === 'POOL_PLAY')
        return (
            <>
                <label>
                    Групп
                    <input name="poolCount" type="number" min="2" max="16" defaultValue="2" required />
                </label>
                <label>
                    Из каждой
                    <input name="qualifiersPerPool" type="number" min="1" max="5" defaultValue="2" required />
                </label>
                <label>
                    Wildcards
                    <input name="wildcardCount" type="number" min="0" max="31" defaultValue="0" required />
                </label>
                <label>
                    Плей-офф
                    <input name="playoffSize" type="number" min="2" max="32" defaultValue="4" required />
                </label>
            </>
        );
    return (
        <>
            <label>
                Раундов
                <input
                    name="rounds"
                    type="number"
                    min={code === 'KING_OF_COURT' ? 1 : 3}
                    max="20"
                    defaultValue={code === 'KING_OF_COURT' ? 5 : 3}
                    required
                />
            </label>
            {code === 'LADDER' && (
                <label>
                    Шаг вызова
                    <input name="challengeSpan" type="number" min="1" max="5" defaultValue="2" required />
                </label>
            )}
        </>
    );
}

function Wizard({ client, online }: { readonly client: Client; readonly online: boolean }) {
    const navigate = useNavigate();
    const [code, setCode] = useState<FormatCode>('AMERICANO');
    const [error, setError] = useState('');
    async function create(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        try {
            const preset = buildFormat(data);
            const price = value(data, 'priceMinor');
            const tournament = await client.createTournament({
                capacity: preset.capacity,
                clubId: value(data, 'clubId') || null,
                currency: price ? value(data, 'currency').toUpperCase() : null,
                description: value(data, 'description'),
                format: preset.definition,
                name: value(data, 'name'),
                priceMinor: price ? Number(price) : null,
                registrationClosesAt: new Date(value(data, 'registrationClosesAt')).toISOString(),
                registrationOpensAt: new Date(value(data, 'registrationOpensAt')).toISOString(),
                startsAt: new Date(value(data, 'startsAt')).toISOString(),
                timeZone: value(data, 'timeZone'),
                venueId: value(data, 'venueId'),
            });
            void navigate(`/tournaments/${tournament.id}`);
        } catch (reason) {
            setError(reason instanceof Error && !(reason instanceof ApiError) ? reason.message : message(reason).text);
        }
    }
    return (
        <details className="state-card tma-tournament-wizard">
            <summary>Создать турнир</summary>
            <form onSubmit={(event) => void create(event)}>
                <label>
                    Название
                    <input name="name" maxLength={120} required />
                </label>
                <label>
                    Описание
                    <textarea name="description" maxLength={2000} />
                </label>
                <label>
                    ID площадки
                    <input name="venueId" required />
                </label>
                <label>
                    ID клуба, необязательно
                    <input name="clubId" />
                </label>
                <label>
                    Формат
                    <select
                        name="formatCode"
                        value={code}
                        onChange={(event) => {
                            setCode(event.target.value as FormatCode);
                        }}
                    >
                        {codes.map((item) => (
                            <option key={item} value={item}>
                                {formatName[item]}
                            </option>
                        ))}
                    </select>
                </label>
                {code !== 'AMERICANO' && (
                    <label>
                        Режим
                        <select name="playMode" defaultValue="SINGLES">
                            <option value="SINGLES">Одиночный</option>
                            <option value="FIXED_TEAM_DOUBLES">Готовые пары</option>
                        </select>
                    </label>
                )}
                <label>
                    Участников
                    <input name="capacity" type="number" min="2" max="128" defaultValue="8" required />
                </label>
                <label>
                    Кортов
                    <input name="courtCount" type="number" min="1" max="64" defaultValue="2" required />
                </label>
                <PresetFields key={code} code={code} />
                <label>
                    Счёт
                    <select name="scoringProfile" defaultValue="ONE_GAME_11_WIN_BY_2_CAP_15">
                        <option value="ONE_GAME_11_WIN_BY_2_CAP_15">Одна до 11</option>
                        <option value="BEST_OF_3_11_WIN_BY_2_CAP_15">До двух побед</option>
                        <option value="TIMED_GOLDEN_POINT">По времени</option>
                    </select>
                </label>
                <label>
                    Посев
                    <select name="seedingPolicy" defaultValue="REGISTRATION_ORDER">
                        <option value="REGISTRATION_ORDER">По регистрации</option>
                        <option value="MANUAL">Вручную</option>
                        <option value="RANDOM">Случайный</option>
                        <option value="RATING_SNAPSHOT">По уровню</option>
                    </select>
                </label>
                <label>
                    Часовой пояс
                    <input name="timeZone" defaultValue="Europe/Moscow" required />
                </label>
                <label>
                    Регистрация с<input name="registrationOpensAt" type="datetime-local" required />
                </label>
                <label>
                    Регистрация до
                    <input name="registrationClosesAt" type="datetime-local" required />
                </label>
                <label>
                    Начало
                    <input name="startsAt" type="datetime-local" required />
                </label>
                <label>
                    Цена в копейках
                    <input name="priceMinor" type="number" min="0" />
                </label>
                <label>
                    Валюта
                    <input name="currency" defaultValue="RUB" pattern="[A-Za-z]{3}" />
                </label>
                <div className="preset-preview" aria-live="polite">
                    <strong>{formatName[code]} · стратегия 1.0.0</strong>
                    <p>
                        Без ничьих; последнее равенство разрешает публичный жребий. Корты не бронируются, оплата
                        проходит вне PickleHub.
                    </p>
                </div>
                {error && <State text={error} />}
                <button className="primary-action" disabled={!online}>
                    Создать черновик
                </button>
            </form>
        </details>
    );
}

export function TournamentsScreen({
    client,
    online,
    signedIn,
}: {
    readonly client: Client;
    readonly online: boolean;
    readonly signedIn: boolean;
}) {
    const [items, setItems] = useState<readonly Tournament[]>([]);
    const [queryText, setQueryText] = useState('');
    const [format, setFormat] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        try {
            const filters: NonNullable<operations['searchTournaments']['parameters']['query']> = {
                limit: 30,
                ...(format ? { format: format as FormatCode } : {}),
                ...(queryText.trim() ? { query: queryText.trim() } : {}),
            };
            setItems((await client.searchTournaments(filters)).items);
            setError('');
        } catch (reason) {
            setError(message(reason).text);
        } finally {
            setLoading(false);
        }
    }, [client, format, queryText]);
    useEffect(() => void load(), [load]);
    return (
        <main className="shell-main tournaments-screen tma-tournaments">
            <p className="eyebrow">Соревнования</p>
            <h1>Турниры</h1>
            {signedIn && <Wizard client={client} online={online} />}
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
                        value={queryText}
                        onChange={(event) => {
                            setQueryText(event.target.value);
                        }}
                    />
                </label>
                <label>
                    Формат
                    <select
                        value={format}
                        onChange={(event) => {
                            setFormat(event.target.value);
                        }}
                    >
                        <option value="">Все</option>
                        {codes.map((item) => (
                            <option key={item} value={item}>
                                {formatName[item]}
                            </option>
                        ))}
                    </select>
                </label>
                <button className="primary-action" disabled={loading}>
                    Найти
                </button>
            </form>
            {loading ? (
                <State text="Загружаем турниры…" />
            ) : error ? (
                <State text={error} retry={() => void load()} />
            ) : items.length === 0 ? (
                <State text="Турниры не найдены." />
            ) : (
                <ul className="result-list tournament-list">
                    {items.map((item) => (
                        <li key={item.id}>
                            <Link className="result-card" to={`/tournaments/${item.id}`}>
                                <strong>{item.name}</strong>
                                <span>
                                    {formatName[item.format.formatCode as FormatCode]} · {stateName[item.state]}
                                </span>
                                <span>
                                    {date(item.startsAt, item.timeZone)} · {item.entrantCount}/{item.capacity}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}

function scoreList(valueText: string): components['schemas']['TournamentGameScore'][] {
    return valueText.split(',').map((item, index) => {
        const [sideOne, sideTwo] = item.trim().split(':').map(Number);
        if (!Number.isInteger(sideOne) || !Number.isInteger(sideTwo)) throw new Error('Проверьте счёт.');
        return { game: index + 1, sideOne: sideOne ?? 0, sideTwo: sideTwo ?? 0 };
    });
}

export function TournamentDetailsScreen({
    client,
    online,
    signedIn,
    userId,
}: {
    readonly client: Client;
    readonly online: boolean;
    readonly signedIn: boolean;
    readonly userId?: string | undefined;
}) {
    const { tournamentId = '' } = useParams();
    const [tournament, setTournament] = useState<Tournament>();
    const [entrants, setEntrants] = useState<readonly Entrant[]>([]);
    const [plan, setPlan] = useState<components['schemas']['TournamentPlan']>();
    const [error, setError] = useState('');
    const [stale, setStale] = useState(false);
    const [notice, setNotice] = useState('');
    const [partnerSearch, setPartnerSearch] = useState(false);
    const [seedOrder, setSeedOrder] = useState<readonly string[]>([]);
    const refresh = useCallback(async () => {
        try {
            const next = await client.getTournament(tournamentId);
            setTournament(next);
            const [nextPlan, nextEntrants] = await Promise.all([
                client.getTournamentPlan(tournamentId).catch((reason: unknown) => {
                    if (reason instanceof ApiError && reason.status === 404) return undefined;
                    throw reason;
                }),
                signedIn
                    ? client
                          .listTournamentEntrants(tournamentId)
                          .then((page) => page.items)
                          .catch((reason: unknown) => {
                              if (reason instanceof ApiError && reason.status === 403) return [];
                              throw reason;
                          })
                    : Promise.resolve([]),
            ]);
            setPlan(nextPlan);
            setEntrants(nextEntrants);
            setSeedOrder(nextEntrants.filter((entrant) => entrant.state === 'ELIGIBLE').map((entrant) => entrant.id));
            setError('');
            setStale(false);
        } catch (reason) {
            const parsed = message(reason);
            setError(parsed.text);
            setStale(parsed.stale);
        }
    }, [client, signedIn, tournamentId]);
    useEffect(() => {
        const timeout = globalThis.setTimeout(() => void refresh(), 0);
        return () => {
            globalThis.clearTimeout(timeout);
        };
    }, [refresh]);
    async function act(run: () => Promise<unknown>, success: string) {
        if (!online) {
            setError('Для изменения нужен интернет.');
            return;
        }
        try {
            await run();
            setNotice(success);
            await refresh();
        } catch (reason) {
            const parsed = message(reason);
            setError(parsed.text);
            setStale(parsed.stale);
        }
    }
    if (!tournament)
        return (
            <main className="shell-main">
                {error ? <State text={error} retry={() => void refresh()} /> : <State text="Загружаем турнир…" />}
            </main>
        );
    const organizer = tournament.organizerId === userId;
    const mine = entrants.find((entry) =>
        entry.members.some((member) => member.userId === userId && member.state === 'CONFIRMED')
    );
    return (
        <main className="shell-main tournaments-screen tma-tournaments">
            <Link to="/tournaments">← Турниры</Link>
            <section className="state-card tournament-summary">
                <span className="status-pill">{stateName[tournament.state]}</span>
                <h1>{tournament.name}</h1>
                <p>{tournament.description || 'Описание не добавлено.'}</p>
                <p>
                    {formatName[tournament.format.formatCode as FormatCode]} · стратегия{' '}
                    {tournament.format.strategyVersion}
                </p>
                <p>
                    {date(tournament.startsAt, tournament.timeZone)} ({tournament.timeZone})
                </p>
                <p>
                    {tournament.entrantCount}/{tournament.capacity}
                </p>
                <p>
                    {tournament.priceMinor === null
                        ? 'Бесплатно'
                        : `${(tournament.priceMinor / 100).toFixed(2)} ${tournament.currency ?? ''} — расчёт вне PickleHub`}
                </p>
            </section>
            {!online && <State text="Показаны загруженные данные. Изменения без сети недоступны." />}
            {error && (stale ? <State text={error} retry={() => void refresh()} /> : <State text={error} />)}
            {notice && (
                <p className="success-banner" role="status">
                    {notice}
                </p>
            )}
            {signedIn && userId && tournament.state === 'PUBLISHED' && !mine && (
                <form
                    className="state-card"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        const partner = value(data, 'partnerId');
                        const partnerMode = data.get('partnerMode') === 'on';
                        void act(
                            () =>
                                client.registerForTournament(tournament.id, {
                                    expectedVersion: tournament.version,
                                    kind: tournament.format.playMode === 'FIXED_TEAM_DOUBLES' ? 'TEAM' : 'INDIVIDUAL',
                                    memberIds: partner ? [userId, partner] : [userId],
                                    ...(partnerMode ? { partnerMatchingOptIn: true, memberIds: [userId] } : {}),
                                }),
                            'Заявка принята. Если мест нет, она сохранит очередь FIFO.'
                        );
                    }}
                >
                    <h2>Регистрация</h2>
                    {tournament.format.playMode === 'FIXED_TEAM_DOUBLES' && (
                        <>
                            <label>
                                ID партнёра
                                <input name="partnerId" disabled={partnerSearch} required={!partnerSearch} />
                            </label>
                            <label className="check">
                                <input
                                    checked={partnerSearch}
                                    name="partnerMode"
                                    type="checkbox"
                                    onChange={(event) => {
                                        setPartnerSearch(event.target.checked);
                                    }}
                                />{' '}
                                Искать партнёра автоматически
                            </label>
                            <p>Поиск включается только с вашим явным согласием.</p>
                        </>
                    )}
                    <button className="primary-action" disabled={!online || tournament.registrationGate !== 'OPEN'}>
                        Зарегистрироваться
                    </button>
                </form>
            )}
            {!signedIn && tournament.state === 'PUBLISHED' && (
                <Link className="primary-action" to="/login">
                    Войти для регистрации
                </Link>
            )}
            {mine && (
                <section className="state-card">
                    <h2>Моё участие</h2>
                    <p>
                        {mine.state}
                        {mine.state === 'WAITLISTED' && mine.fifoSequence !== null
                            ? ` · очередь ${String(mine.fifoSequence)}`
                            : ''}
                    </p>
                    <p>Оплата: {paymentName[mine.payment.state]}</p>
                    <p>Прибытие: {mine.checkInState}</p>
                    <button
                        disabled={!online || mine.checkInState !== 'PENDING'}
                        onClick={() =>
                            void act(
                                () =>
                                    client.checkInTournamentEntrant(tournament.id, mine.id, {
                                        expectedRevision: mine.revision,
                                        expectedTournamentVersion: tournament.version,
                                    }),
                                'Прибытие отмечено.'
                            )
                        }
                    >
                        Я на месте
                    </button>
                    <button
                        disabled={!online || mine.state === 'WITHDRAWN'}
                        onClick={() =>
                            void act(
                                () =>
                                    client.withdrawTournamentEntrant(tournament.id, mine.id, {
                                        expectedRevision: mine.revision,
                                        expectedTournamentVersion: tournament.version,
                                    }),
                                'Вы снялись. История сохранена.'
                            )
                        }
                    >
                        Сняться
                    </button>
                </section>
            )}
            {organizer && (
                <section className="organizer-panel">
                    <h2>Организатор</h2>
                    <div className="organizer-actions">
                        {tournament.state === 'DRAFT' && (
                            <button
                                disabled={!online}
                                onClick={() =>
                                    void act(
                                        () => client.publishTournament(tournament.id, tournament.version),
                                        'Опубликовано.'
                                    )
                                }
                            >
                                Опубликовать
                            </button>
                        )}
                        {['PUBLISHED', 'CHECK_IN'].includes(tournament.state) && (
                            <button
                                disabled={!online || entrants.filter((item) => item.state === 'ELIGIBLE').length < 2}
                                onClick={() =>
                                    void act(
                                        () =>
                                            client.seedTournament(tournament.id, {
                                                expectedVersion: tournament.version,
                                                orderedEntrantIds: seedOrder,
                                            }),
                                        'Посев готов.'
                                    )
                                }
                            >
                                Посев
                            </button>
                        )}
                        {tournament.state === 'SEEDED' && (
                            <button
                                disabled={!online}
                                onClick={() =>
                                    void act(
                                        () => client.startTournament(tournament.id, tournament.version),
                                        'Турнир начат.'
                                    )
                                }
                            >
                                Старт
                            </button>
                        )}
                        {tournament.state === 'IN_PROGRESS' && (
                            <button
                                disabled={!online}
                                onClick={() =>
                                    void act(
                                        () =>
                                            client.pauseTournament(tournament.id, {
                                                expectedVersion: tournament.version,
                                                reasonCode: 'ORGANIZER_PAUSE',
                                            }),
                                        'Пауза включена.'
                                    )
                                }
                            >
                                Пауза
                            </button>
                        )}
                        {tournament.state === 'PAUSED' && (
                            <button
                                disabled={!online}
                                onClick={() =>
                                    void act(
                                        () =>
                                            client.resumeTournament(tournament.id, {
                                                expectedVersion: tournament.version,
                                                reasonCode: 'RECOVERY_VERIFIED',
                                            }),
                                        'Сетка проверена, турнир продолжен.'
                                    )
                                }
                            >
                                Проверить и продолжить
                            </button>
                        )}
                        {tournament.state === 'IN_PROGRESS' && (
                            <button
                                disabled={!online}
                                onClick={() =>
                                    void act(
                                        () => client.completeTournament(tournament.id, tournament.version),
                                        'Турнир завершён.'
                                    )
                                }
                            >
                                Завершить
                            </button>
                        )}
                        {!['COMPLETED', 'CANCELLED'].includes(tournament.state) && (
                            <button
                                disabled={!online}
                                onClick={() =>
                                    void act(
                                        () =>
                                            client.cancelTournament(tournament.id, {
                                                expectedVersion: tournament.version,
                                                reasonCode: 'ORGANIZER_CANCELLED',
                                            }),
                                        'Турнир отменён, результаты сохранены.'
                                    )
                                }
                            >
                                Отменить
                            </button>
                        )}
                    </div>
                    <h3>Участники и внешняя оплата</h3>
                    {entrants.length === 0 ? (
                        <State text="Заявок пока нет." />
                    ) : (
                        <ol className="entrant-list">
                            {[...entrants]
                                .sort((left, right) => {
                                    const leftIndex = seedOrder.indexOf(left.id);
                                    const rightIndex = seedOrder.indexOf(right.id);
                                    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
                                })
                                .map((entry) => (
                                    <li key={entry.id}>
                                        <span>
                                            #
                                            {entry.seed ??
                                                (seedOrder.includes(entry.id)
                                                    ? seedOrder.indexOf(entry.id) + 1
                                                    : '—')}{' '}
                                            · {entry.id.slice(0, 8)} · {entry.state}
                                        </span>
                                        {entry.state === 'ELIGIBLE' &&
                                            ['PUBLISHED', 'CHECK_IN'].includes(tournament.state) && (
                                                <span>
                                                    <button
                                                        aria-label={`Поднять ${entry.id}`}
                                                        disabled={!online || seedOrder.indexOf(entry.id) <= 0}
                                                        onClick={() => {
                                                            setSeedOrder((current) => moveItem(current, entry.id, -1));
                                                        }}
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        aria-label={`Опустить ${entry.id}`}
                                                        disabled={
                                                            !online ||
                                                            seedOrder.indexOf(entry.id) >= seedOrder.length - 1
                                                        }
                                                        onClick={() => {
                                                            setSeedOrder((current) => moveItem(current, entry.id, 1));
                                                        }}
                                                    >
                                                        ↓
                                                    </button>
                                                </span>
                                            )}
                                        <select
                                            aria-label={`Оплата ${entry.id}`}
                                            value={entry.payment.state}
                                            disabled={!online}
                                            onChange={(event) =>
                                                void act(
                                                    () =>
                                                        client.markTournamentExternalPayment(tournament.id, entry.id, {
                                                            expectedRevision: entry.payment.revision,
                                                            expectedTournamentVersion: tournament.version,
                                                            reasonCode: 'ORGANIZER_MANUAL_MARK',
                                                            state: event.target
                                                                .value as components['schemas']['TournamentPaymentState'],
                                                        }),
                                                    'Статус внешней оплаты обновлён.'
                                                )
                                            }
                                        >
                                            <option value="NOT_REQUIRED">Не требуется</option>
                                            <option value="PENDING_EXTERNAL">Ожидается</option>
                                            <option value="MARKED_PAID">Оплачено вне сервиса</option>
                                            <option value="WAIVED">Освобождён</option>
                                            <option value="REFUND_REPORTED">Возврат сообщён</option>
                                        </select>
                                    </li>
                                ))}
                        </ol>
                    )}
                    <h3>Раунды</h3>
                    {plan?.rounds.map((round) => (
                        <div className="round-controls" key={round.id}>
                            <span>
                                Раунд {round.sequence}: {round.state}
                            </span>
                            <button
                                disabled={!online || round.state !== 'READY'}
                                onClick={() =>
                                    void act(
                                        () =>
                                            client.startTournamentRound(tournament.id, round.id, {
                                                expectedRevision: round.revision,
                                                expectedTournamentVersion: tournament.version,
                                            }),
                                        'Раунд начат.'
                                    )
                                }
                            >
                                Начать
                            </button>
                            <button
                                disabled={!online || round.state !== 'IN_PROGRESS'}
                                onClick={() =>
                                    void act(
                                        () =>
                                            client.completeTournamentRound(tournament.id, round.id, {
                                                expectedRevision: round.revision,
                                                expectedTournamentVersion: tournament.version,
                                            }),
                                        'Раунд завершён.'
                                    )
                                }
                            >
                                Завершить
                            </button>
                        </div>
                    ))}
                    <h3>Корты</h3>
                    {!plan || plan.matches.every((match) => match.courtAssignment === null) ? (
                        <State text="Назначения появятся в сетке. PickleHub не бронирует корты." />
                    ) : (
                        <ul>
                            {plan.matches.flatMap((match) =>
                                match.courtAssignment
                                    ? [
                                          <li key={match.id}>
                                              Встреча {match.sequence}: корт {match.courtAssignment.courtRank}, поток{' '}
                                              {match.courtAssignment.batch}
                                          </li>,
                                      ]
                                    : []
                            )}
                        </ul>
                    )}
                </section>
            )}
            {plan ? (
                <section className="tournament-plan">
                    <h2>Сетка</h2>
                    {plan.rounds.map((round) => (
                        <article className="round-card" key={round.id}>
                            <h3>Раунд {round.sequence}</h3>
                            <ol>
                                {plan.matches
                                    .filter((match) => match.roundId === round.id)
                                    .map((match) => (
                                        <li key={match.id}>
                                            <span>
                                                {match.slots
                                                    .map((slot) => slot.entrantId?.slice(0, 8) ?? 'победитель')
                                                    .join(' — ')}{' '}
                                                · {match.state}
                                                {match.courtAssignment
                                                    ? ` · корт ${String(match.courtAssignment.courtRank)}`
                                                    : ''}
                                            </span>
                                            {match.scores.length > 0 && (
                                                <span>
                                                    {' '}
                                                    ·{' '}
                                                    {match.scores
                                                        .map(
                                                            (score) =>
                                                                `${String(score.sideOne)}:${String(score.sideTwo)}`
                                                        )
                                                        .join(', ')}
                                                </span>
                                            )}
                                            {organizer && (
                                                <details className="match-editor">
                                                    <summary>Счёт / исправление</summary>
                                                    <form
                                                        onSubmit={(event) => {
                                                            event.preventDefault();
                                                        }}
                                                    >
                                                        <label>
                                                            Победитель
                                                            <select name="winner" required>
                                                                {match.slots.flatMap((slot) =>
                                                                    slot.entrantId
                                                                        ? [
                                                                              <option
                                                                                  key={slot.entrantId}
                                                                                  value={slot.entrantId}
                                                                              >
                                                                                  {slot.entrantId.slice(0, 8)}
                                                                              </option>,
                                                                          ]
                                                                        : []
                                                                )}
                                                            </select>
                                                        </label>
                                                        <label>
                                                            Счёт
                                                            <input
                                                                name="scores"
                                                                pattern="[0-9]+:[0-9]+(, *[0-9]+:[0-9]+)*"
                                                                placeholder="11:7, 8:11, 11:9"
                                                                required
                                                            />
                                                        </label>
                                                        <button
                                                            type="button"
                                                            disabled={!online}
                                                            onClick={(event) => {
                                                                const form = event.currentTarget.form;
                                                                if (!form) return;
                                                                if (!form.reportValidity()) return;
                                                                const data = new FormData(form);
                                                                void act(
                                                                    () =>
                                                                        client.scoreTournamentMatch(
                                                                            tournament.id,
                                                                            match.id,
                                                                            {
                                                                                expectedResultRevision:
                                                                                    match.resultRevision,
                                                                                expectedRevision: match.revision,
                                                                                expectedTournamentVersion:
                                                                                    tournament.version,
                                                                                outcome: 'PLAYED',
                                                                                scores: scoreList(
                                                                                    value(data, 'scores')
                                                                                ),
                                                                                winnerEntrantId: value(data, 'winner'),
                                                                            }
                                                                        ),
                                                                    'Счёт сохранён.'
                                                                );
                                                            }}
                                                        >
                                                            Сохранить
                                                        </button>
                                                        {match.resultRevision > 0 && (
                                                            <button
                                                                type="button"
                                                                disabled={!online}
                                                                onClick={(event) => {
                                                                    const form = event.currentTarget.form;
                                                                    if (!form) return;
                                                                    if (!form.reportValidity()) return;
                                                                    const data = new FormData(form);
                                                                    void act(
                                                                        () =>
                                                                            client.correctTournamentMatch(
                                                                                tournament.id,
                                                                                match.id,
                                                                                {
                                                                                    decision: 'APPLY',
                                                                                    expectedResultRevision:
                                                                                        match.resultRevision,
                                                                                    expectedRevision: match.revision,
                                                                                    expectedTournamentVersion:
                                                                                        tournament.version,
                                                                                    reasonCode:
                                                                                        'SCORE_ENTRY_CORRECTION',
                                                                                    scores: scoreList(
                                                                                        value(data, 'scores')
                                                                                    ),
                                                                                    winnerEntrantId: value(
                                                                                        data,
                                                                                        'winner'
                                                                                    ),
                                                                                }
                                                                            ),
                                                                        'Исправлено, сетка пересчитана.'
                                                                    );
                                                                }}
                                                            >
                                                                Исправить
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            disabled={!online}
                                                            onClick={(event) => {
                                                                const form = event.currentTarget.form;
                                                                if (!form) return;
                                                                const data = new FormData(form);
                                                                void act(
                                                                    () =>
                                                                        client.recordTournamentWalkover(
                                                                            tournament.id,
                                                                            match.id,
                                                                            {
                                                                                expectedResultRevision:
                                                                                    match.resultRevision,
                                                                                expectedRevision: match.revision,
                                                                                expectedTournamentVersion:
                                                                                    tournament.version,
                                                                                outcome: 'WALKOVER',
                                                                                reasonCode:
                                                                                    'ORGANIZER_CONFIRMED_WALKOVER',
                                                                                winnerEntrantId: value(data, 'winner'),
                                                                            }
                                                                        ),
                                                                    'Техническая победа сохранена.'
                                                                );
                                                            }}
                                                        >
                                                            Техническая победа
                                                        </button>
                                                    </form>
                                                </details>
                                            )}
                                        </li>
                                    ))}
                            </ol>
                        </article>
                    ))}
                    <details className="text-bracket">
                        <summary>Текстовая альтернатива сетки</summary>
                        <ol>
                            {plan.matches.map((match) => (
                                <li key={match.id}>
                                    Раунд {plan.rounds.find((round) => round.id === match.roundId)?.sequence}; встреча{' '}
                                    {match.sequence};{' '}
                                    {match.slots
                                        .map((slot) => slot.entrantId?.slice(0, 8) ?? 'не определён')
                                        .join(' против ')}
                                    ; {match.state}.
                                </li>
                            ))}
                        </ol>
                    </details>
                    <h2>Таблица</h2>
                    {plan.standings.length === 0 ? (
                        <State text="Результатов пока нет." />
                    ) : (
                        <div className="table-scroll" role="region" aria-label="Турнирная таблица" tabIndex={0}>
                            <table>
                                <thead>
                                    <tr>
                                        <th>Место</th>
                                        <th>Участник</th>
                                        <th>Победы</th>
                                        <th>Очки</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...plan.standings]
                                        .sort((a, b) => a.rank - b.rank)
                                        .map((row) => (
                                            <tr key={row.entrantId}>
                                                <td>{row.rank}</td>
                                                <td>{row.entrantId.slice(0, 8)}</td>
                                                <td>{row.wins}</td>
                                                <td>{row.matchPoints}</td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            ) : (
                <State text="Сетка появится после посева." />
            )}
        </main>
    );
}
