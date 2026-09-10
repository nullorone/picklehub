import { disabledAnalytics } from '@picklehub/analytics';
import { ApiError, type components, type IdentityClient } from '@picklehub/api-client';
import {
    localDateTimeToUtc,
    matchDraftFormSchema,
    matchGameSchema,
    validateMatchSeries,
    type RuntimeConfig,
} from '@picklehub/validation';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

const VenueMap = lazy(async () => ({ default: (await import('./venue-map')).VenueMap }));

type Match = components['schemas']['Match'];
type MatchSummary = components['schemas']['MatchSummary'];
type VenueSummary = components['schemas']['VenueSummary'];
type TeamChoice = components['schemas']['MatchTeamChoice'];
type JoinRequest = components['schemas']['JoinRequest'];
type WaitlistEntry = components['schemas']['WaitlistEntry'];

const formatLabels = { DOUBLES: '2 × 2', SINGLES: '1 × 1' } as const;
const stateLabels: Record<components['schemas']['MatchState'], string> = {
    AWAITING_CONFIRMATION: 'Ожидает подтверждения',
    CANCELLED: 'Отменён',
    COMPLETED: 'Завершён',
    DISPUTED: 'Результат оспорен',
    DRAFT: 'Черновик',
    IN_PROGRESS: 'Идёт игра',
    PUBLISHED: 'Набор игроков',
    VOIDED: 'Аннулирован',
};
const reasonLabels: Record<components['schemas']['MatchRecommendationReason'], string> = {
    DISTANCE_UNKNOWN: 'расстояние не учитывалось',
    LEVEL_FIT: 'подходит по уровню',
    NEARBY: 'рядом',
    PREFERRED_FORMAT: 'любимый формат',
    TIME_FLEXIBLE: 'удобное время',
    TIME_MATCH: 'совпадает по времени',
};

function formatDate(value: string, timeZone: string): string {
    return new Intl.DateTimeFormat('ru-RU', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone,
    }).format(new Date(value));
}

function messageFor(error: unknown): string {
    if (error instanceof ApiError) {
        const code = error.response?.error.code;
        if (code === 'MATCH_VERSION_CONFLICT' || code === 'RESULT_VERSION_CONFLICT') {
            return 'Состав или результат уже изменился. Мы обновили данные — проверьте их и повторите действие.';
        }
        if (code === 'WAITLIST_ORDER_CONFLICT') return 'Очередь уже изменилась. Данные обновлены.';
        if (code === 'MATCH_CAPACITY_REACHED') return 'Свободное место уже заняли. Можно встать в очередь.';
        if (code === 'LEVEL_NOT_ELIGIBLE') return 'Ваш уровень не входит в диапазон этого матча.';
        if (code === 'INVITE_INVALID' || code === 'MATCH_NOT_FOUND')
            return 'Матч не найден или ссылка уже недействительна.';
        return error.response?.error.message ?? 'Не удалось выполнить действие.';
    }
    return navigator.onLine
        ? 'Не удалось связаться с сервером. Повторите попытку.'
        : 'Нет сети. Изменения не отправлены.';
}

function useMutationKeys() {
    const keys = useRef(new Map<string, string>());
    return {
        clear: (action: string) => keys.current.delete(action),
        get: (action: string) => {
            const current = keys.current.get(action);
            if (current) return current;
            const created = crypto.randomUUID();
            keys.current.set(action, created);
            return created;
        },
    };
}

function MatchCard({ match }: { readonly match: MatchSummary }) {
    const free = match.teams.reduce((sum, team) => sum + team.capacity - team.occupiedPlaces - team.reservedPlaces, 0);
    return (
        <li className="match-card">
            <Link to={`/matches/${match.id}`}>
                <span className="match-card-heading">
                    <strong>{formatLabels[match.format]}</strong>
                    <span>{free > 0 ? `${String(free)} мест` : 'Есть очередь'}</span>
                </span>
                <span>{formatDate(match.startsAt, match.timeZone)}</span>
                <span>
                    Уровень {match.skillMin.toFixed(1)}–{match.skillMax.toFixed(1)}
                </span>
                {match.recommendationScore !== undefined && (
                    <span className="recommendation">
                        {match.recommendationScore}% ·{' '}
                        {match.recommendationReasons?.map((item) => reasonLabels[item]).join(', ')}
                    </span>
                )}
            </Link>
        </li>
    );
}

export function MatchesScreen({
    client,
    config,
    online,
    signedIn,
}: {
    readonly client: IdentityClient;
    readonly config: RuntimeConfig;
    readonly online: boolean;
    readonly signedIn: boolean;
}) {
    const navigate = useNavigate();
    const [items, setItems] = useState<readonly MatchSummary[]>([]);
    const [venues, setVenues] = useState<readonly VenueSummary[]>([]);
    const [matchByVenue, setMatchByVenue] = useState<ReadonlyMap<string, string>>(new Map());
    const [format, setFormat] = useState<'' | 'SINGLES' | 'DOUBLES'>('');
    const [skill, setSkill] = useState('');
    const [startsFrom, setStartsFrom] = useState('');
    const [startsTo, setStartsTo] = useState('');
    const [recommended, setRecommended] = useState(signedIn);
    const [surface, setSurface] = useState<'LIST' | 'MAP'>('LIST');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string>();
    const [nextCursor, setNextCursor] = useState<string>();

    const search = useCallback(
        async (
            cursor?: string,
            location?: { readonly latitude: number; readonly longitude: number; readonly radiusMeters: number }
        ) => {
            if (!online) {
                setMessage('Нет сети. Уже открытые сведения остаются на экране, поиск недоступен.');
                return;
            }
            setLoading(true);
            setMessage(undefined);
            try {
                const parameters = {
                    ...(cursor ? { cursor } : {}),
                    ...(format ? { format } : {}),
                    ...(skill ? { skillLevel: Number(skill) } : {}),
                    ...(startsFrom ? { startsFrom: new Date(startsFrom).toISOString() } : {}),
                    ...(startsTo ? { startsTo: new Date(startsTo).toISOString() } : {}),
                    ...location,
                    limit: 30,
                };
                const page =
                    recommended && signedIn
                        ? await client.recommendMatches(parameters)
                        : await client.searchMatches(parameters);
                setItems((current) => (cursor ? [...current, ...page.items] : page.items));
                setNextCursor(page.pageInfo.nextCursor ?? undefined);
                if (!cursor) {
                    const details = await Promise.all(
                        page.items.map((item) => client.getMatch(item.id).catch(() => undefined))
                    );
                    const ids = [
                        ...new Set(
                            details.map((item) => item?.venue.venueId).filter((id): id is string => Boolean(id))
                        ),
                    ];
                    setMatchByVenue(
                        new Map(
                            details.flatMap((item) =>
                                item?.venue.venueId ? [[item.venue.venueId, item.id] as const] : []
                            )
                        )
                    );
                    const loaded = await Promise.all(ids.map((id) => client.getVenue(id).catch(() => undefined)));
                    setVenues(loaded.filter((venue): venue is components['schemas']['Venue'] => Boolean(venue)));
                }
                if (page.items.length === 0) setMessage('Подходящих матчей не найдено. Измените фильтры.');
            } catch (error) {
                setMessage(messageFor(error));
            } finally {
                setLoading(false);
            }
        },
        [client, format, online, recommended, signedIn, skill, startsFrom, startsTo]
    );

    useEffect(() => {
        void search();
    }, [search]);

    return (
        <main className="matches-main">
            <header className="matches-heading">
                <div>
                    <p className="eyebrow">Игры рядом</p>
                    <h1>Матчи</h1>
                    <p>Найдите игру по формату, времени и уровню.</p>
                </div>
                {signedIn && (
                    <Link className="primary-action" to="/matches/new">
                        Создать матч
                    </Link>
                )}
            </header>
            <form
                className="match-filters"
                onSubmit={(event) => {
                    event.preventDefault();
                    void search();
                }}
            >
                <label>
                    Формат
                    <select
                        value={format}
                        onChange={(event) => {
                            setFormat(event.target.value as typeof format);
                        }}
                    >
                        <option value="">Любой</option>
                        <option value="SINGLES">1 × 1</option>
                        <option value="DOUBLES">2 × 2</option>
                    </select>
                </label>
                <label>
                    Уровень
                    <select
                        value={skill}
                        onChange={(event) => {
                            setSkill(event.target.value);
                        }}
                    >
                        <option value="">Любой</option>
                        {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((item) => (
                            <option key={item}>{item}</option>
                        ))}
                    </select>
                </label>
                <label>
                    Не раньше
                    <input
                        type="datetime-local"
                        value={startsFrom}
                        onChange={(event) => {
                            setStartsFrom(event.target.value);
                        }}
                    />
                </label>
                <label>
                    Не позже
                    <input
                        type="datetime-local"
                        value={startsTo}
                        onChange={(event) => {
                            setStartsTo(event.target.value);
                        }}
                    />
                </label>
                {signedIn && (
                    <label className="check">
                        <input
                            type="checkbox"
                            checked={recommended}
                            onChange={(event) => {
                                setRecommended(event.target.checked);
                            }}
                        />
                        <span>Сначала рекомендуемые</span>
                    </label>
                )}
                <button className="primary-action" type="submit" disabled={!online || loading}>
                    Найти
                </button>
            </form>
            <div className="view-switch" role="group" aria-label="Представление матчей">
                <button
                    type="button"
                    aria-pressed={surface === 'LIST'}
                    onClick={() => {
                        setSurface('LIST');
                    }}
                >
                    Список
                </button>
                <button
                    type="button"
                    aria-pressed={surface === 'MAP'}
                    onClick={() => {
                        setSurface('MAP');
                    }}
                >
                    Карта
                </button>
            </div>
            {surface === 'MAP' && config.map && (
                <Suspense fallback={<p role="status">Загружаем карту…</p>}>
                    <VenueMap
                        config={config.map}
                        venues={venues}
                        onBoundsChanged={(bounds) => {
                            const latitude = Number(((bounds.north + bounds.south) / 2).toFixed(6));
                            const longitude = Number(((bounds.east + bounds.west) / 2).toFixed(6));
                            const radiusMeters = Math.min(
                                50_000,
                                Math.max(
                                    1,
                                    Math.round(
                                        Math.hypot(
                                            (bounds.north - bounds.south) * 111_000,
                                            (bounds.east - bounds.west) * 65_000
                                        ) / 2
                                    )
                                )
                            );
                            void search(undefined, { latitude, longitude, radiusMeters });
                        }}
                        onError={() => {
                            setMessage('Карта недоступна. Используйте список.');
                        }}
                        onSelect={(venue) => {
                            const selectedMatch = matchByVenue.get(venue.id);
                            if (selectedMatch) void navigate(`/matches/${selectedMatch}`);
                        }}
                    />
                </Suspense>
            )}
            {surface === 'MAP' && !config.map && <p role="status">Карта не настроена. Используйте список.</p>}
            {loading && <p role="status">Загружаем матчи…</p>}
            {message && (
                <p className="form-message" role="status">
                    {message}
                </p>
            )}
            <ul className="match-list">
                {items.map((match) => (
                    <MatchCard key={match.id} match={match} />
                ))}
            </ul>
            {nextCursor && (
                <button
                    className="secondary-action"
                    disabled={!online || loading}
                    type="button"
                    onClick={() => void search(nextCursor)}
                >
                    Показать ещё
                </button>
            )}
        </main>
    );
}

export function CreateMatchScreen({ client, online }: { readonly client: IdentityClient; readonly online: boolean }) {
    const navigate = useNavigate();
    const keys = useMutationKeys();
    const [venues, setVenues] = useState<readonly VenueSummary[]>([]);
    const [guests, setGuests] = useState<readonly components['schemas']['MatchGuestInput'][]>([]);
    const [matchFormat, setMatchFormat] = useState<'SINGLES' | 'DOUBLES'>('SINGLES');
    const [newVenue, setNewVenue] = useState(false);
    const [venueDraft, setVenueDraft] = useState({ address: '', latitude: '', locality: '', longitude: '', name: '' });
    const [publicVenueConfirmed, setPublicVenueConfirmed] = useState(false);
    const [message, setMessage] = useState<string>();
    const [saving, setSaving] = useState(false);
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';

    useEffect(() => {
        client
            .searchVenues({ limit: 50, publicationState: 'PUBLISHED' })
            .then((page) => {
                setVenues(page.items);
            })
            .catch(() => {
                setMessage('Не удалось загрузить площадки.');
            });
    }, [client]);

    async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!online || saving) return;
        const data = Object.fromEntries(new FormData(event.currentTarget));
        if (newVenue) data.venueId = '';
        const parsed = matchDraftFormSchema.safeParse(data);
        if (!parsed.success) {
            setMessage(parsed.error.issues[0]?.message ?? 'Проверьте поля.');
            return;
        }
        setSaving(true);
        const action = 'create-match';
        try {
            const value = parsed.data;
            const teamACapacity = value.format === 'SINGLES' ? 0 : 1;
            const teamBCapacity = value.format === 'SINGLES' ? 1 : 2;
            if (
                guests.some((guest) => !guest.label.trim()) ||
                guests.filter((guest) => guest.team === 'TEAM_A').length > teamACapacity ||
                guests.filter((guest) => guest.team === 'TEAM_B').length > teamBCapacity
            ) {
                setMessage('Проверьте имена гостей и свободные места в командах. Организатор уже занимает команду A.');
                return;
            }
            if (
                newVenue &&
                (!publicVenueConfirmed ||
                    !venueDraft.name.trim() ||
                    !venueDraft.address.trim() ||
                    !venueDraft.locality.trim() ||
                    !Number.isFinite(Number(venueDraft.latitude)) ||
                    !Number.isFinite(Number(venueDraft.longitude)))
            ) {
                setMessage('Заполните новый публичный адрес и подтвердите, что это не частный дом.');
                return;
            }
            if (newVenue && /(дом|дач|квартир|подъезд)/iu.test(`${venueDraft.name} ${venueDraft.address}`)) {
                setMessage('Похоже на частный дом. Укажите публичный спортивный объект.');
                return;
            }
            let match = await client.createMatchDraft(
                {
                    bookingNote: value.bookingNote || null,
                    bookingState: value.bookingState,
                    description: value.description || null,
                    format: value.format,
                    guests,
                    joinMode: value.joinMode,
                    skillMax: value.skillMax,
                    skillMin: value.skillMin,
                    startsAt: localDateTimeToUtc(value.startsLocal, value.timeZone),
                    timeZone: value.timeZone,
                    ...(newVenue ? {} : { venueId: value.venueId }),
                    visibility: value.visibility,
                },
                keys.get(action)
            );
            if (newVenue) {
                const candidate = await client.createVenueCandidate(
                    {
                        locality: venueDraft.locality.trim(),
                        location: {
                            latitude: Number(venueDraft.latitude),
                            longitude: Number(venueDraft.longitude),
                        },
                        name: venueDraft.name.trim(),
                        normalizedAddress: venueDraft.address.trim(),
                        source: { kind: 'MANUAL_PIN' },
                        sourceMatchId: match.id,
                        timeZone: value.timeZone,
                    },
                    keys.get('create-match-venue')
                );
                match = await client.updateMatchDraft(
                    match.id,
                    { expectedVersion: match.version, venueCandidateId: candidate.id },
                    keys.get('attach-match-venue')
                );
                keys.clear('create-match-venue');
                keys.clear('attach-match-venue');
            }
            keys.clear(action);
            void navigate(`/matches/${match.id}`, { state: { created: true } });
        } catch (error) {
            setMessage(messageFor(error));
        } finally {
            setSaving(false);
        }
    }

    return (
        <main className="matches-main narrow">
            <Link className="text-button" to="/matches">
                ← К поиску
            </Link>
            <h1>Новый матч</h1>
            <p>Сначала создаётся приватный черновик. Опубликовать его можно после проверки.</p>
            <form className="match-form" onSubmit={(event) => void submit(event)}>
                <label>
                    Формат
                    <select
                        name="format"
                        value={matchFormat}
                        onChange={(event) => {
                            const format = event.target.value as typeof matchFormat;
                            setMatchFormat(format);
                            if (format === 'SINGLES')
                                setGuests((items) => items.slice(0, 1).map((item) => ({ ...item, team: 'TEAM_B' })));
                        }}
                    >
                        <option value="SINGLES">1 × 1</option>
                        <option value="DOUBLES">2 × 2</option>
                    </select>
                </label>
                <fieldset>
                    <legend>Место игры</legend>
                    <label className="check">
                        <input
                            type="radio"
                            checked={!newVenue}
                            onChange={() => {
                                setNewVenue(false);
                            }}
                        />
                        <span>Из каталога</span>
                    </label>
                    <label className="check">
                        <input
                            type="radio"
                            checked={newVenue}
                            onChange={() => {
                                setNewVenue(true);
                            }}
                        />
                        <span>Новый публичный адрес</span>
                    </label>
                </fieldset>
                {!newVenue ? (
                    <label>
                        Площадка
                        <select name="venueId" required defaultValue="">
                            <option value="" disabled>
                                Выберите площадку
                            </option>
                            {venues.map((venue) => (
                                <option key={venue.id} value={venue.id}>
                                    {venue.name} — {venue.normalizedAddress}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : (
                    <fieldset className="new-match-venue">
                        <legend>Новая площадка только для этого матча</legend>
                        <label>
                            Название
                            <input
                                value={venueDraft.name}
                                onChange={(event) => {
                                    setVenueDraft((value) => ({ ...value, name: event.target.value }));
                                }}
                            />
                        </label>
                        <label>
                            Публичный адрес
                            <input
                                value={venueDraft.address}
                                onChange={(event) => {
                                    setVenueDraft((value) => ({ ...value, address: event.target.value }));
                                }}
                            />
                        </label>
                        <label>
                            Населённый пункт
                            <input
                                value={venueDraft.locality}
                                onChange={(event) => {
                                    setVenueDraft((value) => ({ ...value, locality: event.target.value }));
                                }}
                            />
                        </label>
                        <div className="inline-fields">
                            <label>
                                Широта
                                <input
                                    inputMode="decimal"
                                    value={venueDraft.latitude}
                                    onChange={(event) => {
                                        setVenueDraft((value) => ({ ...value, latitude: event.target.value }));
                                    }}
                                />
                            </label>
                            <label>
                                Долгота
                                <input
                                    inputMode="decimal"
                                    value={venueDraft.longitude}
                                    onChange={(event) => {
                                        setVenueDraft((value) => ({ ...value, longitude: event.target.value }));
                                    }}
                                />
                            </label>
                        </div>
                        <label className="check">
                            <input
                                type="checkbox"
                                checked={publicVenueConfirmed}
                                onChange={(event) => {
                                    setPublicVenueConfirmed(event.target.checked);
                                }}
                            />
                            <span>Это публичный спортивный объект, и адрес можно показывать всем.</span>
                        </label>
                    </fieldset>
                )}
                <label>
                    Дата и местное время
                    <input name="startsLocal" type="datetime-local" required />
                </label>
                <label>
                    Часовой пояс
                    <input name="timeZone" defaultValue={timeZone} required />
                </label>
                <div className="inline-fields">
                    <label>
                        Уровень от
                        <select name="skillMin" defaultValue="1">
                            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((item) => (
                                <option key={item}>{item}</option>
                            ))}
                        </select>
                    </label>
                    <label>
                        до
                        <select name="skillMax" defaultValue="5">
                            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map((item) => (
                                <option key={item}>{item}</option>
                            ))}
                        </select>
                    </label>
                </div>
                <label>
                    Вступление
                    <select name="joinMode" defaultValue="AUTO">
                        <option value="AUTO">Автоматически</option>
                        <option value="APPROVAL">По заявке</option>
                    </select>
                </label>
                <label>
                    Видимость
                    <select name="visibility" defaultValue="PUBLIC">
                        <option value="PUBLIC">В поиске</option>
                        <option value="UNLISTED">Только по ссылке</option>
                    </select>
                </label>
                <fieldset>
                    <legend>Гостевые места</legend>
                    {guests.map((guest, index) => (
                        <div className="guest-row" key={`${guest.team}-${String(index)}`}>
                            <input
                                aria-label={`Имя гостя ${String(index + 1)}`}
                                value={guest.label}
                                maxLength={50}
                                onChange={(event) => {
                                    setGuests((items) =>
                                        items.map((item, itemIndex) =>
                                            itemIndex === index ? { ...item, label: event.target.value } : item
                                        )
                                    );
                                }}
                            />
                            <select
                                aria-label={`Команда гостя ${String(index + 1)}`}
                                value={guest.team}
                                disabled={matchFormat === 'SINGLES'}
                                onChange={(event) => {
                                    setGuests((items) =>
                                        items.map((item, itemIndex) =>
                                            itemIndex === index
                                                ? { ...item, team: event.target.value as 'TEAM_A' | 'TEAM_B' }
                                                : item
                                        )
                                    );
                                }}
                            >
                                <option value="TEAM_A">Команда A</option>
                                <option value="TEAM_B">Команда B</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => {
                                    setGuests((items) => items.filter((_, itemIndex) => itemIndex !== index));
                                }}
                            >
                                Убрать
                            </button>
                        </div>
                    ))}
                    <button
                        type="button"
                        className="secondary-action"
                        disabled={guests.length >= (matchFormat === 'SINGLES' ? 1 : 3)}
                        onClick={() => {
                            setGuests((items) => [
                                ...items,
                                {
                                    label: `Гость ${String(items.length + 1)}`,
                                    team: items.length % 2 === 0 ? 'TEAM_B' : 'TEAM_A',
                                },
                            ]);
                        }}
                    >
                        Добавить гостя
                    </button>
                </fieldset>
                <label>
                    Внешняя бронь
                    <select name="bookingState" defaultValue="UNKNOWN">
                        <option value="UNKNOWN">Не указано</option>
                        <option value="NOT_BOOKED">Не забронировано</option>
                        <option value="BOOKED_EXTERNALLY">Забронировано вне PickleHub</option>
                    </select>
                </label>
                <label>
                    Примечание о брони
                    <textarea name="bookingNote" maxLength={280} />
                </label>
                <label>
                    Описание
                    <textarea name="description" maxLength={1000} />
                </label>
                <button className="primary-action" disabled={!online || saving} type="submit">
                    {saving ? 'Сохраняем…' : 'Создать черновик'}
                </button>
            </form>
            {message && (
                <p className="form-message" role="alert">
                    {message}
                </p>
            )}
        </main>
    );
}

function ConfirmDialog({
    action,
    onClose,
    onConfirm,
}: {
    readonly action: string | undefined;
    readonly onClose: () => void;
    readonly onConfirm: () => void;
}) {
    const previousFocus = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!action) return undefined;
        previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            previousFocus.current?.focus();
        };
    }, [action, onClose]);
    if (!action) return null;
    return (
        <div className="dialog-backdrop">
            <section
                aria-modal="true"
                className="confirm-dialog"
                role="dialog"
                aria-labelledby="confirm-title"
                aria-describedby="confirm-description"
            >
                <h2 id="confirm-title">Подтвердите действие</h2>
                <p id="confirm-description">{action}</p>
                <div className="dialog-actions">
                    <button type="button" onClick={onClose}>
                        Назад
                    </button>
                    <button className="danger-action" type="button" autoFocus onClick={onConfirm}>
                        Подтвердить
                    </button>
                </div>
            </section>
        </div>
    );
}

export function MatchDetailsScreen({
    client,
    channel,
    inviteToken,
    matchId,
    online,
    userId,
}: {
    readonly client: IdentityClient;
    readonly channel: 'web' | 'telegram';
    readonly inviteToken?: string | undefined;
    readonly matchId?: string | undefined;
    readonly online: boolean;
    readonly userId?: string | undefined;
}) {
    const keys = useMutationKeys();
    const [match, setMatch] = useState<Match>();
    const [requests, setRequests] = useState<readonly JoinRequest[]>([]);
    const [waitlist, setWaitlist] = useState<readonly WaitlistEntry[]>([]);
    const [message, setMessage] = useState<string>();
    const [teamChoice, setTeamChoice] = useState<TeamChoice>('ANY');
    const [confirmAction, setConfirmAction] = useState<{ readonly label: string; readonly run: () => Promise<void> }>();
    const [busy, setBusy] = useState(false);
    const [inviteUrl, setInviteUrl] = useState<string>();
    const viewedMatch = useRef<string | undefined>(undefined);
    const isOrganizer = match?.organizerId === userId;

    const load = useCallback(async () => {
        try {
            const value = inviteToken
                ? await client.getMatchByInvite(inviteToken)
                : await client.getMatch(matchId ?? '');
            setMatch(value);
            if (value.id !== viewedMatch.current && value.format && value.visibility) {
                viewedMatch.current = value.id;
                disabledAnalytics.track({
                    name: 'match_viewed',
                    channel,
                    entry: inviteToken ? 'INVITE' : 'SEARCH',
                    format: value.format,
                    visibility: value.visibility,
                });
            }
            if (userId) {
                const requestPromise =
                    value.organizerId === userId
                        ? client.listMatchJoinRequests(value.id).catch(() => ({ items: [] }))
                        : Promise.resolve({ items: [] });
                const [requestPage, waitlistPage] = await Promise.all([
                    requestPromise,
                    client.listMatchWaitlist(value.id).catch(() => ({ items: [] })),
                ]);
                setRequests(requestPage.items);
                setWaitlist(waitlistPage.items);
            }
        } catch (error) {
            setMessage(messageFor(error));
        }
    }, [channel, client, inviteToken, matchId, userId]);

    useEffect(() => {
        void load();
    }, [load]);

    async function mutate(action: string, operation: (key: string) => Promise<unknown>, success: string) {
        if (!online || busy) return;
        setBusy(true);
        try {
            await operation(keys.get(action));
            keys.clear(action);
            setMessage(success);
            await load();
        } catch (error) {
            if (
                error instanceof ApiError &&
                ['MATCH_VERSION_CONFLICT', 'RESULT_VERSION_CONFLICT', 'WAITLIST_ORDER_CONFLICT'].includes(
                    error.response?.error.code ?? ''
                )
            ) {
                keys.clear(action);
                await load();
            }
            setMessage(messageFor(error));
        } finally {
            setBusy(false);
            setConfirmAction(undefined);
        }
    }

    async function deliverInvite(target: Match, action: 'publish' | 'rotate') {
        if (!online || busy) return;
        setBusy(true);
        try {
            const value =
                action === 'publish'
                    ? await client.publishMatch(target.id, target.version, keys.get(action))
                    : await client.rotateMatchInvite(target.id, target.version, keys.get(action));
            keys.clear(action);
            if ('token' in value) {
                setInviteUrl(`${window.location.origin}/match-invites/${value.token}`);
                setMessage('Ссылка готова. Скопируйте её сейчас: позже секрет нельзя будет показать повторно.');
            } else {
                setMessage('Матч опубликован.');
            }
            await load();
        } catch (error) {
            if (error instanceof ApiError && error.response?.error.code === 'MATCH_VERSION_CONFLICT') {
                keys.clear(action);
                await load();
            }
            setMessage(messageFor(error));
        } finally {
            setBusy(false);
            setConfirmAction(undefined);
        }
    }

    if (!match && !message)
        return (
            <main className="state-card">
                <p role="status">Загружаем матч…</p>
            </main>
        );
    if (!match)
        return (
            <main className="state-card">
                <h1>Матч недоступен</h1>
                <p role="alert">{message}</p>
                <Link to="/matches">К поиску</Link>
            </main>
        );
    const ownParticipant = match.participants.find((item) => item.userId === userId && item.state === 'ACTIVE');
    const result = match.currentResult;
    return (
        <main className="matches-main narrow">
            <Link className="text-button" to="/matches">
                ← К поиску
            </Link>
            <header className="match-detail-heading">
                <div>
                    <p className="eyebrow">{stateLabels[match.state]}</p>
                    <h1>{match.format ? formatLabels[match.format] : 'Матч'}</h1>
                    <p>
                        {match.startsAt && match.timeZone
                            ? formatDate(match.startsAt, match.timeZone)
                            : 'Дата пока не указана'}
                    </p>
                </div>
                <span className={`match-state state-${match.state.toLowerCase()}`}>{stateLabels[match.state]}</span>
            </header>
            {message && (
                <p className="form-message" role="status">
                    {message}
                </p>
            )}
            {!online && <p role="status">Без сети доступны только уже загруженные сведения. Действия отключены.</p>}
            <section className="match-panel">
                <h2>Состав</h2>
                <div className="teams">
                    {match.teams.map((team) => (
                        <article key={team.code}>
                            <h3>{team.code === 'TEAM_A' ? 'Команда A' : 'Команда B'}</h3>
                            <p>
                                {team.occupiedPlaces + team.reservedPlaces} из {team.capacity}
                            </p>
                            <ul>
                                {match.participants
                                    .filter((item) => item.team === team.code && item.state === 'ACTIVE')
                                    .map((item) => (
                                        <li key={item.id}>
                                            {item.userId === userId ? 'Вы' : 'Игрок'}
                                            {item.isOrganizer ? ' · организатор' : ''}
                                        </li>
                                    ))}
                                {match.guests
                                    .filter((item) => item.team === team.code)
                                    .map((item) => (
                                        <li key={item.id}>{item.label} · гость</li>
                                    ))}
                            </ul>
                        </article>
                    ))}
                </div>
            </section>
            <section className="match-panel">
                <h2>Условия</h2>
                <dl className="match-facts">
                    <div>
                        <dt>Уровень</dt>
                        <dd>
                            {match.skillMin?.toFixed(1)}–{match.skillMax?.toFixed(1)}
                        </dd>
                    </div>
                    <div>
                        <dt>Вступление</dt>
                        <dd>{match.joinMode === 'AUTO' ? 'Автоматически' : 'По заявке'}</dd>
                    </div>
                    <div>
                        <dt>Бронь</dt>
                        <dd>
                            {match.bookingState === 'BOOKED_EXTERNALLY'
                                ? 'Забронировано вне PickleHub'
                                : match.bookingState === 'NOT_BOOKED'
                                  ? 'Не забронировано'
                                  : 'Не указано'}
                        </dd>
                    </div>
                </dl>
                {match.bookingNote && <p>{match.bookingNote}</p>}
                {match.description && <p>{match.description}</p>}
            </section>
            {userId && match.state === 'PUBLISHED' && !ownParticipant && !isOrganizer && (
                <section className="match-panel">
                    <h2>Вступить</h2>
                    <label>
                        Команда
                        <select
                            value={teamChoice}
                            onChange={(event) => {
                                setTeamChoice(event.target.value as TeamChoice);
                            }}
                        >
                            <option value="ANY">Любая</option>
                            <option value="TEAM_A">Команда A</option>
                            <option value="TEAM_B">Команда B</option>
                        </select>
                    </label>
                    <button
                        className="primary-action"
                        disabled={!online || busy}
                        type="button"
                        onClick={() =>
                            void mutate(
                                'join',
                                (key) =>
                                    client.joinMatch(match.id, { expectedVersion: match.version, teamChoice }, key),
                                match.joinMode === 'APPROVAL' ? 'Заявка отправлена.' : 'Участие обновлено.'
                            )
                        }
                    >
                        Вступить
                    </button>
                </section>
            )}
            {isOrganizer && requests.some((item) => item.state === 'PENDING') && (
                <section className="match-panel">
                    <h2>Заявки</h2>
                    <ul className="action-list">
                        {requests
                            .filter((item) => item.state === 'PENDING')
                            .map((request) => (
                                <li key={request.id}>
                                    <span>Игрок · {request.teamChoice}</span>
                                    <button
                                        disabled={!online || busy}
                                        onClick={() =>
                                            void mutate(
                                                `approve-${request.id}`,
                                                (key) =>
                                                    client.decideMatchJoinRequest(
                                                        match.id,
                                                        request.id,
                                                        'approve',
                                                        match.version,
                                                        key
                                                    ),
                                                'Заявка одобрена.'
                                            )
                                        }
                                    >
                                        Принять
                                    </button>
                                    <button
                                        disabled={!online || busy}
                                        onClick={() =>
                                            void mutate(
                                                `reject-${request.id}`,
                                                (key) =>
                                                    client.decideMatchJoinRequest(
                                                        match.id,
                                                        request.id,
                                                        'reject',
                                                        match.version,
                                                        key
                                                    ),
                                                'Заявка отклонена.'
                                            )
                                        }
                                    >
                                        Отклонить
                                    </button>
                                </li>
                            ))}
                    </ul>
                </section>
            )}
            {isOrganizer && waitlist.length > 0 && (
                <section className="match-panel">
                    <h2>Очередь</h2>
                    <ol>
                        {waitlist.map((entry) => (
                            <li key={entry.id}>
                                Позиция {entry.position} · {entry.state}
                                {entry.state === 'OFFERED' && (
                                    <button
                                        disabled={!online || busy}
                                        onClick={() =>
                                            void mutate(
                                                `promote-${entry.id}`,
                                                (key) =>
                                                    client.actOnMatchWaitlist(
                                                        match.id,
                                                        entry.id,
                                                        'promote',
                                                        match.version,
                                                        key
                                                    ),
                                                'Место подтверждено.'
                                            )
                                        }
                                    >
                                        Подтвердить место
                                    </button>
                                )}
                            </li>
                        ))}
                    </ol>
                </section>
            )}
            {!isOrganizer &&
                waitlist.some(
                    (entry) => entry.playerId === userId && (entry.state === 'WAITING' || entry.state === 'OFFERED')
                ) && (
                    <section className="match-panel">
                        <h2>Ваша очередь</h2>
                        {waitlist
                            .filter(
                                (entry) =>
                                    entry.playerId === userId &&
                                    (entry.state === 'WAITING' || entry.state === 'OFFERED')
                            )
                            .map((entry) => (
                                <div key={entry.id}>
                                    <p>
                                        Позиция {entry.position}
                                        {entry.offerExpiresAt
                                            ? ` · место предложено до ${formatDate(entry.offerExpiresAt, match.timeZone ?? 'UTC')}`
                                            : ''}
                                    </p>
                                    <button
                                        className="secondary-action"
                                        disabled={!online || busy}
                                        type="button"
                                        onClick={() =>
                                            void mutate(
                                                `withdraw-waitlist-${entry.id}`,
                                                (key) =>
                                                    client.actOnMatchWaitlist(
                                                        match.id,
                                                        entry.id,
                                                        'withdraw',
                                                        match.version,
                                                        key
                                                    ),
                                                'Вы вышли из очереди.'
                                            )
                                        }
                                    >
                                        Выйти из очереди
                                    </button>
                                </div>
                            ))}
                    </section>
                )}
            {isOrganizer && match.state === 'DRAFT' && (
                <button
                    className="primary-action"
                    disabled={!online || busy}
                    onClick={() => void deliverInvite(match, 'publish')}
                >
                    Опубликовать
                </button>
            )}
            {isOrganizer && match.visibility === 'UNLISTED' && match.state !== 'DRAFT' && (
                <button
                    className="secondary-action"
                    disabled={!online || busy}
                    type="button"
                    onClick={() => {
                        setConfirmAction({
                            label: 'Выпустить новую ссылку? Старая сразу перестанет работать.',
                            run: () => deliverInvite(match, 'rotate'),
                        });
                    }}
                >
                    Обновить секретную ссылку
                </button>
            )}
            {inviteUrl && (
                <section className="match-panel invite-delivery">
                    <h2>Ссылка на матч</h2>
                    <input aria-label="Ссылка на матч" readOnly value={inviteUrl} />
                    <button
                        className="primary-action"
                        type="button"
                        onClick={() =>
                            void navigator.clipboard
                                .writeText(inviteUrl)
                                .then(() => {
                                    setMessage('Ссылка скопирована.');
                                })
                                .catch(() => {
                                    setMessage('Выделите и скопируйте ссылку вручную.');
                                })
                        }
                    >
                        Скопировать ссылку
                    </button>
                </section>
            )}
            {isOrganizer && match.state === 'PUBLISHED' && (
                <button
                    className="primary-action"
                    disabled={!online || busy}
                    onClick={() => {
                        setConfirmAction({
                            label: 'Начать матч? После этого состав нельзя изменить.',
                            run: () =>
                                mutate(
                                    'start',
                                    (key) => client.transitionMatch(match.id, 'start', match.version, key),
                                    'Матч начат.'
                                ),
                        });
                    }}
                >
                    Начать матч
                </button>
            )}
            {ownParticipant && !isOrganizer && match.state === 'PUBLISHED' && (
                <button
                    className="secondary-action"
                    disabled={!online || busy}
                    onClick={() => {
                        setConfirmAction({
                            label: 'Выйти из матча? Освободившееся место перейдёт следующему игроку.',
                            run: () =>
                                mutate(
                                    'leave',
                                    (key) => client.leaveMatch(match.id, ownParticipant.id, match.version, key),
                                    'Вы вышли из матча.'
                                ),
                        });
                    }}
                >
                    Выйти
                </button>
            )}
            {isOrganizer && (match.state === 'DRAFT' || match.state === 'PUBLISHED') && (
                <button
                    className="danger-action"
                    disabled={!online || busy}
                    onClick={() => {
                        setConfirmAction({
                            label: 'Отменить матч? Это действие нельзя отменить.',
                            run: () =>
                                mutate(
                                    'cancel',
                                    (key) => client.transitionMatch(match.id, 'cancel', match.version, key),
                                    'Матч отменён.'
                                ),
                        });
                    }}
                >
                    Отменить матч
                </button>
            )}
            {isOrganizer && (match.state === 'IN_PROGRESS' || match.state === 'AWAITING_CONFIRMATION') && (
                <ResultForm
                    busy={busy}
                    online={online}
                    onSubmit={(body) =>
                        mutate(
                            'result',
                            (key) =>
                                client.proposeMatchResult(match.id, { ...body, expectedVersion: match.version }, key),
                            'Результат отправлен соперникам на подтверждение.'
                        )
                    }
                />
            )}
            {result && (
                <section className="match-panel result-panel">
                    <h2>Результат</h2>
                    <p>
                        {result.state === 'CONFIRMED'
                            ? 'Подтверждён — статистика окончательная.'
                            : result.state === 'DISPUTED'
                              ? 'Оспорен — статистика не обновлена.'
                              : 'Ожидает подтверждения — это ещё не окончательная статистика.'}
                    </p>
                    {result.mode === 'SCORED' && (
                        <ol>
                            {result.games.map((game) => (
                                <li key={game.gameNumber}>
                                    {game.teamAPoints}:{game.teamBPoints}
                                </li>
                            ))}
                        </ol>
                    )}
                    {ownParticipant && !isOrganizer && result.state === 'PROPOSED' && (
                        <div className="dialog-actions">
                            <button
                                className="primary-action"
                                disabled={!online || busy}
                                onClick={() => {
                                    setConfirmAction({
                                        label: 'Подтвердить этот результат как окончательный?',
                                        run: () =>
                                            mutate(
                                                'confirm-result',
                                                (key) =>
                                                    client.resolveMatchResult(
                                                        match.id,
                                                        result.id,
                                                        'confirm',
                                                        {
                                                            expectedVersion: match.version,
                                                            resultVersion: result.version,
                                                        },
                                                        key
                                                    ),
                                                'Результат подтверждён.'
                                            ),
                                    });
                                }}
                            >
                                Подтвердить
                            </button>
                            <button
                                className="danger-action"
                                disabled={!online || busy}
                                onClick={() => {
                                    setConfirmAction({
                                        label: 'Оспорить результат? Статистика не изменится до решения модератора.',
                                        run: () =>
                                            mutate(
                                                'dispute-result',
                                                (key) =>
                                                    client.resolveMatchResult(
                                                        match.id,
                                                        result.id,
                                                        'dispute',
                                                        {
                                                            expectedVersion: match.version,
                                                            resultVersion: result.version,
                                                        },
                                                        key
                                                    ),
                                                'Результат оспорен.'
                                            ),
                                    });
                                }}
                            >
                                Оспорить
                            </button>
                        </div>
                    )}
                </section>
            )}
            <section className="match-panel">
                <h2>Уведомления</h2>
                <p>
                    Системные уведомления внутри PickleHub включены. Каналы Telegram и email станут доступны в
                    настройках после подключения сервиса уведомлений.
                </p>
            </section>
            <ConfirmDialog
                action={confirmAction?.label}
                onClose={() => {
                    setConfirmAction(undefined);
                }}
                onConfirm={() => void confirmAction?.run()}
            />
        </main>
    );
}

function ResultForm({
    busy,
    online,
    onSubmit,
}: {
    readonly busy: boolean;
    readonly online: boolean;
    readonly onSubmit: (body: Omit<components['schemas']['ProposeMatchResult'], 'expectedVersion'>) => Promise<void>;
}) {
    const [withoutScore, setWithoutScore] = useState(false);
    const [series, setSeries] = useState<components['schemas']['MatchSeriesFormat']>('BEST_OF_3');
    const [games, setGames] = useState([{ gameNumber: 1, teamAPoints: 11, teamBPoints: 0 }]);
    const [message, setMessage] = useState<string>();
    async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (withoutScore) return onSubmit({ mode: 'PLAYED_WITHOUT_SCORE' });
        const checked = games.map((game) => matchGameSchema.safeParse(game));
        const invalid = checked.find((item) => !item.success);
        if (invalid) {
            setMessage(invalid.error.issues[0]?.message);
            return;
        }
        try {
            const winner = validateMatchSeries(series, games);
            await onSubmit({ games, mode: 'SCORED', seriesFormat: series, winningTeam: winner });
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Проверьте счёт серии');
        }
    }
    return (
        <section className="match-panel">
            <h2>Внести результат</h2>
            <form className="result-form" onSubmit={(event) => void submit(event)}>
                <label className="check">
                    <input
                        type="checkbox"
                        checked={withoutScore}
                        onChange={(event) => {
                            setWithoutScore(event.target.checked);
                        }}
                    />
                    <span>Подтвердить только факт игры, без счёта</span>
                </label>
                {!withoutScore && (
                    <>
                        <label>
                            Серия
                            <select
                                value={series}
                                onChange={(event) => {
                                    setSeries(event.target.value as typeof series);
                                }}
                            >
                                <option value="BEST_OF_1">Одна партия</option>
                                <option value="BEST_OF_3">До двух побед</option>
                                <option value="BEST_OF_5">До трёх побед</option>
                            </select>
                        </label>
                        {games.map((game, index) => (
                            <div className="score-row" key={game.gameNumber}>
                                <span>Партия {game.gameNumber}</span>
                                <label>
                                    Команда A
                                    <input
                                        aria-label={`Команда A, партия ${String(game.gameNumber)}`}
                                        type="number"
                                        min="0"
                                        max="99"
                                        value={game.teamAPoints}
                                        onChange={(event) => {
                                            setGames((items) =>
                                                items.map((item, itemIndex) =>
                                                    itemIndex === index
                                                        ? { ...item, teamAPoints: Number(event.target.value) }
                                                        : item
                                                )
                                            );
                                        }}
                                    />
                                </label>
                                <span>:</span>
                                <label>
                                    Команда B
                                    <input
                                        aria-label={`Команда B, партия ${String(game.gameNumber)}`}
                                        type="number"
                                        min="0"
                                        max="99"
                                        value={game.teamBPoints}
                                        onChange={(event) => {
                                            setGames((items) =>
                                                items.map((item, itemIndex) =>
                                                    itemIndex === index
                                                        ? { ...item, teamBPoints: Number(event.target.value) }
                                                        : item
                                                )
                                            );
                                        }}
                                    />
                                </label>
                            </div>
                        ))}
                        <button
                            className="secondary-action"
                            type="button"
                            disabled={games.length >= Number(series.slice(-1))}
                            onClick={() => {
                                setGames((items) => [
                                    ...items,
                                    { gameNumber: items.length + 1, teamAPoints: 11, teamBPoints: 0 },
                                ]);
                            }}
                        >
                            Добавить партию
                        </button>
                    </>
                )}
                <button className="primary-action" disabled={!online || busy} type="submit">
                    Отправить на подтверждение
                </button>
                {message && <p role="alert">{message}</p>}
            </form>
        </section>
    );
}
