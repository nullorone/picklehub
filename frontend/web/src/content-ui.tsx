import { ApiError, type components, type createIdentityClient } from '@picklehub/api-client';
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

type Client = ReturnType<typeof createIdentityClient>;
type Article = components['schemas']['PublicArticle'];
type ArticleCard = components['schemas']['PublicArticleCard'];
type Inline = components['schemas']['SafeRichTextInline'];

const feedCacheKey = 'picklehub.content.feed.ru-RU.v1';

function articleCacheKey(locale: string, slug: string): string {
    return `picklehub.content.article.${locale}.${slug}.v1`;
}

function readCache(key: string): unknown {
    try {
        const value = localStorage.getItem(key);
        return value ? (JSON.parse(value) as unknown) : undefined;
    } catch {
        return undefined;
    }
}

function writeCache(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Storage is optional; the service worker remains the web fallback.
    }
}

function removeCache(key: string): void {
    try {
        localStorage.removeItem(key);
    } catch {
        // A denied storage API must not break reading.
    }
}

function date(value: string): string {
    return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(value));
}

function errorMessage(error: unknown): string {
    if (error instanceof ApiError && error.response?.error.code === 'ARTICLE_NOT_AVAILABLE') {
        return 'Материал снят с публикации или больше недоступен.';
    }
    if (error instanceof ApiError && error.response?.error.code === 'CONTENT_SEARCH_UNAVAILABLE') {
        return 'Поиск временно недоступен. Ленту всё ещё можно читать.';
    }
    return 'Не удалось загрузить материалы. Проверьте подключение и повторите попытку.';
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

function InlineContent({ item }: { readonly item: Inline }) {
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
            <InlineContent item={item} />
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

function ArticleCardView({ article }: { readonly article: ArticleCard }) {
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
    const [message, setMessage] = useState('');
    const [stale, setStale] = useState(false);
    const [query, setQuery] = useState('');
    const [category, setCategory] = useState('');
    const [tag, setTag] = useState('');
    const load = useCallback(async () => {
        setMessage('');
        const cached = readCache(feedCacheKey) as components['schemas']['PublicArticlePage'] | undefined;
        if (!online && cached) {
            setPage(cached);
            setStale(true);
            return;
        }
        if (!online) {
            setMessage('Нет подключения, а сохранённой ленты на этом устройстве ещё нет.');
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
            writeCache(feedCacheKey, result);
        } catch (error) {
            if (cached) {
                setPage(cached);
                setStale(true);
                setMessage('Сеть недоступна. Показана последняя сохранённая версия ленты.');
            } else setMessage(errorMessage(error));
        }
    }, [category, client, online, tag]);
    useEffect(() => {
        void Promise.resolve().then(load);
    }, [load]);

    async function search(event: SyntheticEvent<HTMLFormElement>) {
        event.preventDefault();
        const normalized = query.trim();
        if (normalized.length < 2) {
            setMessage('Введите не менее двух символов.');
            return;
        }
        if (!online) {
            setMessage('Поиск требует подключения. Сохранённая лента остаётся доступной ниже.');
            return;
        }
        setMessage('');
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
            setStale(false);
        } catch (error) {
            setMessage(errorMessage(error));
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
                    <p>Проверенные материалы о пиклболе с прозрачной атрибуцией источников.</p>
                </div>
                <Link className="secondary-action" to="/news/bookmarks">
                    Закладки
                </Link>
            </div>
            <form className="news-search" onSubmit={(event) => void search(event)}>
                <label>
                    Поиск
                    <input
                        aria-label="Поиск по материалам"
                        maxLength={120}
                        minLength={2}
                        onChange={(event) => {
                            setQuery(event.target.value);
                        }}
                        placeholder="Например, правила подачи"
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
            {stale && (
                <State>Сохранённая версия может быть устаревшей. Подключитесь, чтобы проверить публикацию.</State>
            )}
            {message && <State {...(online ? { retry: () => void load() } : {})}>{message}</State>}
            {!page && !message && <State>Загружаем редакционную ленту…</State>}
            {page?.items.length === 0 && <State>По выбранным условиям материалов пока нет.</State>}
            <div className="news-list">
                {page?.items.map((item) => (
                    <ArticleCardView article={item} key={item.id} />
                ))}
            </div>
        </main>
    );
}

function useArticleSeo(article: Article | undefined, stale: boolean) {
    useEffect(() => {
        if (!article) return;
        const previousTitle = document.title;
        document.title = article.seo.title;
        const restore: (() => void)[] = [];
        function setMeta(selector: string, attributes: Record<string, string>, content: string) {
            let element = document.querySelector<HTMLMetaElement>(selector);
            const created = !element;
            element ??= document.createElement('meta');
            const previous = element.content;
            for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
            element.content = content;
            if (created) document.head.append(element);
            restore.push(() => {
                if (created) element.remove();
                else element.content = previous;
            });
        }
        setMeta('meta[name="description"]', { name: 'description' }, article.seo.description);
        setMeta(
            'meta[name="robots"]',
            { name: 'robots' },
            article.seo.indexable && !stale ? 'index,follow' : 'noindex,nofollow'
        );
        setMeta('meta[property="og:title"]', { property: 'og:title' }, article.seo.title);
        setMeta('meta[property="og:description"]', { property: 'og:description' }, article.seo.description);
        setMeta('meta[property="og:url"]', { property: 'og:url' }, article.seo.canonicalUrl);
        if (article.seo.openGraphImageUrl) {
            setMeta('meta[property="og:image"]', { property: 'og:image' }, article.seo.openGraphImageUrl);
        }
        let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
        const created = !canonical;
        const previousCanonical = canonical?.href;
        canonical ??= document.createElement('link');
        canonical.rel = 'canonical';
        canonical.href = article.seo.canonicalUrl;
        if (created) document.head.append(canonical);
        const alternatives = article.languageAlternatives.map((alternative) => {
            const link = document.createElement('link');
            link.rel = 'alternate';
            link.hreflang = alternative.locale;
            link.href = alternative.canonicalUrl;
            document.head.append(link);
            return link;
        });
        const structuredData = document.createElement('script');
        structuredData.type = 'application/ld+json';
        structuredData.dataset.picklehubContent = 'article';
        structuredData.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            dateModified: article.updatedAt,
            datePublished: article.publishedAt,
            headline: article.title,
            inLanguage: article.locale,
            mainEntityOfPage: article.seo.canonicalUrl,
        });
        document.head.append(structuredData);
        return () => {
            document.title = previousTitle;
            for (const reset of restore) reset();
            if (created) canonical.remove();
            else if (previousCanonical) canonical.href = previousCanonical;
            for (const alternative of alternatives) alternative.remove();
            structuredData.remove();
        };
    }, [article, stale]);
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
    const cacheKey = articleCacheKey(locale, slug);
    const [article, setArticle] = useState<Article>();
    const [bookmarked, setBookmarked] = useState(false);
    const [message, setMessage] = useState('');
    const [stale, setStale] = useState(false);
    const [saving, setSaving] = useState(false);
    useArticleSeo(article, stale);
    const load = useCallback(async () => {
        setMessage('');
        const cached = readCache(cacheKey) as Article | undefined;
        if (!online && cached) {
            setArticle(cached);
            setStale(true);
            return;
        }
        if (!online) {
            setMessage('Нет подключения, и этот материал ещё не сохранён на устройстве.');
            return;
        }
        try {
            const result = await client.getPublishedArticle(locale, slug);
            setArticle(result);
            setStale(false);
            writeCache(cacheKey, result);
            if (signedIn) {
                const bookmarks = await client.listOwnContentBookmarks(undefined, 50);
                setBookmarked(bookmarks.items.some((item) => item.articleId === result.id));
            }
        } catch (error) {
            if (error instanceof ApiError && error.response?.error.code === 'ARTICLE_NOT_AVAILABLE') {
                removeCache(cacheKey);
                setArticle(undefined);
                setStale(false);
                setMessage(errorMessage(error));
            } else if (cached) {
                setArticle(cached);
                setStale(true);
                setMessage('Не удалось проверить публикацию. Показана последняя сохранённая версия.');
            } else setMessage(errorMessage(error));
        }
    }, [cacheKey, client, locale, online, signedIn, slug]);
    useEffect(() => void load(), [load]);

    async function toggleBookmark() {
        if (!article || !online || !signedIn) return;
        setSaving(true);
        setMessage('');
        try {
            if (bookmarked) await client.deleteOwnContentBookmark(article.id);
            else await client.putOwnContentBookmark(article.id);
            setBookmarked(!bookmarked);
            setMessage(bookmarked ? 'Материал удалён из закладок.' : 'Материал сохранён в закладках.');
        } catch (error) {
            setMessage(errorMessage(error));
        } finally {
            setSaving(false);
        }
    }

    async function share() {
        if (!article) return;
        const data = { title: article.title, url: article.seo.canonicalUrl };
        try {
            if (typeof navigator.share === 'function') await navigator.share(data);
            else {
                await navigator.clipboard.writeText(article.seo.canonicalUrl);
                setMessage('Каноническая ссылка скопирована.');
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            setMessage('Не удалось отправить ссылку. Скопируйте адрес из строки браузера.');
        }
    }

    if (!article) {
        return (
            <main className="shell-main news-screen">
                <Link to="/news">← К ленте</Link>
                <State {...(online ? { retry: () => void load() } : {})}>{message || 'Загружаем материал…'}</State>
            </main>
        );
    }
    return (
        <main className="shell-main article-screen">
            <Link to="/news">← К ленте</Link>
            {stale && <State>Это сохранённая версия. Она могла быть исправлена или снята с публикации.</State>}
            <article>
                <header className="article-header">
                    <p className="eyebrow">{article.category.name}</p>
                    <h1>{article.title}</h1>
                    {article.subtitle && <p className="article-subtitle">{article.subtitle}</p>}
                    <p className="news-meta">Опубликовано {date(article.publishedAt)}</p>
                    {article.coverMedia && <img alt={article.coverMedia.altText} src={article.coverMedia.url} />}
                </header>
                {article.correctionNote && (
                    <aside className="correction-note" role="note">
                        <strong>Исправление редакции</strong>
                        <p>{article.correctionNote}</p>
                    </aside>
                )}
                <SafeRichText document={article.body} />
                {article.attribution.length > 0 && (
                    <section className="attribution" aria-labelledby="attribution-title">
                        <h2 id="attribution-title">Источники и атрибуция</h2>
                        {article.attribution.map((origin) => (
                            <p key={`${origin.sourceId}-${origin.canonicalUrl}`}>
                                Материал подготовлен на основе «{origin.originalTitle}» —{' '}
                                {origin.originalAuthor ?? origin.originalPublisher ?? origin.sourceDisplayName}.{' '}
                                <a href={origin.canonicalUrl} rel="noopener noreferrer" target="_blank">
                                    Открыть внешний источник
                                </a>
                                {!origin.sourceAvailable && ' (источник сейчас недоступен)'}
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
                        onClick={() => void toggleBookmark()}
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
            {message && <State>{message}</State>}
        </main>
    );
}

export function BookmarksScreen({ client, online }: { readonly client: Client; readonly online: boolean }) {
    const [items, setItems] = useState<readonly components['schemas']['BookmarkItem'][]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const load = useCallback(async () => {
        setLoading(true);
        setMessage('');
        if (!online) {
            setMessage('Закладки содержат личные данные и обновляются только при подключении.');
            setLoading(false);
            return;
        }
        try {
            setItems((await client.listOwnContentBookmarks(undefined, 50)).items);
        } catch (error) {
            setMessage(errorMessage(error));
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
            {message && <State {...(online ? { retry: () => void load() } : {})}>{message}</State>}
            {!loading && !message && items.length === 0 && <State>Сохранённых материалов пока нет.</State>}
            <div className="news-list">
                {items.map((item) =>
                    item.available && item.article ? (
                        <ArticleCardView article={item.article} key={item.articleId} />
                    ) : (
                        <div className="state-card" key={item.articleId}>
                            Материал снят с публикации. Его заголовок и текст больше недоступны.
                        </div>
                    )
                )}
            </div>
        </main>
    );
}
