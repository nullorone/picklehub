import { ApiError, type components, type createIdentityClient } from '@picklehub/api-client';
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

type Client = ReturnType<typeof createIdentityClient>;
type Article = components['schemas']['PublicArticle'];
type Card = components['schemas']['PublicArticleCard'];
type Inline = components['schemas']['SafeRichTextInline'];

const feedCacheKey = 'picklehub.tma.content.feed.ru-RU.v1';

function cacheKey(locale: string, slug: string): string {
    return `picklehub.tma.content.article.${locale}.${slug}.v1`;
}

function cached(key: string): unknown {
    try {
        const value = localStorage.getItem(key);
        return value ? (JSON.parse(value) as unknown) : undefined;
    } catch {
        return undefined;
    }
}

function remember(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Telegram privacy settings may deny persistent storage.
    }
}

function forget(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // Storage is optional.
    }
}

function date(value: string): string {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(value));
}

function message(error: unknown): string {
    if (error instanceof ApiError && error.response?.error.code === 'ARTICLE_NOT_AVAILABLE') {
        return 'Материал снят с публикации или больше недоступен.';
    }
    if (error instanceof ApiError && error.response?.error.code === 'CONTENT_SEARCH_UNAVAILABLE') {
        return 'Поиск временно недоступен. Ленту всё ещё можно читать.';
    }
    return 'Не удалось загрузить материалы. Проверьте подключение.';
}

function State({ children, retry }: { readonly children: ReactNode; readonly retry?: () => void }) {
    return (
        <div className="state-card content-state" role="status">
            <p>{children}</p>
            {retry && (
                <button className="secondary-action" onClick={retry} type="button">
                    Повторить
                </button>
            )}
        </div>
    );
}

function RichInline({ item }: { readonly item: Inline }) {
    let content: ReactNode = item.text;
    for (const mark of item.marks ?? []) {
        if (mark === 'STRONG') content = <strong>{content}</strong>;
        if (mark === 'EMPHASIS') content = <em>{content}</em>;
        if (mark === 'CODE') content = <code>{content}</code>;
    }
    if (item.href) {
        content = (
            <a href={item.href} rel="noopener noreferrer" target="_blank">
                {content} <span className="external-label">(внешняя ссылка)</span>
            </a>
        );
    }
    return <>{content}</>;
}

function Inlines({ items }: { readonly items: readonly Inline[] }) {
    return items.map((item, index) => (
        <Fragment key={`${String(index)}-${item.text}`}>
            <RichInline item={item} />
        </Fragment>
    ));
}

export function SafeRichText({ document }: { readonly document: components['schemas']['SafeRichTextDocument'] }) {
    return (
        <div className="article-body">
            {document.blocks.map((block, index) => {
                const key = `${block.kind}-${String(index)}`;
                if (block.kind === 'HEADING') {
                    return block.headingLevel === 3 ? (
                        <h3 key={key}>
                            <Inlines items={block.inlines ?? []} />
                        </h3>
                    ) : (
                        <h2 key={key}>
                            <Inlines items={block.inlines ?? []} />
                        </h2>
                    );
                }
                if (block.kind === 'BULLETED_LIST' || block.kind === 'NUMBERED_LIST') {
                    const children = (block.items ?? []).map((item, itemIndex) => (
                        <li key={`${key}-${String(itemIndex)}`}>
                            <Inlines items={item} />
                        </li>
                    ));
                    return block.kind === 'BULLETED_LIST' ? (
                        <ul key={key}>{children}</ul>
                    ) : (
                        <ol key={key}>{children}</ol>
                    );
                }
                if (block.kind === 'QUOTE') {
                    return (
                        <blockquote key={key}>
                            <Inlines items={block.inlines ?? []} />
                        </blockquote>
                    );
                }
                return (
                    <p key={key}>
                        <Inlines items={block.inlines ?? []} />
                    </p>
                );
            })}
        </div>
    );
}

function ArticleCard({ article }: { readonly article: Card }) {
    return (
        <article className="news-card">
            {article.coverMedia && <img alt={article.coverMedia.altText} loading="lazy" src={article.coverMedia.url} />}
            <div>
                <p className="news-meta">
                    {article.category.name} · {date(article.publishedAt)}
                </p>
                <h2>
                    <Link to={`/news/${article.locale}/${article.slug}`}>{article.title}</Link>
                </h2>
                <p>{article.summary}</p>
                <ul className="tag-list" aria-label="Теги">
                    {article.tags.map((tag) => (
                        <li key={tag.id}>#{tag.name}</li>
                    ))}
                </ul>
            </div>
        </article>
    );
}

export function NewsFeed({ client, online }: { readonly client: Client; readonly online: boolean }) {
    const [page, setPage] = useState<components['schemas']['PublicArticlePage']>();
    const [notice, setNotice] = useState('');
    const [stale, setStale] = useState(false);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('');
    const [tag, setTag] = useState('');
    const load = useCallback(async () => {
        setNotice('');
        const fallback = cached(feedCacheKey) as components['schemas']['PublicArticlePage'] | undefined;
        if (!online && fallback) {
            setPage(fallback);
            setStale(true);
            return;
        }
        if (!online) {
            setNotice('Нет подключения, а сохранённой ленты ещё нет.');
            return;
        }
        try {
            const result = await client.listPublishedArticles({
                ...(category ? { category } : {}),
                locale: 'ru-RU',
                ...(tag ? { tag } : {}),
            });
            setPage(result);
            setStale(false);
            remember(feedCacheKey, result);
        } catch (error) {
            if (fallback) {
                setPage(fallback);
                setStale(true);
                setNotice('Показана последняя сохранённая версия ленты.');
            } else setNotice(message(error));
        }
    }, [category, client, online, tag]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    async function search(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        const normalized = query.trim();
        if (normalized.length < 2) {
            setNotice('Введите не менее двух символов.');
            return;
        }
        if (!online) {
            setNotice('Поиск требует подключения. Сохранённая лента доступна ниже.');
            return;
        }
        try {
            setPage(
                await client.searchPublishedArticles({
                    ...(category ? { category } : {}),
                    limit: 20,
                    locale: 'ru-RU',
                    query: normalized,
                    ...(tag ? { tag } : {}),
                })
            );
            setNotice('');
            setStale(false);
        } catch (error) {
            setNotice(message(error));
        }
    }

    const categories = useMemo(
        () => [...new Map(page?.items.map((item) => [item.category.slug, item.category]) ?? []).values()],
        [page]
    );
    const tags = useMemo(
        () => [...new Map(page?.items.flatMap((item) => item.tags).map((item) => [item.slug, item]) ?? []).values()],
        [page]
    );

    return (
        <main className="shell-main news-screen">
            <div className="section-heading">
                <div>
                    <p className="eyebrow">Редакция PickleHub</p>
                    <h1>Новости и знания</h1>
                </div>
                <Link className="secondary-action" to="/news/bookmarks">
                    Закладки
                </Link>
            </div>
            <form className="news-search" onSubmit={(event) => void search(event)}>
                <label>
                    Поиск
                    <input
                        maxLength={120}
                        minLength={2}
                        onChange={(event) => {
                            setQuery(event.target.value);
                        }}
                        placeholder="Правила подачи"
                        type="search"
                        value={query}
                    />
                </label>
                <label>
                    Категория
                    <select
                        onChange={(event) => {
                            setCategory(event.target.value);
                        }}
                        value={category}
                    >
                        <option value="">Все категории</option>
                        {categories.map((item) => (
                            <option key={item.id} value={item.slug}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    Тег
                    <select
                        onChange={(event) => {
                            setTag(event.target.value);
                        }}
                        value={tag}
                    >
                        <option value="">Все теги</option>
                        {tags.map((item) => (
                            <option key={item.id} value={item.slug}>
                                {item.name}
                            </option>
                        ))}
                    </select>
                </label>
                <button className="primary-action" disabled={!online} type="submit">
                    Найти
                </button>
            </form>
            {stale && <State>Сохранённая версия может быть устаревшей.</State>}
            {notice && <State {...(online ? { retry: () => void load() } : {})}>{notice}</State>}
            {!page && !notice && <State>Загружаем ленту…</State>}
            {page?.items.length === 0 && <State>Материалов пока нет.</State>}
            <div className="news-list">
                {page?.items.map((item) => (
                    <ArticleCard article={item} key={item.id} />
                ))}
            </div>
        </main>
    );
}

export function ArticleScreen({
    client,
    online,
    signedIn,
}: {
    readonly client: Client;
    readonly online: boolean;
    readonly signedIn: boolean;
}) {
    const { locale = 'ru-RU', slug = '' } = useParams();
    const key = cacheKey(locale, slug);
    const [article, setArticle] = useState<Article>();
    const [bookmarked, setBookmarked] = useState(false);
    const [notice, setNotice] = useState('');
    const [stale, setStale] = useState(false);
    const [saving, setSaving] = useState(false);
    const load = useCallback(async () => {
        setNotice('');
        const fallback = cached(key) as Article | undefined;
        if (!online && fallback) {
            setArticle(fallback);
            setStale(true);
            return;
        }
        if (!online) {
            setNotice('Нет подключения, и этот материал ещё не сохранён.');
            return;
        }
        try {
            const result = await client.getPublishedArticle(locale, slug);
            setArticle(result);
            setStale(false);
            remember(key, result);
            if (signedIn) {
                const bookmarks = await client.listOwnContentBookmarks(undefined, 50);
                setBookmarked(bookmarks.items.some((item) => item.articleId === result.id));
            }
        } catch (error) {
            if (error instanceof ApiError && error.response?.error.code === 'ARTICLE_NOT_AVAILABLE') {
                forget(key);
                setArticle(undefined);
                setStale(false);
                setNotice(message(error));
            } else if (fallback) {
                setArticle(fallback);
                setStale(true);
                setNotice('Показана последняя сохранённая версия.');
            } else setNotice(message(error));
        }
    }, [client, key, locale, online, signedIn, slug]);
    useEffect(() => void load(), [load]);

    async function bookmark() {
        if (!article || !online || !signedIn) return;
        setSaving(true);
        try {
            if (bookmarked) await client.deleteOwnContentBookmark(article.id);
            else await client.putOwnContentBookmark(article.id);
            setBookmarked(!bookmarked);
            setNotice(bookmarked ? 'Удалено из закладок.' : 'Сохранено в закладках.');
        } catch (error) {
            setNotice(message(error));
        } finally {
            setSaving(false);
        }
    }

    async function share() {
        if (!article) return;
        try {
            if (typeof navigator.share === 'function') {
                await navigator.share({ title: article.title, url: article.seo.canonicalUrl });
            } else {
                await navigator.clipboard.writeText(article.seo.canonicalUrl);
                setNotice('Каноническая ссылка скопирована.');
            }
        } catch (error) {
            if (!(error instanceof DOMException && error.name === 'AbortError'))
                setNotice('Не удалось отправить ссылку.');
        }
    }

    if (!article)
        return (
            <main className="shell-main news-screen">
                <Link to="/news">← К ленте</Link>
                <State {...(online ? { retry: () => void load() } : {})}>{notice || 'Загружаем материал…'}</State>
            </main>
        );
    return (
        <main className="shell-main article-screen">
            <Link to="/news">← К ленте</Link>
            {stale && <State>Это сохранённая версия. Она могла быть исправлена или снята.</State>}
            <article>
                <header className="article-header">
                    <p className="eyebrow">{article.category.name}</p>
                    <h1>{article.title}</h1>
                    {article.subtitle && <p className="article-subtitle">{article.subtitle}</p>}
                    <p className="news-meta">Опубликовано {date(article.publishedAt)}</p>
                    {article.coverMedia && <img alt={article.coverMedia.altText} src={article.coverMedia.url} />}
                </header>
                {article.correctionNote && (
                    <aside className="correction-note">
                        <strong>Исправление редакции</strong>
                        <p>{article.correctionNote}</p>
                    </aside>
                )}
                <SafeRichText document={article.body} />
                {article.attribution.length > 0 && (
                    <section className="attribution" aria-labelledby="tma-attribution-title">
                        <h2 id="tma-attribution-title">Источники и атрибуция</h2>
                        {article.attribution.map((origin) => (
                            <p key={`${origin.sourceId}-${origin.canonicalUrl}`}>
                                «{origin.originalTitle}» —{' '}
                                {origin.originalAuthor ?? origin.originalPublisher ?? origin.sourceDisplayName}.{' '}
                                <a href={origin.canonicalUrl} rel="noopener noreferrer" target="_blank">
                                    Внешний источник
                                </a>
                                {!origin.sourceAvailable && ' (сейчас недоступен)'}
                                {origin.licenseNotice ? ` · ${origin.licenseNotice}` : ''}
                            </p>
                        ))}
                    </section>
                )}
            </article>
            <div className="article-actions">
                <button className="primary-action" onClick={() => void share()} type="button">
                    Отправить ссылку
                </button>
                {signedIn ? (
                    <button
                        className="secondary-action"
                        disabled={!online || saving}
                        onClick={() => void bookmark()}
                        type="button"
                    >
                        {bookmarked ? 'Удалить из закладок' : 'Сохранить в закладки'}
                    </button>
                ) : (
                    <Link className="secondary-action" to="/login">
                        Войти, чтобы сохранить
                    </Link>
                )}
            </div>
            {notice && <State>{notice}</State>}
        </main>
    );
}

export function BookmarksScreen({ client, online }: { readonly client: Client; readonly online: boolean }) {
    const [items, setItems] = useState<readonly components['schemas']['BookmarkItem'][]>([]);
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(true);
    const load = useCallback(async () => {
        setLoading(true);
        if (!online) {
            setNotice('Закладки обновляются только при подключении.');
            setLoading(false);
            return;
        }
        try {
            setItems((await client.listOwnContentBookmarks(undefined, 50)).items);
            setNotice('');
        } catch (error) {
            setNotice(message(error));
        } finally {
            setLoading(false);
        }
    }, [client, online]);
    useEffect(() => void load(), [load]);
    return (
        <main className="shell-main news-screen">
            <Link to="/news">← К ленте</Link>
            <h1>Мои закладки</h1>
            {loading && <State>Загружаем закладки…</State>}
            {notice && <State {...(online ? { retry: () => void load() } : {})}>{notice}</State>}
            {!loading && !notice && items.length === 0 && <State>Сохранённых материалов пока нет.</State>}
            <div className="news-list">
                {items.map((item) =>
                    item.available && item.article ? (
                        <ArticleCard article={item.article} key={item.articleId} />
                    ) : (
                        <div className="state-card" key={item.articleId}>
                            Материал снят с публикации; его данные недоступны.
                        </div>
                    )
                )}
            </div>
        </main>
    );
}
