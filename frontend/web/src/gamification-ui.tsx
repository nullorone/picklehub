import { ApiError, type components, type createIdentityClient } from '@picklehub/api-client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

type Client = ReturnType<typeof createIdentityClient>;
type Progress = components['schemas']['GamificationProgress'];
type Achievement = components['schemas']['AchievementAward'];
type LedgerEntry = components['schemas']['XpLedgerEntry'];
type Configuration = components['schemas']['ClubGamificationConfiguration'];
type Template = components['schemas']['ClubXpTemplate'];
type LevelInput = components['schemas']['ClubLevelInput'];
type Source = components['schemas']['XpSourceKind'];

const sourceCopy: Record<Source, { readonly title: string; readonly reason: string }> = {
    CONFIRMED_PLAY: {
        title: 'Подтверждённая игра',
        reason: 'За участие после подтверждения факта игры — независимо от победы и счёта.',
    },
    CONFIRMED_MATCH_ORGANIZED: {
        title: 'Организация матча',
        reason: 'За обычный матч, который действительно состоялся и был подтверждён.',
    },
    ELIGIBLE_STRUCTURED_REVIEW: {
        title: 'Полезный отзыв',
        reason: 'За допустимый структурированный отзыв, а не за его оценку или текст.',
    },
};

const globalTemplates: readonly Template[] = [
    {
        sourceKind: 'CONFIRMED_PLAY',
        enabled: true,
        coefficientTenths: 10,
        baseXp: 100,
        dailyEventCap: 3,
        weeklyEventCap: 10,
    },
    {
        sourceKind: 'CONFIRMED_MATCH_ORGANIZED',
        enabled: true,
        coefficientTenths: 10,
        baseXp: 40,
        dailyEventCap: 3,
        weeklyEventCap: 10,
    },
    {
        sourceKind: 'ELIGIBLE_STRUCTURED_REVIEW',
        enabled: true,
        coefficientTenths: 10,
        baseXp: 15,
        dailyEventCap: 3,
        weeklyEventCap: 10,
    },
];

function message(error: unknown): { readonly stale: boolean; readonly text: string } {
    if (!(error instanceof ApiError)) return { stale: false, text: 'Не удалось выполнить запрос.' };
    const code = error.response?.error.code;
    if (code === 'REVISION_CONFLICT') {
        return { stale: true, text: 'Настройки уже изменились. Загрузите свежую версию и повторите действие.' };
    }
    if (code === 'SEASON_CLOSED') return { stale: false, text: 'Сезон закрыт: новое согласие включить нельзя.' };
    if (error.status === 403) return { stale: false, text: 'У вас нет разрешения на это действие.' };
    return { stale: false, text: error.response?.error.message ?? 'Не удалось выполнить запрос.' };
}

function State({ text, retry }: { readonly text: string; readonly retry?: (() => void) | undefined }) {
    return (
        <div className="state-card" role="status">
            <p>{text}</p>
            {retry && <button onClick={retry}>Повторить</button>}
        </div>
    );
}

function date(value: string): string {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function ScopeNotice() {
    return (
        <aside className="gamification-boundary" aria-labelledby="progress-boundary-title">
            <h2 id="progress-boundary-title">Это прогресс активности, не уровень игры</h2>
            <p>
                XP отмечает подтверждённое участие и полезный вклад. Он не является рейтингом мастерства, не меняет
                спортивную статистику или DUPR и не начисляется за победу.
            </p>
        </aside>
    );
}

function ProgressCard({ progress }: { readonly progress: Progress }) {
    const start = progress.currentLevel.thresholdXp;
    const maximum = progress.nextLevel ? progress.nextLevel.thresholdXp - start : 1;
    const value = progress.nextLevel ? Math.max(0, progress.lifetimeNetXp - start) : 1;
    return (
        <section className="progress-card" aria-labelledby="level-title">
            <p className="eyebrow">Уровень {progress.currentLevel.ordinal}</p>
            <h2 id="level-title">{progress.currentLevel.name}</h2>
            <p className="xp-total">{progress.lifetimeNetXp} XP за всё время</p>
            <progress aria-label="Прогресс до следующего уровня" max={maximum} value={value} />
            <p>
                {progress.nextLevel && progress.xpToNextLevel !== null
                    ? `Ещё ${String(progress.xpToNextLevel)} XP до уровня «${progress.nextLevel.name}».`
                    : 'Достигнут последний доступный уровень.'}
            </p>
            {progress.state === 'FROZEN' && (
                <p className="status-note" role="status">
                    ⏸ Клубный прогресс заморожен: прошлый XP сохранён, новые клубные начисления не создаются.
                </p>
            )}
        </section>
    );
}

function SourceList({ templates }: { readonly templates: readonly Template[] }) {
    return (
        <section aria-labelledby="xp-reasons-title">
            <h2 id="xp-reasons-title">За что начисляется XP</h2>
            <ul className="xp-source-list">
                {templates.map((item) => {
                    const xp = Math.floor((item.baseXp * item.coefficientTenths) / 10);
                    return (
                        <li key={item.sourceKind}>
                            <strong>{sourceCopy[item.sourceKind].title}</strong>
                            <span>{item.enabled ? `${String(xp)} XP` : 'Выключено'}</span>
                            <p>{sourceCopy[item.sourceKind].reason}</p>
                            <small>
                                Лимит: {item.dailyEventCap} в сутки, {item.weeklyEventCap} в неделю (UTC).
                            </small>
                        </li>
                    );
                })}
            </ul>
            <p className="compensation-note">
                ↩ Если подтверждённое событие отменено, история не переписывается: отдельная компенсирующая запись
                снимает ровно ранее начисленный XP и объясняет отмену. При восстановлении добавляется новая запись.
            </p>
        </section>
    );
}

function AchievementHistory({ items }: { readonly items: readonly Achievement[] }) {
    return (
        <section aria-labelledby="achievement-title">
            <h2 id="achievement-title">История достижений</h2>
            {items.length === 0 ? (
                <State text="Достижений пока нет. Подтверждённые игры и полезный вклад появятся здесь." />
            ) : (
                <ol className="achievement-list">
                    {items.map((award) => (
                        <li key={award.id}>
                            <div>
                                <strong>{award.definition.title}</strong>
                                <span className="achievement-state">
                                    {award.state === 'EARNED'
                                        ? '✓ Получено'
                                        : award.state === 'REINSTATED'
                                          ? '↻ Восстановлено'
                                          : '↩ Отозвано'}
                                </span>
                            </div>
                            <p>{award.definition.description}</p>
                            <small>
                                {sourceCopy[award.definition.sourceKind].title} · {date(award.changedAt)} · прогресс{' '}
                                {award.qualifyingCount}/{award.definition.thresholdCount}
                            </small>
                            {award.state === 'REVOKED' && (
                                <p className="compensation-note">
                                    Исходное подтверждённое событие отменено. Связанный XP скорректирован отдельной
                                    компенсирующей записью; спортивная статистика обрабатывается независимо.
                                </p>
                            )}
                        </li>
                    ))}
                </ol>
            )}
        </section>
    );
}

function XpHistory({ items }: { readonly items: readonly LedgerEntry[] }) {
    return (
        <section aria-labelledby="xp-history-title">
            <h2 id="xp-history-title">История начислений XP</h2>
            {items.length === 0 ? (
                <State text="Начислений пока нет. Здесь появятся только подтверждённые события." />
            ) : (
                <ol className="achievement-list xp-history-list">
                    {items.map((entry) => {
                        const sign = entry.kind === 'REVERSAL' ? '−' : '+';
                        const state =
                            entry.status === 'CAPPED'
                                ? 'Не начислено: достигнут лимит'
                                : entry.status === 'PENDING'
                                  ? 'Ожидает проверки'
                                  : entry.kind === 'REVERSAL'
                                    ? '↩ Начисление отменено'
                                    : entry.kind === 'REINSTATEMENT'
                                      ? '↻ Начисление восстановлено'
                                      : '✓ Начислено';
                        return (
                            <li key={entry.id}>
                                <div>
                                    <strong>{sourceCopy[entry.sourceKind].title}</strong>
                                    <span>
                                        {entry.status === 'CAPPED' ? '0 XP' : `${sign}${String(entry.amount)} XP`}
                                    </span>
                                </div>
                                <p>{sourceCopy[entry.sourceKind].reason}</p>
                                <small>
                                    {state} · событие {date(entry.occurredAt)} · правила {entry.ruleVersion}
                                </small>
                                {entry.kind === 'REVERSAL' && (
                                    <p className="compensation-note">
                                        Исходное подтверждение отменено. Эта отдельная запись снимает только ранее
                                        начисленный XP; исходная строка истории сохранена.
                                    </p>
                                )}
                            </li>
                        );
                    })}
                </ol>
            )}
        </section>
    );
}

export function ProgressScreen({ client, clubId }: { readonly client: Client; readonly clubId?: string }) {
    const [progress, setProgress] = useState<Progress>();
    const [achievements, setAchievements] = useState<readonly Achievement[]>([]);
    const [history, setHistory] = useState<readonly LedgerEntry[]>([]);
    const [templates, setTemplates] = useState<readonly Template[]>(globalTemplates);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [nextProgress, awards, ledger] = await Promise.all([
                clubId ? client.getClubGamificationProgress(clubId) : client.getOwnGlobalProgress(),
                client.listOwnAchievements(undefined, 100),
                client.listOwnXpHistory(undefined, 100),
            ]);
            setProgress(nextProgress);
            setAchievements(
                awards.items.filter((award) =>
                    clubId
                        ? award.scope.kind === 'CLUB' && award.scope.clubId === clubId
                        : award.scope.kind === 'GLOBAL'
                )
            );
            setHistory(
                ledger.items.filter((entry) =>
                    clubId
                        ? entry.scope.kind === 'CLUB' && entry.scope.clubId === clubId
                        : entry.scope.kind === 'GLOBAL'
                )
            );
            if (clubId) {
                try {
                    setTemplates((await client.getClubGamificationConfiguration(clubId)).templates);
                } catch (reason) {
                    if (!(reason instanceof ApiError && reason.status === 403)) throw reason;
                }
            }
        } catch (reason) {
            setError(message(reason).text);
        } finally {
            setLoading(false);
        }
    }, [client, clubId]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);
    if (loading)
        return (
            <main className="shell-main">
                <State text="Загружаем прогресс…" />
            </main>
        );
    if (!progress)
        return (
            <main className="shell-main">
                <State text={error || 'Прогресс пока недоступен.'} retry={() => void load()} />
            </main>
        );
    return (
        <main className="shell-main gamification-screen">
            {clubId && <Link to={`/clubs/${clubId}`}>← Вернуться в клуб</Link>}
            <div className="section-heading">
                <div>
                    <p className="eyebrow">{clubId ? 'Прогресс в клубе' : 'PickleHub'}</p>
                    <h1>{clubId ? 'Клубный прогресс' : 'Мой прогресс'}</h1>
                </div>
                {clubId && (
                    <Link className="secondary-action" to={`/clubs/${clubId}/progress/settings`}>
                        Настройки клуба
                    </Link>
                )}
            </div>
            <ScopeNotice />
            <ProgressCard progress={progress} />
            <SourceList templates={templates} />
            <XpHistory items={history} />
            <AchievementHistory items={achievements} />
        </main>
    );
}

export function ClubProgressRoute({ client }: { readonly client: Client }) {
    const { clubId = '' } = useParams();
    return <ProgressScreen client={client} clubId={clubId} />;
}

export function LeaderboardScreen({ client, online }: { readonly client: Client; readonly online: boolean }) {
    const { seasonId = '' } = useParams();
    const [page, setPage] = useState<components['schemas']['LeaderboardPage']>();
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const load = useCallback(async () => {
        setError('');
        try {
            setPage(await client.getSeasonLeaderboard(seasonId));
        } catch (reason) {
            setError(message(reason).text);
        }
    }, [client, seasonId]);
    useEffect(() => void load(), [load]);
    async function consent(optedIn: boolean) {
        if (!online || !page) return;
        setSaving(true);
        setError('');
        try {
            await client.setLeaderboardConsent(seasonId, {
                optedIn,
                policyVersion: page.viewerConsent?.policyVersion ?? '1.0.0',
                expectedRevision: page.viewerConsent?.revision ?? 0,
            });
            await load();
        } catch (reason) {
            setError(message(reason).text);
        } finally {
            setSaving(false);
        }
    }
    if (!page)
        return (
            <main className="shell-main">
                <State text={error || 'Загружаем таблицу…'} retry={error ? () => void load() : undefined} />
            </main>
        );
    const optedIn = page.viewerConsent?.optedIn === true;
    return (
        <main className="shell-main gamification-screen leaderboard-screen">
            <Link to="/progress">← Мой прогресс</Link>
            <header>
                <p className="eyebrow">Сезонная таблица</p>
                <h1>{page.season.name}</h1>
                <p>
                    {date(page.season.startsAt)} — {date(page.season.endsAt)} ·{' '}
                    {page.season.state === 'ACTIVE'
                        ? 'идёт сейчас'
                        : page.season.state === 'CLOSED'
                          ? 'завершён'
                          : 'ещё не начался'}{' '}
                    · правила {page.season.ruleVersion}
                </p>
            </header>
            <ScopeNotice />
            <section className="consent-card" aria-labelledby="leaderboard-privacy-title">
                <h2 id="leaderboard-privacy-title">Участие и приватность</h2>
                <p>
                    Участие выключено по умолчанию и не связано с условиями сервиса или аналитикой. В таблицу попадают
                    только игроки с отдельным согласием на этот сезон. Согласие можно отозвать — строка исчезнет, а XP
                    сохранится.
                </p>
                <p role="status">{optedIn ? '✓ Вы участвуете в этом сезоне.' : '○ Вы не участвуете в этом сезоне.'}</p>
                <button
                    className={optedIn ? 'secondary-action' : 'primary-action'}
                    disabled={!online || saving || (page.season.state === 'CLOSED' && !optedIn)}
                    onClick={() => void consent(!optedIn)}
                >
                    {saving ? 'Сохраняем…' : optedIn ? 'Отозвать согласие' : 'Дать согласие и участвовать'}
                </button>
                {!online && <small>Для изменения согласия требуется интернет.</small>}
            </section>
            {error && <State text={error} retry={() => void load()} />}
            <section aria-labelledby="leaderboard-title">
                <h2 id="leaderboard-title">Участники</h2>
                {page.items.length === 0 ? (
                    <State text="В таблице пока нет участников с согласием." />
                ) : (
                    <ol className="leaderboard-list">
                        {page.items.map((entry, index) => (
                            <li key={entry.userId ?? ['hidden', entry.rank, index].join('-')}>
                                <strong>Место {entry.rank}</strong>
                                <span>
                                    {entry.visibility === 'HIDDEN_BY_BLOCK'
                                        ? 'Скрытый игрок (блокировка)'
                                        : entry.displayName}
                                </span>
                                <span>{entry.levelName}</span>
                                <span>{entry.seasonalNetXp} XP за сезон</span>
                            </li>
                        ))}
                    </ol>
                )}
            </section>
        </main>
    );
}

function localFutureDate(): string {
    const value = new Date(Date.now() + 60 * 60 * 1000);
    value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
    return value.toISOString().slice(0, 16);
}

export function ClubGamificationSettings({ client, online }: { readonly client: Client; readonly online: boolean }) {
    const { clubId = '' } = useParams();
    const [configuration, setConfiguration] = useState<Configuration>();
    const [templates, setTemplates] = useState<readonly Template[]>([]);
    const [levels, setLevels] = useState<readonly LevelInput[]>([]);
    const [minimumEffectiveFrom] = useState(localFutureDate);
    const [effectiveFrom, setEffectiveFrom] = useState(minimumEffectiveFrom);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [stale, setStale] = useState(false);
    const load = useCallback(async () => {
        try {
            const value = await client.getClubGamificationConfiguration(clubId);
            setError('');
            setStale(false);
            setConfiguration(value);
            setTemplates(value.templates);
            setLevels(value.levels.map(({ ordinal, name, thresholdXp }) => ({ ordinal, name, thresholdXp })));
        } catch (reason) {
            setError(message(reason).text);
        }
    }, [client, clubId]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);
    const validation = useMemo(() => {
        if (levels.length < 1 || levels.length > 20) return 'Нужно от 1 до 20 уровней.';
        if (
            levels.some(
                (level, index) => level.ordinal !== index + 1 || !level.name.trim() || level.name.trim().length > 30
            )
        )
            return 'Уровни должны идти по порядку; название — от 1 до 30 символов.';
        if (levels.some((level, index) => index > 0 && level.thresholdXp <= (levels[index - 1]?.thresholdXp ?? -1)))
            return 'Пороги XP должны строго возрастать.';
        if (new Date(effectiveFrom) < new Date(minimumEffectiveFrom))
            return 'Версия должна начать действовать в будущем.';
        return '';
    }, [effectiveFrom, levels, minimumEffectiveFrom]);
    async function save() {
        if (!online || !configuration || validation) return;
        setError('');
        setNotice('');
        setStale(false);
        try {
            const next = await client.updateClubGamificationConfiguration(clubId, {
                expectedVersion: configuration.version,
                effectiveFrom: new Date(effectiveFrom).toISOString(),
                templates,
                levels: levels.map((level) => ({ ...level, name: level.name.trim() })),
            });
            setConfiguration(next);
            setNotice(`Версия ${next.definitionVersion} опубликована.`);
        } catch (reason) {
            const result = message(reason);
            setError(result.text);
            setStale(result.stale);
        }
    }
    if (!configuration)
        return (
            <main className="shell-main">
                <State text={error || 'Загружаем настройки…'} retry={error ? () => void load() : undefined} />
            </main>
        );
    return (
        <main className="shell-main gamification-screen settings-screen">
            <Link to={`/clubs/${clubId}/progress`}>← Клубный прогресс</Link>
            <header>
                <p className="eyebrow">Администратор клуба</p>
                <h1>Настройки прогресса</h1>
                <p>
                    Текущая версия {configuration.definitionVersion}. Изменения создают новую версию и не пересчитывают
                    прошлые начисления.
                </p>
            </header>
            <ScopeNotice />
            <section>
                <h2>Шаблоны начислений</h2>
                <p>
                    Базовый XP и лимиты задаёт PickleHub. Клуб может только выключить источник или выбрать коэффициент
                    0,5–2,0.
                </p>
                <ul className="template-editor">
                    {templates.map((template, index) => (
                        <li key={template.sourceKind}>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={template.enabled}
                                    onChange={(event) => {
                                        setTemplates(
                                            templates.map((item, itemIndex) =>
                                                itemIndex === index ? { ...item, enabled: event.target.checked } : item
                                            )
                                        );
                                    }}
                                />{' '}
                                {sourceCopy[template.sourceKind].title}
                            </label>
                            <label>
                                Коэффициент{' '}
                                <select
                                    aria-label={`Коэффициент: ${sourceCopy[template.sourceKind].title}`}
                                    value={template.coefficientTenths}
                                    onChange={(event) => {
                                        setTemplates(
                                            templates.map((item, itemIndex) =>
                                                itemIndex === index
                                                    ? { ...item, coefficientTenths: Number(event.target.value) }
                                                    : item
                                            )
                                        );
                                    }}
                                >
                                    {Array.from({ length: 16 }, (_, option) => option + 5).map((value) => (
                                        <option key={value} value={value}>
                                            {(value / 10).toFixed(1).replace('.', ',')}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <p>
                                <strong>Предпросмотр:</strong>{' '}
                                {template.enabled
                                    ? `${String(Math.floor((template.baseXp * template.coefficientTenths) / 10))} XP за событие`
                                    : 'новые события этого типа не начисляют клубный XP'}
                                ; максимум {template.dailyEventCap}/сутки и {template.weeklyEventCap}/неделю.
                            </p>
                        </li>
                    ))}
                </ul>
            </section>
            <section>
                <div className="section-heading">
                    <h2>Названия уровней</h2>
                    <button
                        disabled={levels.length >= 20}
                        onClick={() => {
                            setLevels([
                                ...levels,
                                {
                                    ordinal: levels.length + 1,
                                    name: `Уровень ${String(levels.length + 1)}`,
                                    thresholdXp: (levels.at(-1)?.thresholdXp ?? 0) + 100,
                                },
                            ]);
                        }}
                    >
                        Добавить уровень
                    </button>
                </div>
                <ol className="level-editor">
                    {levels.map((level, index) => (
                        <li key={level.ordinal}>
                            <label>
                                Название{' '}
                                <input
                                    maxLength={30}
                                    value={level.name}
                                    onChange={(event) => {
                                        setLevels(
                                            levels.map((item, itemIndex) =>
                                                itemIndex === index ? { ...item, name: event.target.value } : item
                                            )
                                        );
                                    }}
                                />
                            </label>
                            <label>
                                Порог XP{' '}
                                <input
                                    type="number"
                                    min={0}
                                    value={level.thresholdXp}
                                    onChange={(event) => {
                                        setLevels(
                                            levels.map((item, itemIndex) =>
                                                itemIndex === index
                                                    ? { ...item, thresholdXp: Number(event.target.value) }
                                                    : item
                                            )
                                        );
                                    }}
                                />
                            </label>
                            {levels.length > 1 && (
                                <button
                                    aria-label={`Удалить уровень ${String(level.ordinal)}`}
                                    onClick={() => {
                                        setLevels(
                                            levels
                                                .filter((_, itemIndex) => itemIndex !== index)
                                                .map((item, itemIndex) => ({ ...item, ordinal: itemIndex + 1 }))
                                        );
                                    }}
                                >
                                    Удалить
                                </button>
                            )}
                        </li>
                    ))}
                </ol>
            </section>
            <section className="version-preview" aria-labelledby="version-preview-title">
                <h2 id="version-preview-title">Предпросмотр версии {configuration.version + 1}.0.0</h2>
                <label>
                    Начать применять{' '}
                    <input
                        type="datetime-local"
                        min={minimumEffectiveFrom}
                        value={effectiveFrom}
                        onChange={(event) => {
                            setEffectiveFrom(event.target.value);
                        }}
                    />
                </label>
                <p>
                    Только события после указанного времени получат новые коэффициенты и названия уровней. Глобальный XP
                    и другие клубы не изменятся.
                </p>
                {validation && (
                    <p className="field-error" role="alert">
                        {validation}
                    </p>
                )}
                <button
                    className="primary-action"
                    disabled={!online || Boolean(validation)}
                    onClick={() => void save()}
                >
                    Опубликовать новую версию
                </button>
                {!online && <small>Публикация требует подключения к интернету.</small>}
            </section>
            {notice && (
                <div className="success-card" role="status">
                    ✓ {notice}
                </div>
            )}
            {error && <State text={error} retry={stale ? () => void load() : undefined} />}
        </main>
    );
}
