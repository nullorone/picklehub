import { ApiError, type components, type createIdentityClient, type operations } from '@picklehub/api-client';
import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

type Client = ReturnType<typeof createIdentityClient>;
type Tournament = components['schemas']['Tournament'];
type Entrant = components['schemas']['Entrant'];
type Plan = components['schemas']['TournamentPlan'];
type FormatCode = Exclude<components['schemas']['TournamentFormatCode'], 'CUSTOM_DSL'>;
type PlayMode = components['schemas']['TournamentPlayMode'];

const formatCodes: readonly FormatCode[] = [
    'AMERICANO',
    'ROUND_ROBIN',
    'SINGLE_ELIMINATION',
    'DOUBLE_ELIMINATION',
    'POOL_PLAY',
    'SWISS',
    'LADDER',
    'KING_OF_COURT',
];
const formatLabels: Record<FormatCode, string> = {
    AMERICANO: 'Американо',
    ROUND_ROBIN: 'Круговой турнир',
    SINGLE_ELIMINATION: 'Олимпийская система',
    DOUBLE_ELIMINATION: 'Двойное выбывание',
    POOL_PLAY: 'Группы и плей-офф',
    SWISS: 'Швейцарская система',
    LADDER: 'Лестница',
    KING_OF_COURT: 'Король корта',
};
const stateLabels: Record<Tournament['state'], string> = {
    DRAFT: 'Черновик',
    PUBLISHED: 'Регистрация',
    CHECK_IN: 'Отметка прибытия',
    SEEDED: 'Посев завершён',
    IN_PROGRESS: 'Идёт сейчас',
    PAUSED: 'На паузе',
    COMPLETED: 'Завершён',
    CANCELLED: 'Отменён',
};
const paymentLabels: Record<components['schemas']['TournamentPaymentState'], string> = {
    NOT_REQUIRED: 'Оплата не требуется',
    PENDING_EXTERNAL: 'Ожидается внешняя оплата',
    MARKED_PAID: 'Оплата отмечена',
    WAIVED: 'Оплата не требуется по решению организатора',
    REFUND_REPORTED: 'Возврат сообщён',
};

function formValue(data: FormData, name: string): string {
    const value = data.get(name);
    return typeof value === 'string' ? value.trim() : '';
}

function apiError(error: unknown): { readonly message: string; readonly stale: boolean } {
    if (!(error instanceof ApiError)) return { message: 'Не удалось выполнить запрос.', stale: false };
    const code = error.response?.error.code ?? '';
    if (code.includes('VERSION_CONFLICT') || code.includes('REVISION_CONFLICT')) {
        return { message: 'Данные уже изменились в другом окне. Загрузите свежую версию.', stale: true };
    }
    if (code === 'TOURNAMENT_DEPENDENCY_STARTED') {
        return {
            message: 'Зависимая встреча уже началась. Результат не переписан; обновите состояние турнира.',
            stale: true,
        };
    }
    if (code === 'TOURNAMENT_PROJECTION_MISMATCH') {
        return {
            message: 'Сетка не прошла проверку целостности. Проведение остановлено до восстановления.',
            stale: true,
        };
    }
    if (error.status === 403) return { message: 'У вас нет разрешения на это действие.', stale: false };
    return { message: error.response?.error.message ?? 'Не удалось выполнить запрос.', stale: false };
}

function State({ message, retry }: { readonly message: string; readonly retry?: () => void }) {
    return (
        <div className="state-card" role="status">
            <p>{message}</p>
            {retry && <button onClick={retry}>Загрузить свежую версию</button>}
        </div>
    );
}

function localDate(value: string, timeZone: string): string {
    try {
        return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
            new Date(value)
        );
    } catch {
        return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
    }
}

function isPowerOfTwo(value: number): boolean {
    return value > 0 && (value & (value - 1)) === 0;
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

function presetFromForm(data: FormData): {
    readonly capacity: number;
    readonly format: components['schemas']['FormatDefinition'];
} {
    const formatCode = formValue(data, 'formatCode') as FormatCode;
    const capacity = Number(formValue(data, 'capacity'));
    const courtCount = Number(formValue(data, 'courtCount'));
    const playMode: PlayMode =
        formatCode === 'AMERICANO' ? 'INDIVIDUAL_DOUBLES' : (formValue(data, 'playMode') as PlayMode);
    if (
        !formatCodes.includes(formatCode) ||
        !Number.isInteger(capacity) ||
        !Number.isInteger(courtCount) ||
        courtCount < 1
    ) {
        throw new Error('Проверьте формат, вместимость и число кортов.');
    }
    if (formatCode === 'AMERICANO' && (capacity < 4 || capacity > 64 || capacity % 4 !== 0)) {
        throw new Error('Для американо нужно от 4 до 64 игроков, число должно быть кратно четырём.');
    }
    if (formatCode === 'ROUND_ROBIN' && (capacity < 3 || capacity > 64)) {
        throw new Error('Для кругового турнира нужно от 3 до 64 участников.');
    }
    if (formatCode === 'SINGLE_ELIMINATION' && (capacity < 2 || capacity > 128)) {
        throw new Error('Для олимпийской системы нужно от 2 до 128 участников.');
    }
    if (formatCode === 'DOUBLE_ELIMINATION' && (capacity < 4 || capacity > 64 || !isPowerOfTwo(capacity))) {
        throw new Error('Двойное выбывание поддерживает 4–64 участников и только степень двойки.');
    }
    if (formatCode === 'POOL_PLAY' && (capacity < 6 || capacity > 64)) {
        throw new Error('Для группового этапа нужно от 6 до 64 участников.');
    }
    if (
        (formatCode === 'SWISS' || formatCode === 'LADDER') &&
        (capacity < 4 || capacity > (formatCode === 'SWISS' ? 128 : 64))
    ) {
        throw new Error('Выбранная вместимость не поддерживается этим форматом.');
    }
    if (formatCode === 'KING_OF_COURT' && (capacity < 4 || capacity > 64 || capacity % 2 !== 0)) {
        throw new Error('Для «Короля корта» нужно чётное число участников от 4 до 64.');
    }
    const base = { courtCount, schemaVersion: '1.0.0' as const };
    let configuration: components['schemas']['TournamentPresetConfiguration'];
    if (formatCode === 'AMERICANO') {
        const rounds = Number(formValue(data, 'rounds'));
        if (!Number.isInteger(rounds) || rounds < 3 || rounds > capacity - 1)
            throw new Error('Число раундов: от 3 до N−1.');
        configuration = { ...base, formatCode, rounds };
    } else if (formatCode === 'ROUND_ROBIN') {
        const legs = Number(formValue(data, 'legs'));
        if (legs !== 1 && legs !== 2) throw new Error('Круговой турнир поддерживает один или два круга.');
        configuration = { ...base, formatCode, legs };
    } else if (formatCode === 'SINGLE_ELIMINATION') {
        configuration = { ...base, bronzeMatch: data.get('bronzeMatch') === 'on', formatCode };
    } else if (formatCode === 'DOUBLE_ELIMINATION') {
        configuration = { ...base, formatCode, grandFinalReset: true };
    } else if (formatCode === 'POOL_PLAY') {
        const poolCount = Number(formValue(data, 'poolCount'));
        const qualifiersPerPool = Number(formValue(data, 'qualifiersPerPool'));
        const wildcardCount = Number(formValue(data, 'wildcardCount'));
        const playoffSize = Number(formValue(data, 'playoffSize'));
        if (
            poolCount < Math.ceil(capacity / 6) ||
            poolCount > Math.floor(capacity / 3) ||
            qualifiersPerPool < 1 ||
            qualifiersPerPool > 5 ||
            wildcardCount < 0 ||
            qualifiersPerPool * poolCount + wildcardCount !== playoffSize ||
            !isPowerOfTwo(playoffSize) ||
            playoffSize > 32
        ) {
            throw new Error(
                'Группы должны содержать 3–6 участников, а число прошедших — образовывать сетку 2/4/8/16/32.'
            );
        }
        configuration = { ...base, formatCode, playoffSize, poolCount, qualifiersPerPool, wildcardCount };
    } else if (formatCode === 'SWISS') {
        const rounds = Number(formValue(data, 'rounds'));
        if (rounds < 3 || rounds > Math.min(9, capacity - 1))
            throw new Error('Для Swiss выберите 3–9 раундов, не больше N−1.');
        configuration = { ...base, formatCode, rounds };
    } else if (formatCode === 'LADDER') {
        const rounds = Number(formValue(data, 'rounds'));
        const challengeSpan = Number(formValue(data, 'challengeSpan'));
        if (rounds < 3 || rounds > 20 || challengeSpan < 1 || challengeSpan > 5) {
            throw new Error('Лестница поддерживает 3–20 раундов и шаг вызова 1–5.');
        }
        configuration = {
            ...base,
            challengeSpan,
            formatCode,
            rounds,
        };
    } else {
        const rounds = Number(formValue(data, 'rounds'));
        if (rounds < 1 || rounds > 20) throw new Error('«Король корта» поддерживает 1–20 раундов.');
        configuration = { ...base, formatCode, rounds };
    }
    return {
        capacity,
        format: {
            configuration,
            formatCode,
            playMode,
            scoringProfile: formValue(data, 'scoringProfile') as components['schemas']['TournamentScoringProfile'],
            seedingPolicy: formValue(data, 'seedingPolicy') as components['schemas']['TournamentSeedingPolicy'],
            strategyVersion: '1.0.0',
        },
    };
}

function FormatFields({ formatCode }: { readonly formatCode: FormatCode }) {
    if (formatCode === 'ROUND_ROBIN')
        return (
            <label>
                Кругов
                <select name="legs" defaultValue="1">
                    <option value="1">Один</option>
                    <option value="2">Два</option>
                </select>
            </label>
        );
    if (formatCode === 'SINGLE_ELIMINATION')
        return (
            <label className="check">
                <input name="bronzeMatch" type="checkbox" /> Матч за третье место
            </label>
        );
    if (formatCode === 'DOUBLE_ELIMINATION') return <p>Повторный гранд-финал включён по правилам формата.</p>;
    if (formatCode === 'POOL_PLAY')
        return (
            <>
                <label>
                    Групп
                    <input name="poolCount" type="number" min="2" max="16" defaultValue="2" required />
                </label>
                <label>
                    Выходят из группы
                    <input name="qualifiersPerPool" type="number" min="1" max="5" defaultValue="2" required />
                </label>
                <label>
                    Wildcards
                    <input name="wildcardCount" type="number" min="0" max="31" defaultValue="0" required />
                </label>
                <label>
                    Размер плей-офф
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
                    min={formatCode === 'KING_OF_COURT' ? 1 : 3}
                    max="20"
                    defaultValue={formatCode === 'KING_OF_COURT' ? 5 : 3}
                    required
                />
            </label>
            {formatCode === 'LADDER' && (
                <label>
                    Шаг вызова
                    <input name="challengeSpan" type="number" min="1" max="5" defaultValue="2" required />
                </label>
            )}
        </>
    );
}

function TournamentWizard({ client, online }: { readonly client: Client; readonly online: boolean }) {
    const navigate = useNavigate();
    const [formatCode, setFormatCode] = useState<FormatCode>('AMERICANO');
    const [error, setError] = useState('');
    async function submit(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        setError('');
        if (!online) {
            setError('Для создания турнира требуется интернет.');
            return;
        }
        const data = new FormData(event.currentTarget);
        try {
            const preset = presetFromForm(data);
            const price = formValue(data, 'priceMinor');
            const tournament = await client.createTournament({
                capacity: preset.capacity,
                clubId: formValue(data, 'clubId') || null,
                currency: price ? formValue(data, 'currency').toUpperCase() : null,
                description: formValue(data, 'description'),
                format: preset.format,
                name: formValue(data, 'name'),
                priceMinor: price ? Number(price) : null,
                registrationClosesAt: new Date(formValue(data, 'registrationClosesAt')).toISOString(),
                registrationOpensAt: new Date(formValue(data, 'registrationOpensAt')).toISOString(),
                startsAt: new Date(formValue(data, 'startsAt')).toISOString(),
                timeZone: formValue(data, 'timeZone'),
                venueId: formValue(data, 'venueId'),
            });
            void navigate(`/tournaments/${tournament.id}`);
        } catch (reason) {
            setError(
                reason instanceof Error && !(reason instanceof ApiError) ? reason.message : apiError(reason).message
            );
        }
    }
    return (
        <details className="tournament-wizard state-card">
            <summary>Создать турнир</summary>
            <form onSubmit={(event) => void submit(event)}>
                <label>
                    Название
                    <input name="name" minLength={1} maxLength={120} required />
                </label>
                <label>
                    Описание
                    <textarea name="description" maxLength={2000} />
                </label>
                <label>
                    Площадка (ID)
                    <input name="venueId" required />
                </label>
                <label>
                    Клуб (ID, необязательно)
                    <input name="clubId" />
                </label>
                <label>
                    Формат
                    <select
                        name="formatCode"
                        value={formatCode}
                        onChange={(event) => {
                            setFormatCode(event.target.value as FormatCode);
                        }}
                    >
                        {formatCodes.map((code) => (
                            <option key={code} value={code}>
                                {formatLabels[code]}
                            </option>
                        ))}
                    </select>
                </label>
                {formatCode !== 'AMERICANO' && (
                    <label>
                        Режим
                        <select name="playMode" defaultValue="SINGLES">
                            <option value="SINGLES">Одиночный</option>
                            <option value="FIXED_TEAM_DOUBLES">Готовые пары</option>
                        </select>
                    </label>
                )}
                <label>
                    Вместимость
                    <input
                        name="capacity"
                        type="number"
                        min="2"
                        max="128"
                        defaultValue={formatCode === 'AMERICANO' ? 8 : 8}
                        required
                    />
                </label>
                <label>
                    Кортов
                    <input name="courtCount" type="number" min="1" max="64" defaultValue="2" required />
                </label>
                <FormatFields key={formatCode} formatCode={formatCode} />
                <label>
                    Подсчёт
                    <select name="scoringProfile" defaultValue="ONE_GAME_11_WIN_BY_2_CAP_15">
                        <option value="ONE_GAME_11_WIN_BY_2_CAP_15">Одна игра до 11</option>
                        <option value="BEST_OF_3_11_WIN_BY_2_CAP_15">До двух побед</option>
                        <option value="TIMED_GOLDEN_POINT">По времени, решающее очко</option>
                    </select>
                </label>
                <label>
                    Посев
                    <select name="seedingPolicy" defaultValue="REGISTRATION_ORDER">
                        <option value="REGISTRATION_ORDER">По регистрации</option>
                        <option value="MANUAL">Вручную</option>
                        <option value="RANDOM">Случайный</option>
                        <option value="RATING_SNAPSHOT">По снимку уровня</option>
                    </select>
                </label>
                <label>
                    Часовой пояс
                    <input name="timeZone" defaultValue="Europe/Moscow" required />
                </label>
                <label>
                    Открытие регистрации
                    <input name="registrationOpensAt" type="datetime-local" required />
                </label>
                <label>
                    Закрытие регистрации
                    <input name="registrationClosesAt" type="datetime-local" required />
                </label>
                <label>
                    Начало
                    <input name="startsAt" type="datetime-local" required />
                </label>
                <label>
                    Цена вне PickleHub, в копейках
                    <input name="priceMinor" type="number" min="0" />
                </label>
                <label>
                    Валюта
                    <input name="currency" defaultValue="RUB" pattern="[A-Za-z]{3}" />
                </label>
                <section className="preset-preview" aria-live="polite">
                    <h3>Предпросмотр правил</h3>
                    <p>
                        {formatLabels[formatCode]}, стратегия 1.0.0. Ничьих нет; итоговые равенства разрешает публичный
                        жребий.
                    </p>
                    <p>
                        Корты — только расписание: PickleHub их не бронирует. Указанная цена информационная, оплата
                        проходит вне сервиса.
                    </p>
                </section>
                {error && <State message={error} />}
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
    const [format, setFormat] = useState('');
    const [queryText, setQueryText] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const filters: NonNullable<operations['searchTournaments']['parameters']['query']> = {
                limit: 50,
                ...(format ? { format: format as FormatCode } : {}),
                ...(queryText.trim() ? { query: queryText.trim() } : {}),
            };
            setItems((await client.searchTournaments(filters)).items);
        } catch (reason) {
            setError(apiError(reason).message);
        } finally {
            setLoading(false);
        }
    }, [client, format, queryText]);
    useEffect(() => void load(), [load]);
    return (
        <main className="shell-main tournaments-screen">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Соревнования</p>
                    <h1>Турниры</h1>
                </div>
            </div>
            {signedIn && <TournamentWizard client={client} online={online} />}
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
                        {formatCodes.map((code) => (
                            <option key={code} value={code}>
                                {formatLabels[code]}
                            </option>
                        ))}
                    </select>
                </label>
                <button className="primary-action" disabled={loading}>
                    Найти
                </button>
            </form>
            {loading ? (
                <State message="Загружаем турниры…" />
            ) : error ? (
                <State message={error} retry={() => void load()} />
            ) : items.length === 0 ? (
                <State message="Турниры не найдены. Измените фильтры." />
            ) : (
                <ul className="result-list tournament-list">
                    {items.map((item) => (
                        <li key={item.id}>
                            <Link className="result-card" to={`/tournaments/${item.id}`}>
                                <strong>{item.name}</strong>
                                <span>
                                    {formatLabels[item.format.formatCode as FormatCode]} · {stateLabels[item.state]}
                                </span>
                                <span>
                                    {localDate(item.startsAt, item.timeZone)} · {item.entrantCount}/{item.capacity}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </main>
    );
}

function Registration({
    client,
    tournament,
    online,
    userId,
    refresh,
}: {
    readonly client: Client;
    readonly tournament: Tournament;
    readonly online: boolean;
    readonly userId: string;
    readonly refresh: () => Promise<void>;
}) {
    const teamFormat = tournament.format.playMode === 'FIXED_TEAM_DOUBLES';
    const [mode, setMode] = useState<'INDIVIDUAL' | 'TEAM' | 'PARTNER'>(teamFormat ? 'TEAM' : 'INDIVIDUAL');
    const [error, setError] = useState('');
    async function submit(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        const partnerId = formValue(new FormData(event.currentTarget), 'partnerId');
        try {
            await client.registerForTournament(tournament.id, {
                expectedVersion: tournament.version,
                kind: teamFormat ? 'TEAM' : 'INDIVIDUAL',
                memberIds: mode === 'TEAM' ? [userId, partnerId] : [userId],
                ...(mode === 'PARTNER' ? { partnerMatchingOptIn: true } : {}),
            });
            await refresh();
        } catch (reason) {
            setError(apiError(reason).message);
        }
    }
    return (
        <form className="state-card registration-form" onSubmit={(event) => void submit(event)}>
            <h2>Регистрация</h2>
            {teamFormat && (
                <label>
                    Как участвовать
                    <select
                        value={mode}
                        onChange={(event) => {
                            setMode(event.target.value as typeof mode);
                        }}
                    >
                        <option value="TEAM">Готовой парой</option>
                        <option value="PARTNER">Найти партнёра</option>
                    </select>
                </label>
            )}
            {teamFormat && mode === 'TEAM' && (
                <label>
                    ID партнёра
                    <input name="partnerId" required />
                </label>
            )}
            {mode === 'PARTNER' && (
                <p>Отправляя заявку, вы явно соглашаетесь на автоматический подбор совместимого партнёра.</p>
            )}
            {tournament.entrantCount >= tournament.capacity && (
                <p>Основной состав заполнен. Сервер поставит совместимую заявку в очередь FIFO.</p>
            )}
            {error && <State message={error} />}
            <button className="primary-action" disabled={!online || tournament.registrationGate !== 'OPEN'}>
                Зарегистрироваться
            </button>
        </form>
    );
}

function PlanView({
    client,
    plan,
    organizer,
    online,
    tournamentVersion,
    action,
}: {
    readonly client: Client;
    readonly plan: Plan;
    readonly organizer: boolean;
    readonly online: boolean;
    readonly tournamentVersion: number;
    readonly action: (run: () => Promise<unknown>, success: string) => Promise<void>;
}) {
    const entrantName = (id: string | null) => (id ? `Участник ${id.slice(0, 8)}` : 'Ожидает победителя');
    return (
        <section className="tournament-plan" aria-labelledby="plan-title">
            <h2 id="plan-title">Сетка и раунды</h2>
            {plan.rounds.length === 0 ? (
                <State message="Раунды ещё не сформированы." />
            ) : (
                plan.rounds.map((round) => {
                    const matches = plan.matches.filter((match) => match.roundId === round.id);
                    return (
                        <article className="round-card" key={round.id}>
                            <h3>
                                Раунд {round.sequence} · {round.state}
                            </h3>
                            <ol>
                                {matches.map((match) => (
                                    <li key={match.id}>
                                        <strong>Встреча {match.sequence}</strong>:{' '}
                                        {entrantName(match.slots[0]?.entrantId ?? null)} —{' '}
                                        {entrantName(match.slots[1]?.entrantId ?? null)}
                                        <span>
                                            {' '}
                                            · {match.state}
                                            {match.courtAssignment
                                                ? ` · корт ${String(match.courtAssignment.courtRank)}, поток ${String(match.courtAssignment.batch)}`
                                                : ''}
                                        </span>
                                        {match.scores.length > 0 && (
                                            <span>
                                                {' '}
                                                ·{' '}
                                                {match.scores
                                                    .map((score) => `${String(score.sideOne)}:${String(score.sideTwo)}`)
                                                    .join(', ')}
                                            </span>
                                        )}
                                        {organizer && (
                                            <MatchActions
                                                client={client}
                                                match={match}
                                                online={online}
                                                tournamentVersion={tournamentVersion}
                                                action={action}
                                            />
                                        )}
                                    </li>
                                ))}
                            </ol>
                        </article>
                    );
                })
            )}
            <details className="text-bracket">
                <summary>Текстовая альтернатива сетки</summary>
                <ol>
                    {plan.matches.map((match) => (
                        <li key={match.id}>
                            Раунд {plan.rounds.find((round) => round.id === match.roundId)?.sequence ?? '?'}; встреча{' '}
                            {String(match.sequence)}; {entrantName(match.slots[0]?.entrantId ?? null)} против{' '}
                            {entrantName(match.slots[1]?.entrantId ?? null)}; состояние {match.state}.
                        </li>
                    ))}
                </ol>
            </details>
            <h2>Таблица</h2>
            {plan.standings.length === 0 ? (
                <State message="Таблица появится после первых результатов." />
            ) : (
                <div className="table-scroll" role="region" aria-label="Турнирная таблица" tabIndex={0}>
                    <table>
                        <thead>
                            <tr>
                                <th>Место</th>
                                <th>Участник</th>
                                <th>Победы</th>
                                <th>Очки</th>
                                <th>Разница игр</th>
                                <th>Разница очков</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...plan.standings]
                                .sort((a, b) => a.rank - b.rank)
                                .map((standing) => (
                                    <tr key={standing.entrantId}>
                                        <td>{standing.rank}</td>
                                        <td>{entrantName(standing.entrantId)}</td>
                                        <td>{standing.wins}</td>
                                        <td>{standing.matchPoints}</td>
                                        <td>{standing.gameDifferential}</td>
                                        <td>{standing.pointDifferential}</td>
                                    </tr>
                                ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

function parseScores(value: string): components['schemas']['TournamentGameScore'][] {
    return value.split(',').map((part, index) => {
        const [sideOne, sideTwo] = part.trim().split(':').map(Number);
        if (!Number.isInteger(sideOne) || !Number.isInteger(sideTwo))
            throw new Error('Счёт задаётся как 11:7 или 11:7,8:11,11:9.');
        return { game: index + 1, sideOne: sideOne ?? 0, sideTwo: sideTwo ?? 0 };
    });
}

function MatchActions({
    client,
    match,
    online,
    tournamentVersion,
    action,
}: {
    readonly client: Client;
    readonly match: components['schemas']['TournamentMatch'];
    readonly online: boolean;
    readonly tournamentVersion: number;
    readonly action: (run: () => Promise<unknown>, success: string) => Promise<void>;
}) {
    const { tournamentId } = match;
    const [open, setOpen] = useState(false);
    return (
        <details
            className="match-editor"
            open={open}
            onToggle={(event) => {
                setOpen(event.currentTarget.open);
            }}
        >
            <summary>Счёт и исправление</summary>
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
                                      <option key={slot.entrantId} value={slot.entrantId}>
                                          {slot.entrantId.slice(0, 8)}
                                      </option>,
                                  ]
                                : []
                        )}
                    </select>
                </label>
                <label>
                    Счёт по играм
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
                        void action(
                            () =>
                                client.scoreTournamentMatch(tournamentId, match.id, {
                                    expectedResultRevision: match.resultRevision,
                                    expectedRevision: match.revision,
                                    expectedTournamentVersion: tournamentVersion,
                                    outcome: 'PLAYED',
                                    scores: parseScores(formValue(new FormData(form), 'scores')),
                                    winnerEntrantId: formValue(new FormData(form), 'winner'),
                                }),
                            'Счёт сохранён.'
                        );
                    }}
                >
                    Сохранить счёт
                </button>
                {match.resultRevision > 0 && (
                    <button
                        type="button"
                        disabled={!online}
                        onClick={(event) => {
                            const form = event.currentTarget.form;
                            if (!form) return;
                            if (!form.reportValidity()) return;
                            void action(
                                () =>
                                    client.correctTournamentMatch(tournamentId, match.id, {
                                        decision: 'APPLY',
                                        expectedResultRevision: match.resultRevision,
                                        expectedRevision: match.revision,
                                        expectedTournamentVersion: tournamentVersion,
                                        reasonCode: 'SCORE_ENTRY_CORRECTION',
                                        scores: parseScores(formValue(new FormData(form), 'scores')),
                                        winnerEntrantId: formValue(new FormData(form), 'winner'),
                                    }),
                                'Исправление применено, сетка пересчитана.'
                            );
                        }}
                    >
                        Исправить результат
                    </button>
                )}
                <button
                    type="button"
                    disabled={!online}
                    onClick={(event) => {
                        const form = event.currentTarget.form;
                        if (!form) return;
                        const data = new FormData(form);
                        const winnerEntrantId = formValue(data, 'winner');
                        void action(
                            () =>
                                client.recordTournamentWalkover(tournamentId, match.id, {
                                    expectedResultRevision: match.resultRevision,
                                    expectedRevision: match.revision,
                                    expectedTournamentVersion: tournamentVersion,
                                    outcome: 'WALKOVER',
                                    reasonCode: 'ORGANIZER_CONFIRMED_WALKOVER',
                                    winnerEntrantId,
                                }),
                            'Техническая победа сохранена.'
                        );
                    }}
                >
                    Техническая победа
                </button>
            </form>
        </details>
    );
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
    const [plan, setPlan] = useState<Plan>();
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [stale, setStale] = useState(false);
    const [loading, setLoading] = useState(true);
    const [seedOrder, setSeedOrder] = useState<readonly string[]>([]);
    const refresh = useCallback(async () => {
        setLoading(true);
        setError('');
        setStale(false);
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
        } catch (reason) {
            const parsed = apiError(reason);
            setError(parsed.message);
            setStale(parsed.stale);
        } finally {
            setLoading(false);
        }
    }, [client, signedIn, tournamentId]);
    useEffect(() => void refresh(), [refresh]);
    const organizer = tournament?.organizerId === userId;
    const myEntrant = entrants.find((entrant) =>
        entrant.members.some((member) => member.userId === userId && member.state === 'CONFIRMED')
    );
    async function action(run: () => Promise<unknown>, success: string) {
        if (!online) {
            setError('Для изменения требуется подключение к интернету.');
            return;
        }
        setError('');
        setNotice('');
        try {
            await run();
            setNotice(success);
            await refresh();
        } catch (reason) {
            const parsed = apiError(reason);
            setError(parsed.message);
            setStale(parsed.stale);
        }
    }
    const entrantById = useMemo(() => new Map(entrants.map((entrant) => [entrant.id, entrant])), [entrants]);
    if (loading && !tournament)
        return (
            <main className="shell-main">
                <State message="Загружаем турнир…" />
            </main>
        );
    if (!tournament)
        return (
            <main className="shell-main">
                <State message={error || 'Турнир не найден.'} retry={() => void refresh()} />
            </main>
        );
    return (
        <main className="shell-main tournaments-screen">
            <Link to="/tournaments">← Все турниры</Link>
            <section className="hero-card tournament-hero">
                <div className="hero-copy">
                    <p className="eyebrow">{stateLabels[tournament.state]}</p>
                    <h1>{tournament.name}</h1>
                    <p>{tournament.description || 'Описание не добавлено.'}</p>
                    <p>
                        {formatLabels[tournament.format.formatCode as FormatCode]} ·{' '}
                        {tournament.format.playMode === 'SINGLES'
                            ? 'одиночный'
                            : tournament.format.playMode === 'FIXED_TEAM_DOUBLES'
                              ? 'готовые пары'
                              : 'индивидуальный парный'}
                    </p>
                    <p>
                        {localDate(tournament.startsAt, tournament.timeZone)} ({tournament.timeZone}) ·{' '}
                        {tournament.entrantCount}/{tournament.capacity}
                    </p>
                    <p>
                        {tournament.priceMinor === null
                            ? 'Участие бесплатное'
                            : `${(tournament.priceMinor / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2 })} ${tournament.currency ?? ''} — оплата вне PickleHub`}
                    </p>
                    <p>Правила и стратегия: {tournament.format.strategyVersion}</p>
                </div>
            </section>
            {!online && <State message="Показаны последние загруженные данные. Изменения недоступны без сети." />}
            {error && (stale ? <State message={error} retry={() => void refresh()} /> : <State message={error} />)}
            {notice && (
                <p className="success-banner" role="status">
                    {notice}
                </p>
            )}
            {signedIn && tournament.state === 'PUBLISHED' && !myEntrant && userId && (
                <Registration
                    client={client}
                    tournament={tournament}
                    online={online}
                    userId={userId}
                    refresh={refresh}
                />
            )}
            {!signedIn && tournament.state === 'PUBLISHED' && (
                <p>
                    <Link to="/login">Войдите</Link>, чтобы зарегистрироваться.
                </p>
            )}
            {myEntrant && (
                <section className="state-card">
                    <h2>Моё участие</h2>
                    <p>
                        {myEntrant.state === 'WAITLISTED'
                            ? `Очередь FIFO${myEntrant.fifoSequence === null ? '' : ` · номер ${String(myEntrant.fifoSequence)}`}`
                            : myEntrant.state}
                    </p>
                    <p>{paymentLabels[myEntrant.payment.state]}</p>
                    <p>Прибытие: {myEntrant.checkInState}</p>
                    <button
                        disabled={!online || myEntrant.checkInState !== 'PENDING'}
                        onClick={() =>
                            void action(
                                () =>
                                    client.checkInTournamentEntrant(tournament.id, myEntrant.id, {
                                        expectedRevision: myEntrant.revision,
                                        expectedTournamentVersion: tournament.version,
                                    }),
                                'Прибытие отмечено.'
                            )
                        }
                    >
                        Я на месте
                    </button>
                    <button
                        disabled={!online || ['WITHDRAWN', 'REPLACED'].includes(myEntrant.state)}
                        onClick={() =>
                            void action(
                                () =>
                                    client.withdrawTournamentEntrant(tournament.id, myEntrant.id, {
                                        expectedRevision: myEntrant.revision,
                                        expectedTournamentVersion: tournament.version,
                                    }),
                                'Вы снялись с турнира. История сохранена.'
                            )
                        }
                    >
                        Сняться
                    </button>
                </section>
            )}
            {organizer && (
                <section className="organizer-panel" aria-labelledby="organizer-title">
                    <h2 id="organizer-title">Панель организатора</h2>
                    <div className="organizer-actions">
                        {tournament.state === 'DRAFT' && (
                            <button
                                disabled={!online}
                                onClick={() =>
                                    void action(
                                        () => client.publishTournament(tournament.id, tournament.version),
                                        'Турнир опубликован, правила зафиксированы.'
                                    )
                                }
                            >
                                Опубликовать
                            </button>
                        )}
                        {(tournament.state === 'PUBLISHED' || tournament.state === 'CHECK_IN') && (
                            <button
                                disabled={!online || entrants.filter((entry) => entry.state === 'ELIGIBLE').length < 2}
                                onClick={() =>
                                    void action(
                                        () =>
                                            client.seedTournament(tournament.id, {
                                                expectedVersion: tournament.version,
                                                orderedEntrantIds: seedOrder,
                                            }),
                                        'Посев и сетка сформированы.'
                                    )
                                }
                            >
                                Выполнить посев
                            </button>
                        )}
                        {tournament.state === 'SEEDED' && (
                            <button
                                disabled={!online}
                                onClick={() =>
                                    void action(
                                        () => client.startTournament(tournament.id, tournament.version),
                                        'Турнир начат.'
                                    )
                                }
                            >
                                Начать турнир
                            </button>
                        )}
                        {tournament.state === 'IN_PROGRESS' && (
                            <button
                                disabled={!online}
                                onClick={() =>
                                    void action(
                                        () =>
                                            client.pauseTournament(tournament.id, {
                                                expectedVersion: tournament.version,
                                                reasonCode: 'ORGANIZER_PAUSE',
                                            }),
                                        'Турнир поставлен на паузу.'
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
                                    void action(
                                        () =>
                                            client.resumeTournament(tournament.id, {
                                                expectedVersion: tournament.version,
                                                reasonCode: 'RECOVERY_VERIFIED',
                                            }),
                                        'Проверка сетки пройдена, турнир продолжен.'
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
                                    void action(
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
                                    void action(
                                        () =>
                                            client.cancelTournament(tournament.id, {
                                                expectedVersion: tournament.version,
                                                reasonCode: 'ORGANIZER_CANCELLED',
                                            }),
                                        'Турнир отменён; сыгранные результаты сохранены.'
                                    )
                                }
                            >
                                Отменить турнир
                            </button>
                        )}
                    </div>
                    <h3>Участники, оплата и посев</h3>
                    {entrants.length === 0 ? (
                        <State message="Заявок пока нет." />
                    ) : (
                        <ol className="entrant-list">
                            {[...entrants]
                                .sort((left, right) => {
                                    const leftIndex = seedOrder.indexOf(left.id);
                                    const rightIndex = seedOrder.indexOf(right.id);
                                    return (leftIndex < 0 ? 999 : leftIndex) - (rightIndex < 0 ? 999 : rightIndex);
                                })
                                .map((entrant) => (
                                    <li key={entrant.id}>
                                        <span>
                                            #
                                            {entrant.seed ??
                                                (seedOrder.includes(entrant.id)
                                                    ? seedOrder.indexOf(entrant.id) + 1
                                                    : '—')}{' '}
                                            · {entrant.kind} · {entrant.state} · {paymentLabels[entrant.payment.state]}
                                        </span>
                                        {entrant.state === 'ELIGIBLE' &&
                                            (tournament.state === 'PUBLISHED' || tournament.state === 'CHECK_IN') && (
                                                <span>
                                                    <button
                                                        aria-label={`Поднять ${entrant.id}`}
                                                        disabled={!online || seedOrder.indexOf(entrant.id) <= 0}
                                                        onClick={() => {
                                                            setSeedOrder((current) =>
                                                                moveItem(current, entrant.id, -1)
                                                            );
                                                        }}
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        aria-label={`Опустить ${entrant.id}`}
                                                        disabled={
                                                            !online ||
                                                            seedOrder.indexOf(entrant.id) >= seedOrder.length - 1
                                                        }
                                                        onClick={() => {
                                                            setSeedOrder((current) => moveItem(current, entrant.id, 1));
                                                        }}
                                                    >
                                                        ↓
                                                    </button>
                                                </span>
                                            )}
                                        <select
                                            aria-label={`Оплата ${entrant.id}`}
                                            value={entrant.payment.state}
                                            disabled={!online}
                                            onChange={(event) =>
                                                void action(
                                                    () =>
                                                        client.markTournamentExternalPayment(
                                                            tournament.id,
                                                            entrant.id,
                                                            {
                                                                expectedRevision: entrant.payment.revision,
                                                                expectedTournamentVersion: tournament.version,
                                                                reasonCode: 'ORGANIZER_MANUAL_MARK',
                                                                state: event.target
                                                                    .value as components['schemas']['TournamentPaymentState'],
                                                            }
                                                        ),
                                                    'Ручной статус внешней оплаты обновлён.'
                                                )
                                            }
                                        >
                                            <option value="NOT_REQUIRED">Не требуется</option>
                                            <option value="PENDING_EXTERNAL">Ожидается</option>
                                            <option value="MARKED_PAID">Оплачено вне сервиса</option>
                                            <option value="WAIVED">Освобождён</option>
                                            <option value="REFUND_REPORTED">Сообщён возврат</option>
                                        </select>
                                    </li>
                                ))}
                        </ol>
                    )}
                    <h3>Управление раундами</h3>
                    {plan?.rounds.map((round) => (
                        <div className="round-controls" key={round.id}>
                            <span>
                                Раунд {round.sequence}: {round.state}
                            </span>
                            <button
                                disabled={!online || round.state !== 'READY'}
                                onClick={() =>
                                    void action(
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
                                    void action(
                                        () =>
                                            client.completeTournamentRound(tournament.id, round.id, {
                                                expectedRevision: round.revision,
                                                expectedTournamentVersion: tournament.version,
                                            }),
                                        'Раунд завершён, следующая волна рассчитана.'
                                    )
                                }
                            >
                                Завершить
                            </button>
                        </div>
                    ))}
                    <h3>Корты</h3>
                    {!plan || plan.matches.every((match) => match.courtAssignment === null) ? (
                        <State message="Назначения появятся в рассчитанной сетке. PickleHub не бронирует корты." />
                    ) : (
                        <ul className="court-list">
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
            {plan && (
                <PlanView
                    client={client}
                    plan={plan}
                    organizer={organizer}
                    online={online}
                    tournamentVersion={tournament.version}
                    action={action}
                />
            )}
            {!plan && <State message="Сетка появится после посева. Правила формата уже доступны в карточке." />}
            {entrantById.size > 0 && <p className="visually-hidden">Загружено участников: {entrantById.size}</p>}
        </main>
    );
}
