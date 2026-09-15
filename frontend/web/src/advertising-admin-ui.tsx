import { ApiError, type components } from '@picklehub/api-client';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { AdminClient } from './admin-client';

type Campaign = components['schemas']['AdCampaign'];
type Placement = components['schemas']['AdPlacement'];
type Session = components['schemas']['AdminSessionContext'];

function value(data: FormData, name: string): string {
    const result = data.get(name);
    return typeof result === 'string' ? result.trim() : '';
}

function number(data: FormData, name: string): number {
    return Number(value(data, name));
}

function iso(data: FormData, name: string): string {
    return new Date(value(data, name)).toISOString();
}

function local(date = new Date()): string {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function message(error: unknown): string {
    if (!(error instanceof ApiError))
        return error instanceof Error ? `Проверьте поля формы: ${error.message}` : 'Операция не подтверждена сервером.';
    const code = error.response?.error.code;
    if (code === 'REVISION_CONFLICT') return 'Кампания уже изменена. Обновите данные.';
    if (code === 'CONFLICT_OF_INTEREST') return 'Автор ревизии не может сам её одобрить.';
    if (code === 'TARGETING_REJECTED') return 'Таргетинг выходит за разрешённый закрытый список.';
    if (code === 'LEGAL_EVIDENCE_REQUIRED') return 'Не хватает обязательного legal evidence.';
    return 'Операция не подтверждена сервером.';
}

function has(session: Session, capability: components['schemas']['AdminCapability']): boolean {
    return session.capabilities.includes(capability);
}

function CampaignFields({ placements }: { readonly placements: readonly Placement[] }) {
    const [defaults] = useState(() => ({
        ends: new Date(Date.now() + 8 * 86_400_000),
        starts: new Date(Date.now() + 3_600_000),
    }));
    return (
        <div className="admin-form-grid">
            <label>
                Рекламодатель
                <input name="advertiserName" maxLength={200} required />
            </label>
            <label>
                Юридический ID
                <input name="advertiserLegalId" maxLength={200} required />
            </label>
            <label>
                Начало
                <input defaultValue={local(defaults.starts)} name="startsAt" type="datetime-local" required />
            </label>
            <label>
                Окончание
                <input defaultValue={local(defaults.ends)} name="endsAt" type="datetime-local" required />
            </label>
            <label>
                Часовой пояс
                <input defaultValue="Europe/Moscow" name="timezone" required />
            </label>
            <label>
                Валюта
                <input defaultValue="RUB" name="currency" pattern="[A-Z]{3}" required />
            </label>
            <label>
                Бюджет, мин. единицы
                <input defaultValue="100000" min="1" name="budgetMinor" type="number" required />
            </label>
            <label>
                Модель
                <select defaultValue="CPM" name="billingModel">
                    <option value="CPM">CPM</option>
                    <option value="CPC">CPC</option>
                    <option value="FIXED_SPONSORSHIP">Фиксированная</option>
                </select>
            </label>
            <label>
                Ставка, мин. единицы
                <input defaultValue="1000" min="0" name="rateMinor" type="number" required />
            </label>
            <label>
                Приоритет
                <select defaultValue="STANDARD_DIRECT" name="priorityTier">
                    <option value="STANDARD_DIRECT">Стандартный direct</option>
                    <option value="GUARANTEED_DIRECT">Гарантированный direct</option>
                    <option value="HOUSE_EMERGENCY">House emergency</option>
                </select>
            </label>
            <label>
                Лимит за 24 часа
                <input defaultValue="3" max="3" min="1" name="cap24Hours" type="number" required />
            </label>
            <label>
                Лимит за 7 дней
                <input defaultValue="10" max="10" min="1" name="cap7Days" type="number" required />
            </label>
            <label>
                Placement
                <select name="placementId" required>
                    <option value="">Выберите</option>
                    {placements.map((placement) => (
                        <option key={placement.id} value={placement.id}>
                            {placement.code} · {placement.surface}
                        </option>
                    ))}
                </select>
            </label>
            <label>
                Измерение таргетинга
                <select defaultValue="SURFACE" name="targetDimension">
                    {[
                        'SURFACE',
                        'CLIENT_KIND',
                        'LOCALE',
                        'FORM_FACTOR',
                        'OBJECT_CLASS',
                        'CONTENT_CATEGORY',
                        'COUNTRY',
                        'REGION',
                        'CITY',
                        'CONNECTIVITY',
                    ].map((item) => (
                        <option key={item}>{item}</option>
                    ))}
                </select>
            </label>
            <label>
                Разрешённый код значения
                <input name="targetValue" pattern="[A-Z0-9]+(?:_[A-Z0-9]+)*" required />
            </label>
            <label>
                Маркировка
                <input name="registrationToken" placeholder="Токен или пусто после legal review" />
            </label>
            <label>
                Раскрытие
                <input name="disclosure" maxLength={500} />
            </label>
            <label>
                Версия рекламной политики
                <input defaultValue="1.0.0" name="policyVersion" pattern="[1-9][0-9]*\.[0-9]+\.[0-9]+" required />
            </label>
        </div>
    );
}

function campaignInput(data: FormData): components['schemas']['AdCampaignInput'] {
    const placementId = value(data, 'placementId');
    if (!placementId) throw new Error('Выберите рекламное место');
    return {
        advertiserLegalId: value(data, 'advertiserLegalId'),
        advertiserName: value(data, 'advertiserName'),
        billingModel: value(data, 'billingModel') as components['schemas']['AdBillingModel'],
        budgetMinor: number(data, 'budgetMinor'),
        cap24Hours: number(data, 'cap24Hours'),
        cap7Days: number(data, 'cap7Days'),
        currency: value(data, 'currency'),
        endsAt: iso(data, 'endsAt'),
        legalLabel: {
            advertiserName: value(data, 'advertiserName'),
            disclosure: value(data, 'disclosure') || null,
            label: 'Реклама',
            registrationToken: value(data, 'registrationToken') || null,
        },
        placementIds: [placementId],
        policyVersion: value(data, 'policyVersion'),
        priorityTier: value(data, 'priorityTier') as components['schemas']['AdPriorityTier'],
        rateMinor: number(data, 'rateMinor'),
        startsAt: iso(data, 'startsAt'),
        targetRules: [
            {
                dimension: value(data, 'targetDimension') as components['schemas']['AdTargetDimension'],
                operator: 'INCLUDE',
                values: [value(data, 'targetValue')],
            },
        ],
        timezone: value(data, 'timezone'),
    };
}

export function AdvertisingDashboard({
    client,
    online,
    session,
}: {
    readonly client: AdminClient;
    readonly online: boolean;
    readonly session: Session;
}) {
    const [campaigns, setCampaigns] = useState<readonly Campaign[]>([]);
    const [placements, setPlacements] = useState<readonly Placement[]>([]);
    const [report, setReport] = useState<components['schemas']['AdReport']>();
    const [reportRange] = useState(() => ({
        from: local(new Date(Date.now() - 7 * 86_400_000)),
        until: local(),
    }));
    const [status, setStatus] = useState<string>();
    const load = useCallback(async () => {
        try {
            const [campaignPage, placementPage] = await Promise.all([
                has(session, 'AD_CAMPAIGN_MANAGE') ? client.listAdCampaigns() : Promise.resolve({ items: [] }),
                has(session, 'AD_PLACEMENT_MANAGE') ? client.listAdPlacements() : Promise.resolve({ items: [] }),
            ]);
            setCampaigns(campaignPage.items);
            setPlacements(placementPage.items);
        } catch (error) {
            setStatus(message(error));
        }
    }, [client, session]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    async function run(operation: () => Promise<unknown>) {
        setStatus(undefined);
        try {
            await operation();
            await load();
            setStatus('Изменение подтверждено сервером.');
        } catch (error) {
            setStatus(message(error));
        }
    }

    return (
        <main data-ad-critical="true">
            <div className="admin-title">
                <div>
                    <p className="eyebrow">Контекст без профилирования</p>
                    <h1>Рекламный инвентарь</h1>
                </div>
            </div>
            <p className="field-help">
                Только закрытые контекстные коды и география не точнее города. Свободный текст, координаты и
                пользовательская история не отправляются в delivery.
            </p>
            {status && (
                <p className="form-message" role="status">
                    {status}
                </p>
            )}

            {has(session, 'AD_PLACEMENT_MANAGE') && (
                <section className="admin-panel" aria-labelledby="placements-title">
                    <h2 id="placements-title">Места</h2>
                    <ul className="result-list">
                        {placements.map((placement) => (
                            <li key={placement.id}>
                                <strong>{placement.code}</strong> · {placement.surface} · {placement.format} ·{' '}
                                {placement.enabled ? 'включено' : 'выключено'} · {placement.minimumWidth}×
                                {placement.minimumHeight}{' '}
                                <button
                                    className="secondary-action"
                                    disabled={!online}
                                    onClick={() =>
                                        void run(() =>
                                            client.updateAdPlacement(placement.id, {
                                                code: placement.code,
                                                enabled: !placement.enabled,
                                                expectedVersion: placement.version,
                                                fallbackEnabled: placement.fallbackEnabled,
                                                format: placement.format,
                                                minimumHeight: placement.minimumHeight,
                                                minimumWidth: placement.minimumWidth,
                                                surface: placement.surface,
                                            })
                                        )
                                    }
                                    type="button"
                                >
                                    {placement.enabled ? 'Выключить' : 'Включить'}
                                </button>
                            </li>
                        ))}
                    </ul>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            void run(() =>
                                client.createAdPlacement({
                                    code: value(data, 'code'),
                                    enabled: data.has('enabled'),
                                    expectedVersion: 0,
                                    fallbackEnabled: false,
                                    format: value(data, 'format') as components['schemas']['AdCreativeFormat'],
                                    minimumHeight: number(data, 'minimumHeight'),
                                    minimumWidth: number(data, 'minimumWidth'),
                                    surface: value(data, 'surface'),
                                })
                            );
                        }}
                    >
                        <h3>Новое фиксированное место</h3>
                        <div className="admin-form-grid">
                            <label>
                                Код
                                <input name="code" pattern="[A-Z0-9]+(?:_[A-Z0-9]+)*" required />
                            </label>
                            <label>
                                Поверхность
                                <input name="surface" pattern="[A-Z0-9]+(?:_[A-Z0-9]+)*" required />
                            </label>
                            <label>
                                Формат
                                <select name="format">
                                    <option>STATIC_IMAGE</option>
                                    <option>TEXT_IMAGE_CARD</option>
                                </select>
                            </label>
                            <label>
                                Ширина
                                <input defaultValue="320" min="1" name="minimumWidth" type="number" required />
                            </label>
                            <label>
                                Высота
                                <input defaultValue="100" min="1" name="minimumHeight" type="number" required />
                            </label>
                            <label className="check">
                                <input name="enabled" type="checkbox" />
                                Включить direct
                            </label>
                        </div>
                        <button className="primary-action" disabled={!online} type="submit">
                            Создать место
                        </button>
                    </form>
                </section>
            )}

            {has(session, 'AD_CAMPAIGN_MANAGE') && (
                <section className="admin-panel" aria-labelledby="campaigns-title">
                    <h2 id="campaigns-title">Кампании</h2>
                    <div className="admin-table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Кампания</th>
                                    <th>Состояние</th>
                                    <th>Период</th>
                                    <th>Бюджет</th>
                                </tr>
                            </thead>
                            <tbody>
                                {campaigns.map((campaign) => (
                                    <tr key={campaign.id}>
                                        <th>
                                            <Link to={`/admin/advertising/campaigns/${campaign.id}`}>
                                                {campaign.advertiserName}
                                            </Link>
                                        </th>
                                        <td>{campaign.state}</td>
                                        <td>
                                            {new Date(campaign.startsAt).toLocaleDateString('ru-RU')} —{' '}
                                            {new Date(campaign.endsAt).toLocaleDateString('ru-RU')}
                                        </td>
                                        <td>
                                            {campaign.spentMinor} / {campaign.budgetMinor} {campaign.currency}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            void run(() => client.createAdCampaign(campaignInput(data)));
                        }}
                    >
                        <h3>Новая draft-кампания</h3>
                        <CampaignFields placements={placements} />
                        <button className="primary-action" disabled={!online || placements.length === 0} type="submit">
                            Создать кампанию
                        </button>
                    </form>
                </section>
            )}

            {has(session, 'AD_REPORT_READ') && (
                <section className="admin-panel" aria-labelledby="report-title">
                    <h2 id="report-title">Агрегированный отчёт</h2>
                    <form
                        className="admin-form-grid"
                        onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            void client
                                .getAdReport({ from: iso(data, 'from'), until: iso(data, 'until') })
                                .then(setReport)
                                .catch((error: unknown) => {
                                    setStatus(message(error));
                                });
                        }}
                    >
                        <label>
                            С
                            <input defaultValue={reportRange.from} name="from" type="datetime-local" required />
                        </label>
                        <label>
                            По
                            <input defaultValue={reportRange.until} name="until" type="datetime-local" required />
                        </label>
                        <button className="secondary-action" disabled={!online} type="submit">
                            Построить
                        </button>
                    </form>
                    {report && (
                        <div className="admin-table-wrap">
                            <table>
                                <thead>
                                    <tr>
                                        <th>День</th>
                                        <th>Выдано</th>
                                        <th>Видимо</th>
                                        <th>Клики</th>
                                        <th>Расход</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {report.rows.map((row) => (
                                        <tr key={`${row.day}-${row.campaignId}-${row.creativeId ?? ''}`}>
                                            <th>{row.day}</th>
                                            <td>{row.suppressed ? 'Подавлено' : row.served}</td>
                                            <td>{row.suppressed ? '—' : row.viewable}</td>
                                            <td>{row.suppressed ? '—' : row.validClicks}</td>
                                            <td>{row.suppressed ? '—' : row.spendMinor}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p className="field-help">
                                Когорты меньше {report.minimumCohortSize} подавляются сервером.
                            </p>
                        </div>
                    )}
                </section>
            )}
        </main>
    );
}

export function AdvertisingCampaignWorkspace({
    client,
    online,
    session,
}: {
    readonly client: AdminClient;
    readonly online: boolean;
    readonly session: Session;
}) {
    const { campaignId = '' } = useParams();
    const [campaign, setCampaign] = useState<Campaign>();
    const [placements, setPlacements] = useState<readonly Placement[]>([]);
    const [creativeId, setCreativeId] = useState<string>();
    const [status, setStatus] = useState<string>();
    const load = useCallback(async () => {
        try {
            const [nextCampaign, placementPage] = await Promise.all([
                client.getAdCampaign(campaignId),
                client.listAdPlacements(),
            ]);
            setCampaign(nextCampaign);
            setPlacements(placementPage.items);
        } catch (error) {
            setStatus(message(error));
        }
    }, [campaignId, client]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);
    async function run(operation: () => Promise<unknown>) {
        try {
            await operation();
            await load();
            setStatus('Изменение подтверждено сервером.');
        } catch (error) {
            setStatus(message(error));
        }
    }
    if (!campaign)
        return (
            <main data-ad-critical="true">
                <Link to="/admin/advertising">← К рекламе</Link>
                <p role="status">{status ?? 'Загружаем кампанию…'}</p>
            </main>
        );
    const revisionId = campaign.currentRevisionId;
    return (
        <main data-ad-critical="true">
            <Link to="/admin/advertising">← К рекламе</Link>
            <div className="admin-title">
                <div>
                    <p className="eyebrow">{campaign.state}</p>
                    <h1>{campaign.advertiserName}</h1>
                </div>
                <span className="admin-badge">Версия {campaign.version}</span>
            </div>
            {status && (
                <p className="form-message" role="status">
                    {status}
                </p>
            )}
            {has(session, 'AD_CREATIVE_MANAGE') && (
                <form
                    className="admin-panel"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void run(async () => {
                            const body = value(data, 'body');
                            const headline = value(data, 'headline');
                            const creative = await client.createAdCreative({
                                altText: value(data, 'altText'),
                                approvedRedirectHosts: value(data, 'redirectHosts')
                                    .split(',')
                                    .map((item) => item.trim())
                                    .filter(Boolean),
                                assetId: value(data, 'assetId'),
                                ...(body ? { body } : {}),
                                byteLength: number(data, 'byteLength'),
                                campaignId,
                                expectedCampaignVersion: campaign.version,
                                format: value(data, 'format') as components['schemas']['AdCreativeFormat'],
                                ...(headline ? { headline } : {}),
                                landingUrl: value(data, 'landingUrl'),
                                mediaType: value(data, 'mediaType'),
                                sha256: value(data, 'sha256'),
                            });
                            setCreativeId(creative.id);
                        });
                    }}
                >
                    <h2>Неизменяемый креатив</h2>
                    <div className="admin-form-grid">
                        <label>
                            Asset UUID
                            <input name="assetId" required />
                        </label>
                        <label>
                            Формат
                            <select name="format">
                                <option>STATIC_IMAGE</option>
                                <option>TEXT_IMAGE_CARD</option>
                            </select>
                        </label>
                        <label>
                            MIME
                            <input defaultValue="image/webp" name="mediaType" required />
                        </label>
                        <label>
                            Байты
                            <input max="1048576" min="1" name="byteLength" type="number" required />
                        </label>
                        <label>
                            SHA-256
                            <input minLength={64} maxLength={64} name="sha256" required />
                        </label>
                        <label>
                            Alt-текст
                            <input maxLength={500} name="altText" required />
                        </label>
                        <label>
                            Заголовок
                            <input name="headline" />
                        </label>
                        <label>
                            Текст карточки
                            <input name="body" />
                        </label>
                        <label>
                            HTTPS landing
                            <input name="landingUrl" type="url" required />
                        </label>
                        <label>
                            Разрешённые redirect hosts
                            <input name="redirectHosts" placeholder="example.test, www.example.test" required />
                        </label>
                    </div>
                    <button className="primary-action" disabled={!online} type="submit">
                        Добавить креатив
                    </button>
                </form>
            )}
            {has(session, 'AD_CAMPAIGN_MANAGE') && (
                <form
                    className="admin-panel"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void run(() =>
                            client.createAdCampaignRevision(campaignId, {
                                ...campaignInput(data),
                                creativeIds: value(data, 'creativeIds')
                                    .split(',')
                                    .map((item) => item.trim())
                                    .filter(Boolean),
                                expectedVersion: campaign.version,
                            })
                        );
                    }}
                >
                    <h2>Новая ревизия кампании</h2>
                    <CampaignFields placements={placements} />
                    <label>
                        Creative UUIDs через запятую
                        <input defaultValue={creativeId} name="creativeIds" required />
                    </label>
                    <button className="primary-action" disabled={!online} type="submit">
                        Создать ревизию
                    </button>
                </form>
            )}
            {has(session, 'AD_CAMPAIGN_REVIEW') && revisionId && (
                <form
                    className="admin-panel"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const data = new FormData(event.currentTarget);
                        void run(() =>
                            client.decideAdCampaign(campaignId, {
                                checklistVersion: value(data, 'checklistVersion'),
                                decision: value(data, 'decision') as components['schemas']['AdReviewDecision'],
                                expectedVersion: campaign.version,
                                independentReviewer: data.has('independentReviewer'),
                                reason: value(data, 'reason') as components['schemas']['AdPauseReason'],
                                revisionId,
                            })
                        );
                    }}
                >
                    <h2>Проверка текущей ревизии</h2>
                    <p className="field-help">Одобрение выполняет сотрудник, не создававший ревизию.</p>
                    <div className="admin-form-grid">
                        <label>
                            Решение
                            <select name="decision">
                                <option>SUBMIT</option>
                                <option>APPROVE</option>
                                <option>REJECT</option>
                            </select>
                        </label>
                        <label>
                            Причина
                            <select name="reason">
                                <option>MANUAL</option>
                                <option>LEGAL</option>
                                <option>PRIVACY</option>
                                <option>SAFETY</option>
                                <option>ACCESSIBILITY</option>
                            </select>
                        </label>
                        <label>
                            Checklist
                            <input defaultValue="1.0.0" name="checklistVersion" required />
                        </label>
                        <label className="check">
                            <input name="independentReviewer" type="checkbox" />
                            Независимый reviewer
                        </label>
                    </div>
                    <button className="primary-action" disabled={!online} type="submit">
                        Записать решение
                    </button>
                </form>
            )}
            {has(session, 'AD_CAMPAIGN_PAUSE') && (
                <section className="admin-panel">
                    <h2>Оперативное состояние</h2>
                    <div className="action-row">
                        <button
                            className="danger-action"
                            disabled={!online || campaign.state === 'PAUSED'}
                            onClick={() =>
                                void run(() =>
                                    client.changeAdCampaignState(campaignId, 'pause', {
                                        expectedVersion: campaign.version,
                                        reason: 'MANUAL',
                                    })
                                )
                            }
                            type="button"
                        >
                            Приостановить
                        </button>
                        <button
                            className="secondary-action"
                            disabled={!online || campaign.state !== 'PAUSED'}
                            onClick={() =>
                                void run(() =>
                                    client.changeAdCampaignState(campaignId, 'resume', {
                                        expectedVersion: campaign.version,
                                        reason: 'MANUAL',
                                    })
                                )
                            }
                            type="button"
                        >
                            Возобновить в исходном расписании
                        </button>
                    </div>
                </section>
            )}
        </main>
    );
}
