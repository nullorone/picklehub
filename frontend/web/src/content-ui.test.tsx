// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';

import { createIdentityClient, type components } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { ArticleScreen, NewsFeed, SafeRichText } from './content-ui';

const articleId = '11111111-1111-4111-8111-111111111111';
const article: components['schemas']['PublicArticle'] = {
    attribution: [
        {
            canonicalUrl: 'https://source.example.test/story',
            licenseNotice: 'CC BY 4.0',
            originalAuthor: 'Автор',
            originallyPublishedAt: '2026-09-10T10:00:00.000Z',
            originalPublisher: 'Издание',
            originalTitle: 'Исходный материал',
            sourceAvailable: true,
            sourceDisplayName: 'Разрешённый источник',
            sourceId: '22222222-2222-4222-8222-222222222222',
            transformationKind: 'RESEARCH_SUMMARY',
        },
    ],
    body: {
        blocks: [
            {
                inlines: [
                    { marks: ['STRONG'], text: '<img src=x onerror=alert(1)>' },
                    { href: 'https://rules.example.test', text: 'Правила' },
                ],
                kind: 'PARAGRAPH',
            },
        ],
        format: 'SAFE_RICH_TEXT_V1',
    },
    category: {
        id: '33333333-3333-4333-8333-333333333333',
        locale: 'ru-RU',
        name: 'Обучение',
        slug: 'learning',
    },
    correctionNote: null,
    coverMedia: null,
    id: articleId,
    languageAlternatives: [],
    locale: 'ru-RU',
    originKind: 'DERIVED',
    publishedAt: '2026-09-12T10:00:00.000Z',
    seo: {
        canonicalUrl: 'https://picklehub.example.test/news/ru-RU/basics',
        description: 'Безопасное описание',
        indexable: true,
        openGraphImageUrl: null,
        title: 'Основы пиклбола · PickleHub',
    },
    slug: 'basics',
    subtitle: 'Коротко о главном',
    summary: 'Проверенное введение в игру.',
    tags: [
        {
            id: '44444444-4444-4444-8444-444444444444',
            locale: 'ru-RU',
            name: 'Правила',
            slug: 'rules',
        },
    ],
    title: 'Основы пиклбола',
    updatedAt: '2026-09-12T11:00:00.000Z',
    version: 1,
};

function response(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' }, status });
}

afterEach(() => {
    cleanup();
    localStorage.clear();
    document.head.querySelectorAll('[data-picklehub-content]').forEach((node) => {
        node.remove();
    });
    vi.unstubAllGlobals();
});

describe('web content reader', () => {
    it('renders the closed rich-text AST as text and marks safe external links', () => {
        render(<SafeRichText document={article.body} />);
        expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
        expect(document.querySelector('.article-body img')).toBeNull();
        const link = screen.getByRole('link', { name: /Правила/u });
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        expect(link).toHaveTextContent('внешняя ссылка');
    });

    it('uses the canonical URL for sharing and installs article SEO metadata', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => response(article))
        );
        const share = vi.fn(() => Promise.resolve());
        Object.defineProperty(navigator, 'share', { configurable: true, value: share });
        render(
            <MemoryRouter initialEntries={['/news/ru-RU/basics']}>
                <Routes>
                    <Route
                        path="/news/:locale/:slug"
                        element={
                            <ArticleScreen
                                client={createIdentityClient({ baseUrl: '/v1' }, 'WEB')}
                                online
                                signedIn={false}
                            />
                        }
                    />
                </Routes>
            </MemoryRouter>
        );
        expect(await screen.findByRole('heading', { name: 'Основы пиклбола' })).toBeInTheDocument();
        expect(document.title).toBe(article.seo.title);
        expect(document.querySelector('link[rel="canonical"]')).toHaveAttribute('href', article.seo.canonicalUrl);
        expect(document.querySelector('script[data-picklehub-content="article"]')?.textContent).toContain(
            'https://schema.org'
        );
        fireEvent.click(screen.getByRole('button', { name: 'Отправить ссылку' }));
        await waitFor(() => {
            expect(share).toHaveBeenCalledWith({ title: article.title, url: article.seo.canonicalUrl });
        });
    });

    it('shows an explicitly stale last-known article without making an offline request', async () => {
        localStorage.setItem('picklehub.content.article.ru-RU.basics.v1', JSON.stringify(article));
        const fetch = vi.fn();
        vi.stubGlobal('fetch', fetch);
        render(
            <MemoryRouter initialEntries={['/news/ru-RU/basics']}>
                <Routes>
                    <Route
                        path="/news/:locale/:slug"
                        element={
                            <ArticleScreen
                                client={createIdentityClient({ baseUrl: '/v1' }, 'WEB')}
                                online={false}
                                signedIn={false}
                            />
                        }
                    />
                </Routes>
            </MemoryRouter>
        );
        expect(await screen.findByText(/Это сохранённая версия/u)).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: article.title })).toBeInTheDocument();
        expect(fetch).not.toHaveBeenCalled();
    });

    it('sends search text only in a POST body', async () => {
        const page: components['schemas']['PublicArticlePage'] = {
            items: [article],
            pageInfo: { hasMore: false, nextCursor: null },
            snapshotAt: '2026-09-12T12:00:00.000Z',
        };
        const fetch = vi.fn((input: RequestInfo | URL, options?: RequestInit) => {
            void input;
            void options;
            return response(page);
        });
        vi.stubGlobal('fetch', fetch);
        render(
            <MemoryRouter>
                <NewsFeed client={createIdentityClient({ baseUrl: '/v1' }, 'WEB')} online />
            </MemoryRouter>
        );
        await screen.findByText(article.title);
        fireEvent.change(screen.getByLabelText('Поиск по материалам'), { target: { value: 'секретный запрос' } });
        const form = screen.getByRole('button', { name: 'Найти' }).closest('form');
        if (!form) throw new Error('Search form was not rendered');
        fireEvent.submit(form);
        await waitFor(() => {
            expect(fetch).toHaveBeenCalledTimes(2);
        });
        const secondCall = fetch.mock.calls[1];
        if (!secondCall) throw new Error('Search request was not sent');
        const [target, options] = secondCall;
        expect(target).toBe('/v1/content/search');
        expect(options?.method).toBe('POST');
        expect(options?.body).toBe(JSON.stringify({ limit: 20, locale: 'ru-RU', query: 'секретный запрос' }));
        if (typeof target !== 'string') throw new Error('Expected a string request target');
        expect(target).not.toContain('секретный');
    });
});
