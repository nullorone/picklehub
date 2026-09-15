import { ApiError, type components } from '@picklehub/api-client';
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import type { AdminClient } from './admin-client';
import { SafeRichText } from './content-ui';

type Session = components['schemas']['AdminSessionContext'];
type Capability = components['schemas']['AdminCapability'];
type Decision = components['schemas']['ContentDecisionKind'];
type Reason = components['schemas']['ContentDecisionReason'];

const decisionLabels: Record<Decision, string> = {
    APPROVE: 'Одобрить',
    ARCHIVE: 'Архивировать',
    CANCEL_SCHEDULE: 'Отменить планирование',
    PUBLISH: 'Опубликовать',
    RETURN_TO_DRAFT: 'Вернуть в черновик',
    SCHEDULE: 'Запланировать',
    SUBMIT_REVIEW: 'Отправить на проверку',
    UNPUBLISH: 'Снять с публикации',
};

const reasonLabels: Record<Reason, string> = {
    ARCHIVE_POLICY: 'Политика архива',
    CORRECTION: 'Исправление',
    EDITORIAL_READY: 'Готово редакцией',
    EDITORIAL_REVISION_REQUIRED: 'Нужна доработка',
    LEGAL_TAKEDOWN: 'Юридическое требование',
    RIGHTS_REVOKED: 'Права отозваны',
    SAFETY_REQUEST: 'Запрос безопасности',
    SCHEDULE_CHANGED: 'Расписание изменено',
    SOURCE_UNAVAILABLE: 'Источник недоступен',
};

function has(session: Session, capability: Capability): boolean {
    return session.capabilities.includes(capability);
}

function value(data: FormData, name: string): string {
    const result = data.get(name);
    return typeof result === 'string' ? result.trim() : '';
}

function formatDate(input: string): string {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(input));
}

function errorMessage(error: unknown): string {
    if (!(error instanceof ApiError)) return 'Не удалось выполнить действие.';
    const code = error.response?.error.code;
    if (code === 'REVISION_CONFLICT') return 'Статья уже изменена. Загрузите свежую версию перед продолжением.';
    if (code === 'SLUG_CONFLICT') return 'Этот адрес уже закреплён за другим материалом.';
    if (code === 'RIGHTS_HOLD') return 'Публикация остановлена: права источника требуют проверки.';
    if (code === 'CHECKLIST_REQUIRED') return 'Для решения нужен полностью подтверждённый чек-лист.';
    if (code === 'ORIGIN_REQUIRED') return 'Для производного материала заполните происхождение.';
    if (code === 'CONTENT_FORMAT_REJECTED') return 'Текст не соответствует SAFE_RICH_TEXT_V1.';
    if (code === 'CONTENT_ACTION_FORBIDDEN') return 'У текущей роли нет разрешения на это действие.';
    if (code === 'REAUTHENTICATION_REQUIRED') return 'Нужна свежая повторная аутентификация.';
    return error.response?.error.message ?? 'Не удалось выполнить действие.';
}

function Feedback({ message }: { readonly message: string }) {
    return message ? (
        <p className="form-message" role="status">
            {message}
        </p>
    ) : null;
}

export function ContentDashboard({
    client,
    session,
    online,
}: {
    readonly client: AdminClient;
    readonly session: Session;
    readonly online: boolean;
}) {
    const navigate = useNavigate();
    const [sources, setSources] = useState<components['schemas']['ContentSourcePage']>();
    const [candidates, setCandidates] = useState<components['schemas']['IngestCandidatePage']>();
    const [articles, setArticles] = useState<components['schemas']['AdminArticlePage']>();
    const [message, setMessage] = useState('');
    const load = useCallback(async () => {
        setMessage('');
        try {
            const [nextSources, nextCandidates, nextArticles] = await Promise.all([
                has(session, 'CONTENT_SOURCE_READ') ? client.listContentSources() : Promise.resolve(undefined),
                has(session, 'CONTENT_CANDIDATE_REVIEW') ? client.listContentCandidates() : Promise.resolve(undefined),
                has(session, 'CONTENT_EDIT') ? client.listContentArticles() : Promise.resolve(undefined),
            ]);
            setSources(nextSources);
            setCandidates(nextCandidates);
            setArticles(nextArticles);
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }, [client, session]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    async function createOriginal() {
        if (!online) return;
        setMessage('');
        try {
            const article = await client.createContentArticle({ originKind: 'ORIGINAL' });
            void navigate(`/admin/content/articles/${article.id}`);
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    async function pause(source: components['schemas']['ContentSource']) {
        if (!online) return;
        try {
            await client.pauseContentSource(source.id, {
                expectedVersion: source.version,
                reason: 'SOURCE_UNAVAILABLE',
            });
            await load();
            setMessage('Получение новых кандидатов остановлено.');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    return (
        <main className="content-admin">
            <div className="admin-title">
                <div>
                    <p className="eyebrow">Закрытый редакционный контур</p>
                    <h1>Контент</h1>
                </div>
                {has(session, 'CONTENT_EDIT') && (
                    <button
                        className="primary-action"
                        disabled={!online}
                        onClick={() => void createOriginal()}
                        type="button"
                    >
                        Новый оригинальный материал
                    </button>
                )}
            </div>
            <p className="field-help">
                Черновики доступны только в этой staff-сессии и никогда не открываются публичной ссылкой.
            </p>
            <Feedback message={message} />
            {has(session, 'CONTENT_SOURCE_READ') && (
                <section aria-labelledby="content-sources-title">
                    <div className="section-heading">
                        <h2 id="content-sources-title">Источники</h2>
                        <Link to="/admin/content/sources/new">Предложить источник</Link>
                    </div>
                    {!sources && !message && <p role="status">Загружаем источники…</p>}
                    <div className="admin-table-wrap">
                        <table>
                            <thead>
                                <tr>
                                    <th>Источник</th>
                                    <th>Интеграция</th>
                                    <th>Состояние</th>
                                    <th>Права</th>
                                    <th>Действие</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sources?.items.map((source) => (
                                    <tr key={source.id}>
                                        <th scope="row">{source.displayName}</th>
                                        <td>{source.integrationKind}</td>
                                        <td>{source.state}</td>
                                        <td>
                                            {source.policyVersion} · до {formatDate(source.rights.reviewDueAt)}
                                        </td>
                                        <td>
                                            {has(session, 'CONTENT_SOURCE_PAUSE') && source.state === 'ENABLED' && (
                                                <button
                                                    disabled={!online}
                                                    onClick={() => void pause(source)}
                                                    type="button"
                                                >
                                                    Остановить
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {sources?.items.length === 0 && (
                        <p className="empty-state">
                            Источники не предложены. По умолчанию получение материалов выключено.
                        </p>
                    )}
                </section>
            )}
            {has(session, 'CONTENT_CANDIDATE_REVIEW') && (
                <section aria-labelledby="content-candidates-title">
                    <h2 id="content-candidates-title">Кандидаты</h2>
                    <div className="editorial-grid">
                        {candidates?.items.map((item) => (
                            <Link className="editorial-card" key={item.id} to={`/admin/content/candidates/${item.id}`}>
                                <strong>{item.currentRevision.title}</strong>
                                <span>
                                    {item.state} · {formatDate(item.updatedAt)}
                                </span>
                                <small>{item.currentRevision.publisher ?? 'Издатель не указан'}</small>
                            </Link>
                        ))}
                    </div>
                    {candidates?.items.length === 0 && <p className="empty-state">Новых кандидатов нет.</p>}
                </section>
            )}
            {has(session, 'CONTENT_EDIT') && (
                <section aria-labelledby="content-articles-title">
                    <h2 id="content-articles-title">Статьи</h2>
                    <div className="editorial-grid">
                        {articles?.items.map((item) => (
                            <Link className="editorial-card" key={item.id} to={`/admin/content/articles/${item.id}`}>
                                <strong>{item.id}</strong>
                                <span>
                                    {item.state} · версия {item.version}
                                </span>
                                <small>Обновлено {formatDate(item.updatedAt)}</small>
                            </Link>
                        ))}
                    </div>
                    {articles?.items.length === 0 && <p className="empty-state">Статей пока нет.</p>}
                </section>
            )}
        </main>
    );
}

export function SourceProposal({ client, online }: { readonly client: AdminClient; readonly online: boolean }) {
    const navigate = useNavigate();
    const [message, setMessage] = useState('');
    async function submit(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!online) return;
        const data = new FormData(event.currentTarget);
        const now = new Date();
        const due = new Date(now.getTime() + 90 * 86_400_000);
        try {
            await client.createContentSource({
                attributionTemplate: value(data, 'attributionTemplate'),
                canonicalOrigin: value(data, 'canonicalOrigin'),
                displayName: value(data, 'displayName'),
                endpoint: value(data, 'endpoint'),
                expectedVersion: 0,
                integrationKind: value(data, 'integrationKind') as 'RSS' | 'API',
                legalName: value(data, 'legalName'),
                policyVersion: value(data, 'policyVersion'),
                rights: {
                    commercialReview: 'PENDING',
                    fullTextLicenseEvidenceId: null,
                    languages: ['ru-RU'],
                    legalReview: 'PENDING',
                    maximumExcerptCharacters: Number(value(data, 'maximumExcerptCharacters')),
                    mediaLicenseEvidenceId: null,
                    privacyReview: 'PENDING',
                    reviewDueAt: due.toISOString(),
                    reviewedAt: null,
                    rightsBasis: value(data, 'rightsBasis'),
                    securityReview: 'PENDING',
                    termsUrl: value(data, 'termsUrl'),
                    termsVersion: value(data, 'termsVersion'),
                    territory: value(data, 'territory'),
                    useClasses: [
                        'FETCH_METADATA',
                        'STORE_METADATA',
                        'STORE_EXCERPT',
                        'TRANSFORM',
                        'PUBLISH_ATTRIBUTION',
                    ],
                    validFrom: now.toISOString(),
                    validUntil: null,
                },
            });
            void navigate('/admin/content');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }
    return (
        <main className="content-admin">
            <Link to="/admin/content">← К контенту</Link>
            <h1>Предложить источник</h1>
            <p>Новый источник останется в PROPOSED. Эта форма не подтверждает права и не включает получение.</p>
            <form className="editor-form" onSubmit={(event) => void submit(event)}>
                <label>
                    Отображаемое название
                    <input name="displayName" required />
                </label>
                <label>
                    Юридическое название
                    <input name="legalName" required />
                </label>
                <label>
                    Тип
                    <select name="integrationKind">
                        <option value="RSS">RSS</option>
                        <option value="API">API</option>
                    </select>
                </label>
                <label>
                    Канонический HTTPS origin
                    <input name="canonicalOrigin" type="url" pattern="https://.*" required />
                </label>
                <label>
                    Разрешённый HTTPS endpoint
                    <input name="endpoint" type="url" pattern="https://.*" required />
                </label>
                <label>
                    URL условий
                    <input name="termsUrl" type="url" pattern="https://.*" required />
                </label>
                <label>
                    Версия условий
                    <input name="termsVersion" required />
                </label>
                <label>
                    Версия политики
                    <input name="policyVersion" defaultValue="1.0.0" pattern="[1-9][0-9]*\\.[0-9]+\\.[0-9]+" required />
                </label>
                <label>
                    Основание прав
                    <input name="rightsBasis" required />
                </label>
                <label>
                    Территория
                    <input name="territory" defaultValue="RU" required />
                </label>
                <label>
                    Максимум символов выдержки
                    <input
                        name="maximumExcerptCharacters"
                        type="number"
                        min="0"
                        max="2000"
                        defaultValue="500"
                        required
                    />
                </label>
                <label>
                    Шаблон атрибуции
                    <textarea name="attributionTemplate" required />
                </label>
                <button className="primary-action" disabled={!online} type="submit">
                    Сохранить предложение
                </button>
            </form>
            <Feedback message={message} />
        </main>
    );
}

export function CandidateWorkspace({ client, online }: { readonly client: AdminClient; readonly online: boolean }) {
    const { candidateId = '' } = useParams();
    const navigate = useNavigate();
    const [candidate, setCandidate] = useState<components['schemas']['IngestCandidate']>();
    const [message, setMessage] = useState('');
    const load = useCallback(
        () =>
            client
                .getContentCandidate(candidateId)
                .then(setCandidate)
                .catch((error: unknown) => {
                    setMessage(errorMessage(error));
                }),
        [candidateId, client]
    );
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);
    async function decide(state: 'DISMISSED' | 'RIGHTS_HOLD') {
        if (!candidate || !online) return;
        try {
            await client.decideContentCandidate(candidate.id, {
                expectedVersion: candidate.version,
                reason: state === 'RIGHTS_HOLD' ? 'RIGHTS_REVOKED' : 'EDITORIAL_REVISION_REQUIRED',
                state,
            });
            await load();
            setMessage('Решение сохранено. Кандидат не опубликован.');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }
    async function createDraft() {
        if (!candidate || !online) return;
        try {
            const article = await client.createContentArticle({ candidateId: candidate.id, originKind: 'DERIVED' });
            await client.decideContentCandidate(candidate.id, {
                expectedVersion: candidate.version,
                reason: 'EDITORIAL_READY',
                selectedArticleId: article.id,
                state: 'SELECTED',
            });
            void navigate(`/admin/content/articles/${article.id}`);
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }
    if (!candidate)
        return (
            <main>
                <Feedback message={message || 'Загружаем кандидата…'} />
            </main>
        );
    const revision = candidate.currentRevision;
    return (
        <main className="content-admin">
            <Link to="/admin/content">← К очереди</Link>
            <p className="eyebrow">Кандидат · {candidate.state}</p>
            <h1>{revision.title}</h1>
            <dl className="detail-list">
                <div>
                    <dt>Издатель</dt>
                    <dd>{revision.publisher ?? 'Не указан'}</dd>
                </div>
                <div>
                    <dt>Автор</dt>
                    <dd>{revision.author ?? 'Не указан'}</dd>
                </div>
                <div>
                    <dt>Получено</dt>
                    <dd>{formatDate(revision.receivedAt)}</dd>
                </div>
            </dl>
            {revision.excerpt && <blockquote>{revision.excerpt}</blockquote>}
            <a href={revision.canonicalUrl} rel="noopener noreferrer" target="_blank">
                Открыть внешний источник
            </a>
            <p className="field-help">
                Это разрешённая метаинформация и выдержка, а не текст для автоматической публикации.
            </p>
            {candidate.duplicateKind && (
                <p role="note">
                    Сигнал дубликата: {candidate.duplicateKind}. Происхождение не объединено и не удалено.
                </p>
            )}
            <div className="action-row">
                <button
                    disabled={!online || candidate.state !== 'NEW'}
                    onClick={() => void createDraft()}
                    type="button"
                >
                    Создать закрытый черновик
                </button>
                <button
                    disabled={!online || candidate.state !== 'NEW'}
                    onClick={() => void decide('RIGHTS_HOLD')}
                    type="button"
                >
                    Проверить права
                </button>
                <button
                    disabled={!online || candidate.state !== 'NEW'}
                    onClick={() => void decide('DISMISSED')}
                    type="button"
                >
                    Отклонить
                </button>
            </div>
            <Feedback message={message} />
        </main>
    );
}

function checklist(selfReview: boolean): components['schemas']['ContentChecklistConfirmation'] {
    return {
        accessibilityChecked: true,
        attributionChecked: true,
        factsChecked: true,
        languageChecked: true,
        mediaRightsChecked: true,
        privacyChecked: true,
        selfReview,
        textRightsChecked: true,
        version: '1.0.0',
    };
}

export function ArticleWorkspace({ client, online }: { readonly client: AdminClient; readonly online: boolean }) {
    const { articleId = '' } = useParams();
    const [article, setArticle] = useState<components['schemas']['AdminArticle']>();
    const [revisions, setRevisions] = useState<components['schemas']['ArticleRevisionPage']>();
    const [preview, setPreview] = useState<components['schemas']['ArticleRevision']>();
    const [message, setMessage] = useState('');
    const load = useCallback(async () => {
        try {
            const [nextArticle, nextRevisions] = await Promise.all([
                client.getContentArticle(articleId),
                client.listContentRevisions(articleId),
            ]);
            setArticle(nextArticle);
            setRevisions(nextRevisions);
            setMessage('');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }, [articleId, client]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    async function createRevision(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!article || !online) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        const bodyText = value(data, 'body');
        const originKind = value(data, 'originKind') as 'ORIGINAL' | 'DERIVED';
        const sourceId = value(data, 'sourceId');
        const candidateRevisionId = value(data, 'candidateRevisionId');
        const origins: components['schemas']['ArticleOrigin'][] =
            originKind === 'DERIVED'
                ? [
                      {
                          candidateRevisionId: candidateRevisionId || null,
                          canonicalUrl: value(data, 'sourceUrl'),
                          id: crypto.randomUUID(),
                          licenseNotice: value(data, 'licenseNotice') || null,
                          originalAuthor: value(data, 'originalAuthor') || null,
                          originallyPublishedAt: null,
                          originalPublisher: value(data, 'originalPublisher') || null,
                          originalTitle: value(data, 'originalTitle'),
                          receivedAt: new Date().toISOString(),
                          rightsBasis: value(data, 'rightsBasis'),
                          sourceId,
                          sourcePolicyVersion: value(data, 'sourcePolicyVersion'),
                          transformationKind: value(
                              data,
                              'transformationKind'
                          ) as components['schemas']['ContentTransformationKind'],
                      },
                  ]
                : [];
        try {
            await client.createContentRevision(article.id, {
                body: {
                    blocks: bodyText
                        .split(/\n\s*\n/u)
                        .filter(Boolean)
                        .map((text) => ({ inlines: [{ text }], kind: 'PARAGRAPH' as const })),
                    format: 'SAFE_RICH_TEXT_V1',
                },
                categoryId: value(data, 'categoryId'),
                expectedArticleVersion: article.version,
                locale: 'ru-RU',
                media: [],
                originKind,
                origins,
                seo: {
                    canonicalUrl: value(data, 'canonicalUrl'),
                    description: value(data, 'seoDescription'),
                    indexable: true,
                    openGraphImageUrl: null,
                    title: value(data, 'seoTitle'),
                },
                slug: value(data, 'slug'),
                ...(value(data, 'subtitle') ? { subtitle: value(data, 'subtitle') } : {}),
                summary: value(data, 'summary'),
                tagIds: value(data, 'tagIds')
                    .split(',')
                    .map((item) => item.trim())
                    .filter(Boolean),
                title: value(data, 'title'),
            });
            form.reset();
            await load();
            setMessage('Новая неизменяемая редакция сохранена. Публичный материал не изменён.');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    async function showPreview(revisionId: string) {
        try {
            setPreview(await client.previewContentRevision(articleId, revisionId));
            setMessage('');
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    async function decide(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!article || !online) return;
        const data = new FormData(event.currentTarget);
        const decision = value(data, 'decision') as Decision;
        const revisionId = value(data, 'revisionId');
        const needsChecklist = ['APPROVE', 'SCHEDULE', 'PUBLISH'].includes(decision);
        const scheduled = value(data, 'scheduledFor');
        try {
            await client.decideContentArticle(article.id, {
                ...(needsChecklist ? { checklist: checklist(data.get('selfReview') === 'on') } : {}),
                decision,
                expectedArticleVersion: article.version,
                reason: value(data, 'reason') as Reason,
                revisionId,
                ...(decision === 'SCHEDULE' && scheduled ? { scheduledFor: new Date(scheduled).toISOString() } : {}),
            });
            await load();
            setMessage(`${decisionLabels[decision]}: решение подтверждено сервером.`);
        } catch (error) {
            setMessage(errorMessage(error));
        }
    }

    if (!article)
        return (
            <main>
                <Feedback message={message || 'Загружаем статью…'} />
            </main>
        );
    const latest = revisions?.items[0];
    return (
        <main className="content-admin">
            <Link to="/admin/content">← К контенту</Link>
            <div className="admin-title">
                <div>
                    <p className="eyebrow">
                        {article.state} · версия {article.version}
                    </p>
                    <h1>Редактор статьи</h1>
                </div>
            </div>
            <Feedback message={message} />
            <section>
                <h2>Новая редакция</h2>
                <form className="editor-form" onSubmit={(event) => void createRevision(event)}>
                    <label>
                        Заголовок
                        <input name="title" maxLength={240} required />
                    </label>
                    <label>
                        Подзаголовок
                        <input name="subtitle" />
                    </label>
                    <label>
                        Краткое описание
                        <textarea name="summary" required />
                    </label>
                    <label>
                        Текст
                        <textarea name="body" rows={12} required />
                    </label>
                    <p className="field-help">
                        Абзацы разделяются пустой строкой. Сохраняется только SAFE_RICH_TEXT_V1; HTML и скрипты не
                        принимаются.
                    </p>
                    <label>
                        Slug
                        <input name="slug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required />
                    </label>
                    <label>
                        ID категории
                        <input name="categoryId" required />
                    </label>
                    <label>
                        ID тегов через запятую
                        <input name="tagIds" />
                    </label>
                    <label>
                        Тип материала
                        <select name="originKind">
                            <option value="ORIGINAL">Оригинальный</option>
                            <option value="DERIVED">Производный</option>
                        </select>
                    </label>
                    <details>
                        <summary>Происхождение производного материала</summary>
                        <div className="editor-form">
                            <label>
                                ID источника
                                <input name="sourceId" />
                            </label>
                            <label>
                                ID редакции кандидата
                                <input name="candidateRevisionId" />
                            </label>
                            <label>
                                Исходный заголовок
                                <input name="originalTitle" />
                            </label>
                            <label>
                                Автор
                                <input name="originalAuthor" />
                            </label>
                            <label>
                                Издатель
                                <input name="originalPublisher" />
                            </label>
                            <label>
                                HTTPS ссылка
                                <input name="sourceUrl" type="url" />
                            </label>
                            <label>
                                Версия политики
                                <input name="sourcePolicyVersion" defaultValue="1.0.0" />
                            </label>
                            <label>
                                Основание прав
                                <input name="rightsBasis" />
                            </label>
                            <label>
                                Лицензия
                                <input name="licenseNotice" />
                            </label>
                            <label>
                                Вид переработки
                                <select name="transformationKind">
                                    <option value="RESEARCH_SUMMARY">Исследовательское резюме</option>
                                    <option value="ADAPTATION">Адаптация</option>
                                    <option value="TRANSLATION">Перевод</option>
                                </select>
                            </label>
                        </div>
                    </details>
                    <label>
                        SEO title
                        <input name="seoTitle" required />
                    </label>
                    <label>
                        SEO description
                        <textarea name="seoDescription" required />
                    </label>
                    <label>
                        Канонический HTTPS URL
                        <input name="canonicalUrl" type="url" pattern="https://.*" required />
                    </label>
                    <button className="primary-action" disabled={!online} type="submit">
                        Сохранить новую редакцию
                    </button>
                </form>
            </section>
            <section>
                <h2>История редакций</h2>
                <ol className="revision-list">
                    {revisions?.items.map((revision) => (
                        <li key={revision.id}>
                            <div>
                                <strong>Редакция {revision.revision}</strong>
                                <span>
                                    {formatDate(revision.createdAt)} ·{' '}
                                    {revision.changedFields.join(', ') || 'первая версия'}
                                </span>
                            </div>
                            <button disabled={!online} onClick={() => void showPreview(revision.id)} type="button">
                                Предпросмотр
                            </button>
                        </li>
                    ))}
                </ol>
            </section>
            {preview && (
                <section className="staff-preview" aria-labelledby="staff-preview-title">
                    <p className="eyebrow">Только staff · noindex · exact revision</p>
                    <h2 id="staff-preview-title">{preview.title}</h2>
                    <p>{preview.summary}</p>
                    <SafeRichText document={preview.body} />
                    <button
                        onClick={() => {
                            setPreview(undefined);
                        }}
                        type="button"
                    >
                        Закрыть предпросмотр
                    </button>
                </section>
            )}
            <section>
                <h2>Редакционное решение</h2>
                {latest ? (
                    <form className="editor-form" onSubmit={(event) => void decide(event)}>
                        <label>
                            Точная редакция
                            <select name="revisionId" defaultValue={latest.id}>
                                {revisions.items.map((revision) => (
                                    <option key={revision.id} value={revision.id}>
                                        Редакция {revision.revision}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Действие
                            <select name="decision" defaultValue="SUBMIT_REVIEW">
                                {Object.entries(decisionLabels).map(([decision, label]) => (
                                    <option key={decision} value={decision}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Причина
                            <select name="reason" defaultValue="EDITORIAL_READY">
                                {Object.entries(reasonLabels).map(([reason, label]) => (
                                    <option key={reason} value={reason}>
                                        {label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Время публикации (для планирования)
                            <input name="scheduledFor" type="datetime-local" />
                        </label>
                        <label className="check">
                            <input name="selfReview" type="checkbox" /> Самопроверка малой редакции явно отмечена
                        </label>
                        <p className="field-help">
                            Для одобрения, планирования и публикации сервер повторно проверяет полный versioned
                            checklist, права и точную редакцию.
                        </p>
                        <button className="primary-action" disabled={!online} type="submit">
                            Подтвердить решение
                        </button>
                    </form>
                ) : (
                    <p>Сначала сохраните редакцию.</p>
                )}
            </section>
        </main>
    );
}
