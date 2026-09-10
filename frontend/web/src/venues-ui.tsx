import { ApiError, type components, type IdentityClient } from '@picklehub/api-client';
import { disabledAnalytics } from '@picklehub/analytics';
import type { RuntimeConfig } from '@picklehub/validation';
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type SyntheticEvent } from 'react';

const VenueMap = lazy(async () => ({ default: (await import('./venue-map')).VenueMap }));

type VenueSummary = components['schemas']['VenueSummary'];
type Venue = components['schemas']['Venue'];
interface Filters {
    readonly accessMode: components['schemas']['VenueAccessMode'] | '';
    readonly environment: components['schemas']['VenueEnvironment'] | '';
    readonly lighting: components['schemas']['VenueAmenityState'] | '';
    readonly permanentNet: components['schemas']['VenueAmenityState'] | '';
}
type Origin = components['schemas']['GeoPoint'];

const emptyFilters: Filters = { accessMode: '', environment: '', lighting: '', permanentNet: '' };

const verificationLabels: Record<components['schemas']['VenueVerificationState'], string> = {
    COMMUNITY_CONFIRMED: 'Подтверждено сообществом',
    IMPORTED_UNREVIEWED: 'Импортировано, ещё не проверено',
    MODERATOR_VERIFIED: 'Проверено модератором',
    STALE: 'Данные могут быть устаревшими',
};

function venueError(error: unknown): string {
    if (error instanceof ApiError) {
        const code = error.response?.error.code;
        if (code === 'GEOCODER_TEMPORARILY_UNAVAILABLE') return 'Поиск адреса временно недоступен. Каталог работает.';
        if (code === 'SEARCH_AREA_TOO_LARGE') return 'Область слишком большая. Приблизьте карту и повторите.';
        if (code === 'PRIVATE_LOCATION_NOT_ALLOWED') return 'Частные дома и домашние адреса добавлять нельзя.';
        if (code === 'SOURCE_STORAGE_NOT_ALLOWED') {
            return 'Эту подсказку нельзя сохранить. Введите данные вручную и поставьте точку.';
        }
        if (code === 'VENUE_VERSION_CONFLICT') return 'Карточка обновилась. Откройте её заново и проверьте правку.';
        if (code === 'VENUE_ALREADY_REPORTED') return 'Такая жалоба уже находится на проверке.';
        if (code === 'RATE_LIMITED')
            return `Слишком много запросов. Повторите через ${String(error.retryAfterSeconds ?? 60)} сек.`;
        return error.response?.error.message ?? 'Не удалось выполнить запрос.';
    }
    return 'Нет связи с сервером. Загруженные результаты остались доступны.';
}

function distanceBucket(distance: number | undefined) {
    if (distance === undefined) return 'UNKNOWN' as const;
    if (distance < 1_000) return 'LT_1KM' as const;
    if (distance < 5_000) return '1_5KM' as const;
    if (distance < 20_000) return '5_20KM' as const;
    return 'GE_20KM' as const;
}

function Attribution({ venues }: { readonly venues: readonly VenueSummary[] }) {
    const sources = useMemo(() => {
        const unique = new Map<string, components['schemas']['VenueAttribution']>();
        for (const venue of venues) {
            for (const source of venue.attribution) unique.set(`${source.text}|${source.link ?? ''}`, source);
        }
        return [...unique.values()];
    }, [venues]);
    if (sources.length === 0) return null;
    return (
        <footer className="catalogue-attribution" aria-label="Источники данных">
            <strong>Данные:</strong>{' '}
            {sources.map((source, index) => (
                <span key={`${source.text}-${source.observedAt}`}>
                    {index > 0 && ' · '}
                    {source.link ? <a href={source.link}>{source.text}</a> : source.text}
                </span>
            ))}
        </footer>
    );
}

function VenueCard({
    onSelect,
    venue,
}: {
    readonly onSelect: (venue: VenueSummary, surface: 'LIST' | 'TEXT') => void;
    readonly venue: VenueSummary;
}) {
    return (
        <li>
            <button
                className="venue-card"
                type="button"
                onClick={() => {
                    onSelect(venue, 'LIST');
                }}
            >
                <span className="venue-card-heading">
                    <strong>{venue.name}</strong>
                    {venue.distanceMeters !== undefined && <span>{Math.round(venue.distanceMeters)} м</span>}
                </span>
                <span>{venue.normalizedAddress}</span>
                <span className={`verification ${venue.verificationState === 'STALE' ? 'stale' : ''}`}>
                    {verificationLabels[venue.verificationState]}
                </span>
                <small>Проверено: {new Date(venue.lastVerifiedAt).toLocaleDateString('ru-RU')}</small>
            </button>
        </li>
    );
}

function FiltersForm({
    filters,
    onChange,
}: {
    readonly filters: Filters;
    readonly onChange: (value: Filters) => void;
}) {
    return (
        <fieldset className="venue-filters">
            <legend>Фильтры каталога</legend>
            <label>
                Размещение
                <select
                    value={filters.environment}
                    onChange={(event) => {
                        onChange({ ...filters, environment: event.target.value as Filters['environment'] });
                    }}
                >
                    <option value="">Любое</option>
                    <option value="INDOOR">В помещении</option>
                    <option value="OUTDOOR">На улице</option>
                    <option value="MIXED">Смешанное</option>
                    <option value="UNKNOWN">Нет данных</option>
                </select>
            </label>
            <label>
                Доступ
                <select
                    value={filters.accessMode}
                    onChange={(event) => {
                        onChange({ ...filters, accessMode: event.target.value as Filters['accessMode'] });
                    }}
                >
                    <option value="">Любой</option>
                    <option value="FREE">Бесплатно</option>
                    <option value="PAID">Платно</option>
                    <option value="REGISTRATION_REQUIRED">Нужна регистрация</option>
                    <option value="MEMBERS_ONLY">Только для участников</option>
                    <option value="UNKNOWN">Нет данных</option>
                </select>
            </label>
            <label>
                Освещение
                <select
                    value={filters.lighting}
                    onChange={(event) => {
                        onChange({ ...filters, lighting: event.target.value as Filters['lighting'] });
                    }}
                >
                    <option value="">Не важно</option>
                    <option value="YES">Есть</option>
                    <option value="NO">Нет</option>
                    <option value="UNKNOWN">Нет данных</option>
                </select>
            </label>
            <label>
                Постоянная сетка
                <select
                    value={filters.permanentNet}
                    onChange={(event) => {
                        onChange({ ...filters, permanentNet: event.target.value as Filters['permanentNet'] });
                    }}
                >
                    <option value="">Не важно</option>
                    <option value="YES">Есть</option>
                    <option value="NO">Нет</option>
                    <option value="UNKNOWN">Нет данных</option>
                </select>
            </label>
        </fieldset>
    );
}

function VenueDetails({
    client,
    onChoose,
    onClose,
    online,
    summary,
}: {
    readonly client: IdentityClient;
    readonly onChoose: () => void;
    readonly onClose: () => void;
    readonly online: boolean;
    readonly summary: VenueSummary;
}) {
    const [venue, setVenue] = useState<Venue>();
    const [message, setMessage] = useState<string>();
    const [revisionName, setRevisionName] = useState(summary.name);
    const [reportReason, setReportReason] = useState<components['schemas']['VenueReportReason']>('CLOSED');

    const load = useCallback(() => {
        void client
            .getVenue(summary.id)
            .then(setVenue)
            .catch((error: unknown) => {
                setMessage(venueError(error));
            });
    }, [client, summary.id]);
    useEffect(load, [load]);

    async function submitRevision(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!online || !venue) {
            setMessage('Для отправки исправления нужно подключение к интернету.');
            return;
        }
        if (revisionName.trim() === venue.name) {
            setMessage('Измените хотя бы одно поле.');
            return;
        }
        try {
            await client.proposeVenueRevision(venue.id, { baseVersion: venue.version, name: revisionName.trim() });
            setMessage('Исправление отправлено на проверку. Публичная карточка пока не изменилась.');
        } catch (error) {
            setMessage(venueError(error));
        }
    }

    async function submitReport(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!online) {
            setMessage('Для отправки жалобы нужно подключение к интернету.');
            return;
        }
        try {
            await client.reportVenue(summary.id, { reason: reportReason });
            setMessage(
                reportReason === 'PRIVATE_RESIDENCE'
                    ? 'Жалоба принята. Адрес скрыт из каталога до проверки.'
                    : 'Жалоба отправлена на проверку.'
            );
        } catch (error) {
            setMessage(venueError(error));
        }
    }

    return (
        <aside className="venue-details" aria-labelledby="venue-details-title">
            <button className="text-button" type="button" onClick={onClose}>
                ← К результатам
            </button>
            <h2 id="venue-details-title">{summary.name}</h2>
            <p>{summary.normalizedAddress}</p>
            <p className={`verification ${summary.verificationState === 'STALE' ? 'stale' : ''}`}>
                {verificationLabels[summary.verificationState]}
            </p>
            <button className="primary-action" type="button" onClick={onChoose}>
                Выбрать для матча
            </button>
            {!venue && !message && <p role="status">Загружаем подробности…</p>}
            {venue && (
                <dl className="venue-facts">
                    <div>
                        <dt>Кортов</dt>
                        <dd>{venue.pickleballCourtCount ?? 'Нет данных'}</dd>
                    </div>
                    <div>
                        <dt>Покрытие</dt>
                        <dd>{venue.surfaceType ?? 'Нет данных'}</dd>
                    </div>
                    <div>
                        <dt>Часы</dt>
                        <dd>{venue.openingHours ? 'Указаны в карточке площадки' : 'Нет данных'}</dd>
                    </div>
                    <div>
                        <dt>Сезонность</dt>
                        <dd>{venue.seasonality ?? 'Нет данных'}</dd>
                    </div>
                </dl>
            )}
            {message && (
                <p className="form-message" role="status">
                    {message}
                </p>
            )}
            {venue && (
                <details>
                    <summary>Предложить исправление</summary>
                    <form onSubmit={(event) => void submitRevision(event)}>
                        <label>
                            Название
                            <input
                                value={revisionName}
                                onChange={(event) => {
                                    setRevisionName(event.target.value);
                                }}
                            />
                        </label>
                        <button className="secondary-action" disabled={!online} type="submit">
                            Отправить на проверку
                        </button>
                    </form>
                </details>
            )}
            <details>
                <summary>Пожаловаться</summary>
                <form onSubmit={(event) => void submitReport(event)}>
                    <label>
                        Причина
                        <select
                            value={reportReason}
                            onChange={(event) => {
                                setReportReason(event.target.value as typeof reportReason);
                            }}
                        >
                            <option value="CLOSED">Площадка закрыта</option>
                            <option value="DUPLICATE">Дубликат</option>
                            <option value="PRIVATE_RESIDENCE">Частный дом или домашний адрес</option>
                        </select>
                    </label>
                    <button className="danger-action" disabled={!online} type="submit">
                        Отправить жалобу
                    </button>
                </form>
            </details>
            <Attribution venues={[summary]} />
        </aside>
    );
}

function NewVenueForm({ client, online }: { readonly client: IdentityClient; readonly online: boolean }) {
    const search = new URLSearchParams(window.location.search);
    const [address, setAddress] = useState('');
    const [locality, setLocality] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [matchId, setMatchId] = useState(search.get('matchId') ?? '');
    const [name, setName] = useState('');
    const [suggestions, setSuggestions] = useState<readonly components['schemas']['GeocodingSuggestion'][]>([]);
    const [selectionToken, setSelectionToken] = useState<string>();
    const [message, setMessage] = useState<string>();
    const [publicConfirmed, setPublicConfirmed] = useState(false);
    const privatePattern = /(?:частн(?:ый|ого) дом|жилой дом|квартир|подъезд|дач|коттедж)/iu;

    async function findAddress() {
        if (!online) {
            setMessage('Для поиска адреса нужно подключение к интернету.');
            return;
        }
        if (address.trim().length < 2) {
            setMessage('Введите не менее двух символов.');
            return;
        }
        try {
            const result = await client.suggestVenueAddresses(address.trim());
            setSuggestions(result.items);
            setMessage(result.items.length === 0 ? 'Адрес не найден. Можно поставить точку вручную.' : undefined);
        } catch (error) {
            setSuggestions([]);
            setMessage(venueError(error));
        }
    }

    function chooseSuggestion(suggestion: components['schemas']['GeocodingSuggestion']) {
        setAddress(suggestion.label);
        setSelectionToken(suggestion.selectionToken);
        if (suggestion.location) {
            setLatitude(String(suggestion.location.latitude));
            setLongitude(String(suggestion.location.longitude));
        }
        setSuggestions([]);
    }

    async function submit(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!online) {
            setMessage('Для добавления площадки нужно подключение к интернету.');
            return;
        }
        if (!publicConfirmed) {
            setMessage('Подтвердите, что это публичный спортивный объект.');
            return;
        }
        if (privatePattern.test(`${name} ${address}`)) {
            setMessage('Похоже на частный дом. Такие адреса запрещены.');
            return;
        }
        const point = { latitude: Number(latitude), longitude: Number(longitude) };
        if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
            setMessage('Укажите корректную точку на карте или координаты.');
            return;
        }
        try {
            const candidate = await client.createVenueCandidate({
                locality: locality.trim(),
                location: point,
                name: name.trim(),
                normalizedAddress: address.trim(),
                source: selectionToken ? { kind: 'ALLOWED_GEOCODER', selectionToken } : { kind: 'MANUAL_PIN' },
                sourceMatchId: matchId,
                timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
            setMessage(
                `Площадка сохранена только для матча. Статус: ${candidate.state}. В каталог она попадёт лишь после игры и модерации.`
            );
        } catch (error) {
            setMessage(venueError(error));
        }
    }

    return (
        <section className="new-venue-card" aria-labelledby="new-venue-title">
            <h2 id="new-venue-title">Новая площадка для матча</h2>
            <p className="privacy-warning">
                Полный адрес станет публичным только после состоявшегося матча и модерации. Не указывайте частный дом,
                квартиру, дачу или домашний корт.
            </p>
            <form className="form-grid" onSubmit={(event) => void submit(event)}>
                <label>
                    Название
                    <input
                        required
                        minLength={2}
                        value={name}
                        onChange={(event) => {
                            setName(event.target.value);
                        }}
                    />
                </label>
                <div>
                    <label htmlFor="new-venue-address">Публичный адрес</label>
                    <span className="address-search">
                        <input
                            id="new-venue-address"
                            required
                            value={address}
                            onChange={(event) => {
                                setAddress(event.target.value);
                                setSelectionToken(undefined);
                            }}
                        />
                        <button className="secondary-action" type="button" onClick={() => void findAddress()}>
                            Найти
                        </button>
                    </span>
                </div>
                {suggestions.length > 0 && (
                    <ul className="suggestions" aria-label="Подсказки адреса">
                        {suggestions.map((suggestion) => (
                            <li key={suggestion.selectionToken}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        chooseSuggestion(suggestion);
                                    }}
                                >
                                    {suggestion.label}
                                    <small>{suggestion.attribution.text}</small>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                <label>
                    Населённый пункт
                    <input
                        required
                        value={locality}
                        onChange={(event) => {
                            setLocality(event.target.value);
                        }}
                    />
                </label>
                <label>
                    Широта
                    <input
                        inputMode="decimal"
                        required
                        value={latitude}
                        onChange={(event) => {
                            setLatitude(event.target.value);
                            setSelectionToken(undefined);
                        }}
                    />
                </label>
                <label>
                    Долгота
                    <input
                        inputMode="decimal"
                        required
                        value={longitude}
                        onChange={(event) => {
                            setLongitude(event.target.value);
                            setSelectionToken(undefined);
                        }}
                    />
                </label>
                <label>
                    ID создаваемого матча
                    <input
                        required
                        value={matchId}
                        onChange={(event) => {
                            setMatchId(event.target.value);
                        }}
                    />
                </label>
                <label className="check">
                    <input
                        type="checkbox"
                        checked={publicConfirmed}
                        onChange={(event) => {
                            setPublicConfirmed(event.target.checked);
                        }}
                    />
                    <span>Подтверждаю, что это публичный спортивный объект и адрес можно показывать всем.</span>
                </label>
                <button className="primary-action" type="submit" disabled={!online}>
                    Добавить только в матч
                </button>
            </form>
            {message && (
                <p className="form-message" role="status">
                    {message}
                </p>
            )}
        </section>
    );
}

export function VenuesScreen({
    client,
    config,
    online,
}: {
    readonly client: IdentityClient;
    readonly config: RuntimeConfig;
    readonly online: boolean;
}) {
    const [filters, setFilters] = useState<Filters>(emptyFilters);
    const [items, setItems] = useState<readonly VenueSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string>();
    const [origin, setOrigin] = useState<Origin>();
    const [query, setQuery] = useState('');
    const [selected, setSelected] = useState<VenueSummary>();
    const [showNew, setShowNew] = useState(false);
    const [surface, setSurface] = useState<'LIST' | 'MAP'>('LIST');
    const [tileError, setTileError] = useState(false);
    const [locationDenied, setLocationDenied] = useState(false);
    const [selectedSurface, setSelectedSurface] = useState<'MAP' | 'LIST' | 'TEXT'>('LIST');
    const [selectionMessage, setSelectionMessage] = useState<string>();
    const [snapshotAt, setSnapshotAt] = useState<string>();
    const [nextCursor, setNextCursor] = useState<string>();

    const filterQuery = useMemo(
        () => ({
            ...(filters.accessMode ? { accessMode: filters.accessMode } : {}),
            ...(filters.environment ? { environment: filters.environment } : {}),
            ...(filters.lighting ? { lighting: filters.lighting } : {}),
            ...(filters.permanentNet ? { permanentNet: filters.permanentNet } : {}),
            publicationState: 'PUBLISHED' as const,
        }),
        [filters]
    );

    const searchList = useCallback(
        async (text: string, point: Origin | undefined) => {
            setLoading(true);
            setMessage(undefined);
            try {
                const page = await client.searchVenues({
                    ...filterQuery,
                    limit: 50,
                    ...(text.trim() ? { query: text.trim() } : {}),
                    ...(point ? { ...point, radiusMeters: 20_000 } : {}),
                });
                setItems(page.items);
                setNextCursor(page.pageInfo.nextCursor ?? undefined);
                setSnapshotAt(page.snapshotAt);
                setMessage(
                    !online
                        ? 'Показан сохранённый снимок каталога. Для обновления подключитесь к сети.'
                        : page.items.length === 0
                          ? 'Ничего не найдено. Измените фильтры, область или запрос.'
                          : undefined
                );
            } catch (error) {
                setMessage(venueError(error));
            } finally {
                setLoading(false);
            }
        },
        [client, filterQuery, online]
    );

    async function loadMore() {
        if (!nextCursor || !online) return;
        setLoading(true);
        try {
            const page = await client.searchVenues({
                ...filterQuery,
                cursor: nextCursor,
                limit: 50,
                ...(query.trim() ? { query: query.trim() } : {}),
                ...(origin ? { ...origin, radiusMeters: 20_000 } : {}),
            });
            setItems((current) => [...current, ...page.items]);
            setNextCursor(page.pageInfo.nextCursor ?? undefined);
        } catch (error) {
            setMessage(venueError(error));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void searchList('', undefined);
    }, [searchList]);

    function locate() {
        if (locationDenied) {
            setMessage('Геолокация отключена. Используйте название или область карты.');
            return;
        }
        if (!online) {
            setMessage('Геолокация недоступна без сети. Можно искать по тексту или карте.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const point = {
                    latitude: Number(position.coords.latitude.toFixed(6)),
                    longitude: Number(position.coords.longitude.toFixed(6)),
                };
                setOrigin(point);
                void searchList(query, point);
            },
            () => {
                setLocationDenied(true);
                setMessage('Доступ к геолокации не дан. Ищите по названию или выберите область карты вручную.');
            },
            { enableHighAccuracy: false, maximumAge: 60_000, timeout: 8_000 }
        );
    }

    async function searchBounds(bounds: {
        readonly east: number;
        readonly north: number;
        readonly south: number;
        readonly west: number;
    }) {
        if (!online) {
            setMessage('Для новой области нужна сеть. Список остаётся доступен.');
            return;
        }
        setLoading(true);
        try {
            const page = await client.searchVenueMap({ ...bounds, ...filterQuery, limit: 200 });
            setItems(page.items);
            setMessage(page.items.length === 0 ? 'В этой области площадок не найдено.' : undefined);
        } catch (error) {
            setMessage(venueError(error));
        } finally {
            setLoading(false);
        }
    }

    function selectVenue(venue: VenueSummary, selectedSurface: 'MAP' | 'LIST' | 'TEXT') {
        setSelectedSurface(selectedSurface);
        setSelected(venue);
        setSelectionMessage(undefined);
    }

    function chooseVenue(venue: VenueSummary) {
        disabledAnalytics.track({
            name: 'venue_selected',
            channel: 'web',
            surface: selectedSurface,
            distanceBucket: distanceBucket(venue.distanceMeters),
        });
        setSelectionMessage(`Выбрано: ${venue.name}. Создание матча появится на следующем этапе.`);
        setSelected(undefined);
    }

    if (showNew)
        return (
            <main className="venues-main">
                <button
                    className="text-button"
                    type="button"
                    onClick={() => {
                        setShowNew(false);
                    }}
                >
                    ← К каталогу
                </button>
                <NewVenueForm client={client} online={online} />
            </main>
        );
    return (
        <main className="venues-main">
            <header className="venues-heading">
                <div>
                    <p className="eyebrow">Публичный каталог</p>
                    <h1>Площадки</h1>
                    <p>Найдите проверенную точку или предложите новую для создаваемого матча.</p>
                </div>
                <button
                    className="primary-action"
                    type="button"
                    onClick={() => {
                        setShowNew(true);
                    }}
                >
                    Новая площадка
                </button>
            </header>
            {selected ? (
                <VenueDetails
                    client={client}
                    onChoose={() => {
                        chooseVenue(selected);
                    }}
                    online={online}
                    summary={selected}
                    onClose={() => {
                        setSelected(undefined);
                    }}
                />
            ) : (
                <>
                    <form
                        className="venue-search"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void searchList(query, origin);
                        }}
                        role="search"
                    >
                        <label htmlFor="venue-query">Название или адрес</label>
                        <div className="search-actions">
                            <input
                                id="venue-query"
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                }}
                            />
                            <button className="primary-action" type="submit" disabled={!online}>
                                Найти
                            </button>
                            <button
                                className="secondary-action"
                                type="button"
                                onClick={locate}
                                disabled={locationDenied}
                            >
                                Рядом со мной
                            </button>
                        </div>
                    </form>
                    <FiltersForm filters={filters} onChange={setFilters} />
                    <div className="view-switch" role="group" aria-label="Представление каталога">
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
                                venues={items}
                                onBoundsChanged={(bounds) => void searchBounds(bounds)}
                                onError={() => {
                                    setTileError(true);
                                }}
                                onSelect={(venue) => {
                                    selectVenue(venue, 'MAP');
                                }}
                            />
                        </Suspense>
                    )}
                    {surface === 'MAP' && !config.map && (
                        <p className="provider-error" role="status">
                            Карта не настроена для этого окружения. Используйте доступный список.
                        </p>
                    )}
                    {tileError && (
                        <p className="provider-error" role="status">
                            Не удалось загрузить часть карты. Список и атрибуция доступны ниже.
                        </p>
                    )}
                    {loading && (
                        <p className="catalogue-state" role="status">
                            Загружаем площадки…
                        </p>
                    )}
                    {message && (
                        <p className="catalogue-state" role="status">
                            {message}
                        </p>
                    )}
                    {selectionMessage && (
                        <p className="catalogue-state" role="status">
                            {selectionMessage}
                        </p>
                    )}
                    {!online && snapshotAt && (
                        <p className="catalogue-state">Снимок от {new Date(snapshotAt).toLocaleString('ru-RU')}</p>
                    )}
                    <section aria-labelledby="venue-results-title">
                        <h2 id="venue-results-title">Результаты</h2>
                        <ul className="venue-list">
                            {items.map((venue) => (
                                <VenueCard
                                    key={venue.id}
                                    venue={venue}
                                    onSelect={(item) => {
                                        selectVenue(item, query.trim() ? 'TEXT' : 'LIST');
                                    }}
                                />
                            ))}
                        </ul>
                        {nextCursor && (
                            <button
                                className="secondary-action"
                                type="button"
                                disabled={!online || loading}
                                onClick={() => void loadMore()}
                            >
                                Показать ещё
                            </button>
                        )}
                        <Attribution venues={items} />
                    </section>
                </>
            )}
        </main>
    );
}
