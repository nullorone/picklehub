import { disabledAnalytics } from '@picklehub/analytics';
import { ApiError, type components, type IdentityClient } from '@picklehub/api-client';
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';

type OwnProfile = components['schemas']['PlayerProfile'];
type PublicProfile = components['schemas']['PublicPlayerProfile'];
type Statistics = components['schemas']['PlayerStatistics'] | components['schemas']['PublicPlayerStatistics'];
type HistoryEntry = components['schemas']['MatchHistoryEntry'];
type Locality = components['schemas']['Locality'];

const formatLabels = { DOUBLES: '2 × 2', SINGLES: '1 × 1' } as const;
const sliceLabels = { ALL: 'Все матчи', DOUBLES: 'Парные', SINGLES: 'Одиночные' } as const;
const skillLevels = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5] as const;
const historyLabels: Record<components['schemas']['ProfileMatchHistoryState'], string> = {
    AWAITING_CONFIRMATION: 'Ожидает подтверждения',
    CANCELLED: 'Матч отменён',
    CONFIRMED_PLAYED: 'Игра подтверждена без счёта',
    CONFIRMED_SCORED: 'Результат подтверждён',
    DISPUTED: 'Результат оспорен',
    VOIDED: 'Результат аннулирован',
};

function dateTime(value: string): string {
    return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timeZoneName: 'short',
        year: 'numeric',
    }).format(new Date(value));
}

function winRatePercentage(numerator: number, denominator: number): string | undefined {
    if (denominator === 0) return undefined;
    return `${(Math.round((numerator / denominator) * 1000) / 10).toFixed(1)}%`;
}

function profileError(error: unknown): string {
    if (error instanceof ApiError) {
        const code = error.response?.error.code;
        if (code === 'PROFILE_NOT_AVAILABLE') return 'Профиль недоступен.';
        if (code === 'PROFILE_VERSION_CONFLICT')
            return 'Профиль изменился в другом окне. Мы загрузили свежие данные — проверьте их перед сохранением.';
        if (code === 'DUPR_LINK_NOT_ALLOWED') return 'Эту ссылку DUPR сейчас нельзя использовать.';
        if (code === 'AVATAR_UPLOAD_NOT_ALLOWED') return 'Загрузка аватара сейчас недоступна.';
        if (code === 'RATE_LIMITED')
            return `Слишком много запросов. Повторите через ${String(error.retryAfterSeconds ?? 60)} сек.`;
        return error.response?.error.message ?? 'Не удалось выполнить запрос.';
    }
    return 'Нет связи с сервером. Изменения не отправлены.';
}

function profileInitials(name: string): string {
    return name
        .split(/\s+/u)
        .slice(0, 2)
        .map((part) => part[0]?.toLocaleUpperCase('ru-RU'))
        .join('');
}

function resultBucket(count: number): 'ZERO' | 'ONE_FIVE' | 'SIX_TWENTY' | 'GT_TWENTY' {
    if (count === 0) return 'ZERO';
    if (count <= 5) return 'ONE_FIVE';
    if (count <= 20) return 'SIX_TWENTY';
    return 'GT_TWENTY';
}

function Avatar({ name, url }: { readonly name: string; readonly url: string | null }) {
    return url ? (
        <img className="profile-avatar" src={url} alt={`Аватар игрока ${name}`} referrerPolicy="no-referrer" />
    ) : (
        <span className="profile-avatar profile-initials" aria-label={`У игрока ${name} нет аватара`}>
            {profileInitials(name)}
        </span>
    );
}

function ExternalLink({
    link,
    ownership,
}: {
    readonly link: components['schemas']['PublicExternalProfileLink'] | null;
    readonly ownership: 'SELF' | 'OTHER';
}) {
    if (!link) return null;
    return (
        <section className="profile-panel" aria-labelledby="dupr-heading">
            <h2 id="dupr-heading">DUPR</h2>
            <p>
                Внешняя ссылка пользователя. PickleHub не проверяет профиль, не получает рейтинг и не синхронизирует
                данные.
            </p>
            {link.outboundEnabled ? (
                <a
                    className="text-action"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerPolicy="no-referrer"
                    onClick={() => {
                        disabledAnalytics.track({
                            name: 'dupr_link_opened',
                            ownership,
                            surface: 'PROFILE',
                        });
                    }}
                >
                    Открыть внешнюю ссылку DUPR
                </a>
            ) : (
                <p className="form-message">Переход отключён до проверки условий провайдера.</p>
            )}
        </section>
    );
}

function StatisticsView({ statistics }: { readonly statistics: Statistics | undefined }) {
    if (!statistics) {
        return (
            <section className="profile-panel partial-state" aria-labelledby="statistics-heading">
                <h2 id="statistics-heading">Статистика</h2>
                <p>Статистику не удалось загрузить. Значения не заменены нулями.</p>
            </section>
        );
    }
    const played = statistics.totals.find((item) => item.slice === 'ALL')?.played ?? 0;
    return (
        <section className="profile-panel" aria-labelledby="statistics-heading">
            <div className="profile-section-heading">
                <h2 id="statistics-heading">Подтверждённая статистика</h2>
                <p>Рассчитано {dateTime(statistics.calculatedAt)}</p>
            </div>
            {statistics.state === 'UPDATING' && (
                <p className="projection-notice" role="status">
                    Статистика обновляется. Показано последнее полностью согласованное состояние.
                </p>
            )}
            {played === 0 ? (
                <p className="empty-state">Подтверждённых матчей пока нет. Здесь появится история ваших игр.</p>
            ) : (
                <div className="statistics-grid">
                    {statistics.totals.map((total) => {
                        const winRate = winRatePercentage(total.winRateNumerator, total.winRateDenominator);
                        return (
                            <article className="stat-card" key={total.slice}>
                                <h3>{sliceLabels[total.slice]}</h3>
                                <dl>
                                    <div>
                                        <dt>Сыграно</dt>
                                        <dd>{total.played}</dd>
                                    </div>
                                    <div>
                                        <dt>Победы / поражения</dt>
                                        <dd>
                                            {total.wins} / {total.losses}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt>Партии</dt>
                                        <dd>{total.gamesPlayed}</dd>
                                    </div>
                                    <div>
                                        <dt>Командные очки</dt>
                                        <dd>
                                            {total.pointsFor} : {total.pointsAgainst}
                                        </dd>
                                    </div>
                                </dl>
                                {winRate ? (
                                    <div
                                        className="stat-bar"
                                        role="img"
                                        aria-label={`Доля побед ${winRate}, ${String(total.winRateNumerator)} из ${String(total.winRateDenominator)}`}
                                    >
                                        <span style={{ width: winRate }} aria-hidden="true" />
                                        <strong>Доля побед: {winRate}</strong>
                                    </div>
                                ) : (
                                    <p>Пока нет матчей с результатом — доля побед не вычисляется.</p>
                                )}
                                {total.lastConfirmedAt && (
                                    <small>Последнее подтверждение: {dateTime(total.lastConfirmedAt)}</small>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}
            <div className="threshold-grid">
                {'reliability' in statistics && 'denominator' in statistics.reliability ? (
                    <p>
                        Надёжность организатора:{' '}
                        {statistics.reliability.percentage === null
                            ? 'недостаточно завершённых матчей'
                            : `${statistics.reliability.percentage.toFixed(1)}% (${String(statistics.reliability.denominator)} матчей)`}
                    </p>
                ) : (
                    <p>
                        Надёжность организатора:{' '}
                        {statistics.reliability.percentage === null
                            ? 'недостаточно завершённых матчей'
                            : `${statistics.reliability.percentage.toFixed(1)}%`}
                    </p>
                )}
                {'attendanceAvailable' in statistics ? (
                    <p>
                        Посещаемость:{' '}
                        {!statistics.attendanceAvailable
                            ? 'данные о посещаемости ещё не учитываются'
                            : statistics.attendance.percentage === null
                              ? 'недостаточно подтверждённых событий'
                              : `${statistics.attendance.percentage.toFixed(1)}% неявок`}
                    </p>
                ) : (
                    <p>
                        Посещаемость:{' '}
                        {!statistics.attendance.available
                            ? 'данные о посещаемости ещё не учитываются'
                            : statistics.attendance.percentage === null
                              ? 'недостаточно подтверждённых событий'
                              : `${statistics.attendance.percentage.toFixed(1)}% неявок`}
                    </p>
                )}
            </div>
        </section>
    );
}

function HistoryView({
    entries,
    hasMore,
    loadingMore,
    onMore,
    ownership,
}: {
    readonly entries: readonly HistoryEntry[] | undefined;
    readonly hasMore: boolean;
    readonly loadingMore: boolean;
    readonly onMore: () => void;
    readonly ownership: 'SELF' | 'OTHER';
}) {
    if (!entries) {
        return (
            <section className="profile-panel partial-state" aria-labelledby="history-heading">
                <h2 id="history-heading">История матчей</h2>
                <p>Историю не удалось загрузить. Попробуйте ещё раз позже.</p>
            </section>
        );
    }
    const provisional = entries.filter((entry) => ['AWAITING_CONFIRMATION', 'DISPUTED'].includes(entry.state));
    const finalEntries = entries.filter((entry) => !provisional.includes(entry));
    return (
        <section className="profile-panel" aria-labelledby="history-heading">
            <h2 id="history-heading">История матчей</h2>
            {entries.length === 0 ? (
                <p className="empty-state">
                    {ownership === 'SELF'
                        ? 'Подтверждённых и ожидающих матчей пока нет.'
                        : 'Публичных подтверждённых матчей пока нет.'}
                </p>
            ) : (
                <>
                    {provisional.length > 0 && (
                        <div className="provisional-results">
                            <h3>Ещё не вошли в статистику</h3>
                            <HistoryList entries={provisional} />
                        </div>
                    )}
                    <HistoryList entries={finalEntries} />
                </>
            )}
            {hasMore && (
                <button className="secondary-action" type="button" disabled={loadingMore} onClick={onMore}>
                    {loadingMore ? 'Загружаем…' : 'Показать ещё'}
                </button>
            )}
        </section>
    );
}

function HistoryList({ entries }: { readonly entries: readonly HistoryEntry[] }) {
    return (
        <ul className="profile-history">
            {entries.map((entry) => (
                <li key={entry.matchId}>
                    <Link to={`/matches/${entry.matchId}`}>
                        <strong>
                            {formatLabels[entry.format]} · {historyLabels[entry.state]}
                        </strong>
                        <span>{dateTime(entry.confirmedAt ?? entry.startsAt)}</span>
                        {entry.games.length > 0 && (
                            <span>
                                Счёт партий:{' '}
                                {entry.games
                                    .map((game) => `${String(game.teamAPoints)}:${String(game.teamBPoints)}`)
                                    .join(', ')}
                            </span>
                        )}
                    </Link>
                </li>
            ))}
        </ul>
    );
}

interface ProfileFormState {
    readonly displayName: string;
    readonly gameFormats: readonly ('SINGLES' | 'DOUBLES')[];
    readonly localityId: string;
    readonly skillSelfAssessment: OwnProfile['skillSelfAssessment'];
    readonly timeZone: string;
}

function formFrom(profile: OwnProfile): ProfileFormState {
    return {
        displayName: profile.displayName,
        gameFormats: [...profile.gameFormats],
        localityId: profile.locality.id,
        skillSelfAssessment: profile.skillSelfAssessment,
        timeZone: profile.timeZone,
    };
}

function OwnProfileEditor({
    client,
    localities,
    online,
    profile,
    reload,
}: {
    readonly client: IdentityClient;
    readonly localities: readonly Locality[];
    readonly online: boolean;
    readonly profile: OwnProfile;
    readonly reload: () => Promise<void>;
}) {
    const [form, setForm] = useState(() => formFrom(profile));
    const [dupr, setDupr] = useState(profile.externalProfileLink?.url ?? '');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string>();
    const keys = useRef(new Map<string, string>());
    useEffect(() => {
        setForm(formFrom(profile));
        setDupr(profile.externalProfileLink?.url ?? '');
    }, [profile]);
    const keyFor = (action: string) => {
        const existing = keys.current.get(action);
        if (existing) return existing;
        const created = crypto.randomUUID();
        keys.current.set(action, created);
        return created;
    };
    const mutate = async (action: string, work: (key: string) => Promise<unknown>, success: string) => {
        if (!online) {
            setMessage('Для сохранения нужно подключение к интернету. Изменения не отправлены.');
            return;
        }
        setBusy(true);
        setMessage(undefined);
        try {
            await work(keyFor(action));
            keys.current.delete(action);
            await reload();
            setMessage(success);
        } catch (error) {
            setMessage(profileError(error));
            if (error instanceof ApiError && error.response?.error.code === 'PROFILE_VERSION_CONFLICT') await reload();
        } finally {
            setBusy(false);
        }
    };
    async function save(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        const name = form.displayName.trim().normalize('NFC');
        if (name.length < 2 || name.length > 50 || /\p{Cc}/u.test(name)) {
            setMessage('Имя должно содержать от 2 до 50 символов без управляющих знаков.');
            return;
        }
        if (form.gameFormats.length === 0) {
            setMessage('Выберите хотя бы один формат.');
            return;
        }
        await mutate(
            'profile',
            (key) =>
                client.updateOwnPlayerProfile({ ...form, displayName: name, expectedVersion: profile.version }, key),
            'Профиль сохранён.'
        );
    }
    async function upload(file: File | undefined) {
        if (!file) return;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5_242_880) {
            setMessage('Выберите JPEG, PNG или WebP размером не более 5 МиБ.');
            return;
        }
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
        await mutate(
            'avatar',
            async (key) => {
                const policy = await client.createProfileAvatarUpload(
                    {
                        contentLength: file.size,
                        contentType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
                        expectedVersion: profile.version,
                        sha256,
                    },
                    key
                );
                const response = await fetch(policy.uploadUrl, {
                    body: file,
                    headers: {
                        'Content-Type': policy.requiredHeaders.contentType,
                        'X-Content-SHA256': policy.requiredHeaders.sha256,
                    },
                    method: policy.method,
                    referrerPolicy: 'no-referrer',
                });
                if (!response.ok) throw new Error('avatar upload failed');
            },
            'Аватар загружен и проходит проверку. Он появится после безопасной обработки.'
        );
    }
    return (
        <section className="profile-panel" aria-labelledby="edit-profile-heading">
            <h2 id="edit-profile-heading">Изменить профиль</h2>
            <form className="profile-form" onSubmit={(event) => void save(event)}>
                <label>
                    Имя
                    <input
                        value={form.displayName}
                        onChange={(event) => {
                            setForm({ ...form, displayName: event.target.value });
                        }}
                    />
                </label>
                <label>
                    Населённый пункт
                    <select
                        value={form.localityId}
                        onChange={(event) => {
                            setForm({ ...form, localityId: event.target.value });
                        }}
                    >
                        {localities.map((item) => (
                            <option key={item.id} value={item.id}>
                                {item.name}, {item.region}
                            </option>
                        ))}
                    </select>
                </label>
                <fieldset>
                    <legend>Форматы</legend>
                    {(['SINGLES', 'DOUBLES'] as const).map((format) => (
                        <label className="check" key={format}>
                            <input
                                type="checkbox"
                                checked={form.gameFormats.includes(format)}
                                onChange={(event) => {
                                    setForm({
                                        ...form,
                                        gameFormats: event.target.checked
                                            ? [...form.gameFormats, format]
                                            : form.gameFormats.filter((item) => item !== format),
                                    });
                                }}
                            />
                            <span>{formatLabels[format]}</span>
                        </label>
                    ))}
                </fieldset>
                <label>
                    Самооценка уровня — не подтверждённый рейтинг
                    <select
                        value={form.skillSelfAssessment}
                        onChange={(event) => {
                            const level = skillLevels.find((item) => item === Number(event.target.value));
                            if (level !== undefined) setForm({ ...form, skillSelfAssessment: level });
                        }}
                    >
                        {skillLevels.map((level) => (
                            <option key={level} value={level}>
                                {level.toFixed(1)}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Часовой пояс
                    <input
                        value={form.timeZone}
                        onChange={(event) => {
                            setForm({ ...form, timeZone: event.target.value });
                        }}
                    />
                </label>
                <button className="primary-action compact-action" type="submit" disabled={busy || !online}>
                    Сохранить профиль
                </button>
            </form>
            <div className="profile-subsection">
                <h3>Аватар</h3>
                <label>
                    JPEG, PNG или WebP, до 5 МиБ
                    <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={busy || !online}
                        onChange={(event) => void upload(event.target.files?.[0])}
                    />
                </label>
                {profile.avatar && (
                    <button
                        className="danger-action"
                        type="button"
                        disabled={busy || !online}
                        onClick={() =>
                            void mutate(
                                'remove-avatar',
                                (key) => client.removeProfileAvatar(profile.version, key),
                                'Аватар удалён.'
                            )
                        }
                    >
                        Удалить аватар
                    </button>
                )}
            </div>
            <div className="profile-subsection">
                <h3>Внешняя ссылка DUPR</h3>
                <p>Ссылка не подтверждается и не синхронизируется. PickleHub не загружает данные DUPR.</p>
                <label>
                    HTTPS-ссылка
                    <input
                        type="url"
                        value={dupr}
                        onChange={(event) => {
                            setDupr(event.target.value);
                        }}
                    />
                </label>
                <div className="profile-actions">
                    <button
                        className="secondary-action"
                        type="button"
                        disabled={busy || !online || dupr.trim() === ''}
                        onClick={() =>
                            void mutate(
                                'dupr',
                                (key) => client.setDuprProfileLink(dupr.trim(), profile.version, key),
                                'Ссылка сохранена.'
                            )
                        }
                    >
                        Сохранить ссылку
                    </button>
                    {profile.externalProfileLink && (
                        <button
                            className="danger-action"
                            type="button"
                            disabled={busy || !online}
                            onClick={() =>
                                void mutate(
                                    'remove-dupr',
                                    (key) => client.removeDuprProfileLink(profile.version, key),
                                    'Ссылка удалена.'
                                )
                            }
                        >
                            Удалить ссылку
                        </button>
                    )}
                </div>
            </div>
            <div className="profile-subsection">
                <h3>Конфиденциальность</h3>
                <p>
                    {profile.visibility === 'PUBLIC'
                        ? 'Публичный профиль доступен без входа. Блокировка не скрывает его от анонимных посетителей.'
                        : 'Профиль, статистика, история и DUPR скрыты от других игроков.'}
                </p>
                <button
                    className="secondary-action"
                    type="button"
                    disabled={busy || !online}
                    onClick={() =>
                        void mutate(
                            'privacy',
                            (key) =>
                                client.updateProfilePrivacySettings(
                                    {
                                        expectedVersion: profile.version,
                                        visibility: profile.visibility === 'PUBLIC' ? 'PRIVATE' : 'PUBLIC',
                                    },
                                    key
                                ),
                            profile.visibility === 'PUBLIC' ? 'Профиль закрыт.' : 'Профиль открыт.'
                        )
                    }
                >
                    {profile.visibility === 'PUBLIC' ? 'Сделать профиль закрытым' : 'Сделать профиль публичным'}
                </button>
            </div>
            {message && (
                <p className="form-message" role="status">
                    {message}
                </p>
            )}
        </section>
    );
}

export function ProfileScreen({
    client,
    online,
    ownership,
    playerId,
}: {
    readonly client: IdentityClient;
    readonly online: boolean;
    readonly ownership: 'SELF' | 'OTHER';
    readonly playerId?: string | undefined;
}) {
    const [profile, setProfile] = useState<OwnProfile | PublicProfile>();
    const [statistics, setStatistics] = useState<Statistics>();
    const [history, setHistory] = useState<readonly HistoryEntry[]>();
    const [localities, setLocalities] = useState<readonly Locality[]>([]);
    const [cursor, setCursor] = useState<string | null>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string>();
    const trackedViews = useRef(new Set<string>());
    const load = useCallback(async () => {
        if (ownership === 'OTHER' && !playerId) {
            setError('Профиль недоступен.');
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(undefined);
        const requestedPlayerId = playerId ?? '';
        const profileRequest: Promise<OwnProfile | PublicProfile> =
            ownership === 'SELF' ? client.getOwnPlayerProfile() : client.getPublicPlayerProfile(requestedPlayerId);
        const statisticsRequest: Promise<Statistics> =
            ownership === 'SELF'
                ? client.getOwnPlayerStatistics()
                : client.getPublicPlayerStatistics(requestedPlayerId);
        const historyRequest =
            ownership === 'SELF'
                ? client.listOwnMatchHistory()
                : client.listPublicPlayerMatchHistory(requestedPlayerId);
        const localitiesRequest = ownership === 'SELF' ? client.listLocalities() : Promise.resolve(undefined);
        const [profileResult, statisticsResult, historyResult, localitiesResult] = await Promise.allSettled([
            profileRequest,
            statisticsRequest,
            historyRequest,
            localitiesRequest,
        ] as const);
        if (profileResult.status === 'rejected') {
            setProfile(undefined);
            setError(profileError(profileResult.reason));
        } else {
            setProfile(profileResult.value);
        }
        setStatistics(statisticsResult.status === 'fulfilled' ? statisticsResult.value : undefined);
        if (historyResult.status === 'fulfilled') {
            const page = historyResult.value;
            setHistory(page.items);
            setCursor(page.pageInfo.nextCursor);
            setHasMore(page.pageInfo.hasMore);
        } else setHistory(undefined);
        if (ownership === 'SELF' && localitiesResult.status === 'fulfilled' && localitiesResult.value) {
            setLocalities(localitiesResult.value.items);
        }
        setLoading(false);
    }, [client, ownership, playerId]);
    useEffect(() => {
        void load();
    }, [load]);
    useEffect(() => {
        if (!profile) return;
        const trackingKey = `profile:${ownership}:${playerId ?? 'self'}`;
        if (trackedViews.current.has(trackingKey)) return;
        trackedViews.current.add(trackingKey);
        disabledAnalytics.track({
            name: 'profile_viewed',
            entry: 'DIRECT',
            ownership,
            visibility:
                ownership === 'SELF' && 'visibility' in profile && profile.visibility === 'PRIVATE'
                    ? 'PRIVATE_SELF'
                    : 'PUBLIC',
        });
    }, [ownership, playerId, profile]);
    useEffect(() => {
        if (!history) return;
        const trackingKey = `history:${ownership}:${playerId ?? 'self'}`;
        if (trackedViews.current.has(trackingKey)) return;
        trackedViews.current.add(trackingKey);
        disabledAnalytics.track({
            name: 'match_history_opened',
            ownership,
            resultBucket: resultBucket(history.length),
        });
    }, [history, ownership, playerId]);
    useEffect(() => {
        if (!statistics) return;
        const trackingKey = `statistics:${ownership}:${playerId ?? 'self'}`;
        if (trackedViews.current.has(trackingKey)) return;
        trackedViews.current.add(trackingKey);
        const played = statistics.totals.find((item) => item.slice === 'ALL')?.played ?? 0;
        disabledAnalytics.track({
            name: 'statistics_viewed',
            format: 'ALL',
            ownership,
            state: statistics.state === 'UPDATING' ? 'UPDATING' : played === 0 ? 'EMPTY' : 'AVAILABLE',
        });
    }, [ownership, playerId, statistics]);
    const avatarUrl = useMemo(
        () => (profile ? ('avatar' in profile ? (profile.avatar?.url ?? null) : profile.avatarUrl) : null),
        [profile]
    );
    async function more() {
        if (!cursor) return;
        setLoadingMore(true);
        try {
            const page =
                ownership === 'SELF'
                    ? await client.listOwnMatchHistory(cursor)
                    : await client.listPublicPlayerMatchHistory(playerId ?? '', cursor);
            setHistory((current) => [...(current ?? []), ...page.items]);
            setCursor(page.pageInfo.nextCursor);
            setHasMore(page.pageInfo.hasMore);
        } catch (reason) {
            setError(profileError(reason));
        } finally {
            setLoadingMore(false);
        }
    }
    if (loading)
        return (
            <main className="profiles-main" aria-busy="true">
                <section className="profile-skeleton" aria-label="Загружаем профиль">
                    <span />
                    <span />
                    <span />
                </section>
            </main>
        );
    if (!profile)
        return (
            <main className="profiles-main">
                <section className="state-card centered">
                    <h1>Профиль недоступен</h1>
                    <p>{error}</p>
                    <button className="primary-action" type="button" onClick={() => void load()}>
                        Повторить
                    </button>
                </section>
            </main>
        );
    return (
        <main className="profiles-main">
            {!online && (
                <p className="projection-notice" role="status">
                    Нет сети. Показаны только данные уже открытого экрана; изменения отключены.
                </p>
            )}
            {error && (
                <p className="form-message" role="alert">
                    {error}
                </p>
            )}
            <header className="profile-hero">
                <Avatar name={profile.displayName} url={avatarUrl} />
                <div>
                    <p className="eyebrow">{ownership === 'SELF' ? 'Мой профиль' : 'Игрок'}</p>
                    <h1>{profile.displayName}</h1>
                    <p>
                        {profile.locality.name}, {profile.locality.region}
                    </p>
                    <p>{profile.gameFormats.map((item) => formatLabels[item]).join(' · ')}</p>
                    <strong>Самооценка {profile.skillSelfAssessment.toFixed(1)} · не подтверждённый рейтинг</strong>
                </div>
            </header>
            {ownership === 'SELF' && 'avatar' in profile && (
                <OwnProfileEditor
                    client={client}
                    localities={localities.length > 0 ? localities : [profile.locality]}
                    online={online}
                    profile={profile}
                    reload={load}
                />
            )}
            <ExternalLink link={profile.externalProfileLink} ownership={ownership} />
            <StatisticsView statistics={statistics} />
            <HistoryView
                entries={history}
                hasMore={hasMore}
                loadingMore={loadingMore}
                onMore={() => void more()}
                ownership={ownership}
            />
        </main>
    );
}
