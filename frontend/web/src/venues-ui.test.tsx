// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { components, IdentityClient } from '@picklehub/api-client';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VenuesScreen } from './venues-ui';

vi.mock('./venue-map', () => ({
    VenueMap: ({
        onBoundsChanged,
    }: {
        readonly onBoundsChanged: (bounds: { east: number; north: number; south: number; west: number }) => void;
    }) => (
        <button
            type="button"
            onClick={() => {
                onBoundsChanged({ west: 37.5, south: 55.7, east: 37.7, north: 55.8 });
            }}
        >
            Применить область карты
        </button>
    ),
}));

const venue: components['schemas']['VenueSummary'] = {
    accessMode: 'FREE',
    attribution: [
        {
            link: 'https://www.openstreetmap.org/copyright',
            observedAt: '2026-09-10T10:00:00.000Z',
            sourceKind: 'OPENSTREETMAP',
            text: '© OpenStreetMap contributors',
        },
    ],
    distanceMeters: 840,
    environment: 'OUTDOOR',
    id: '0181f32c-7b4a-4f35-8f30-c358f278cb9e',
    lastVerifiedAt: '2026-09-10T10:00:00.000Z',
    locality: 'Москва',
    location: { latitude: 55.75, longitude: 37.61 },
    name: 'Парк Пиклбол',
    normalizedAddress: 'Москва, Спортивная улица, 1',
    publicationState: 'PUBLISHED',
    verificationState: 'MODERATOR_VERIFIED',
    version: 1,
};

function client(items = [venue]) {
    return {
        createVenueCandidate: vi.fn(),
        searchVenueMap: vi.fn().mockResolvedValue({
            items,
            pageInfo: { hasMore: false, nextCursor: null },
            snapshotAt: '2026-09-10T10:00:00.000Z',
        }),
        searchVenues: vi.fn().mockResolvedValue({
            items,
            pageInfo: { hasMore: false, nextCursor: null },
            snapshotAt: '2026-09-10T10:00:00.000Z',
        }),
    } as unknown as IdentityClient;
}

describe('web venue catalogue', () => {
    afterEach(() => {
        cleanup();
    });

    it('keeps text and list search available when geolocation is denied', async () => {
        const api = client();
        Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
                getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) => {
                    error({} as GeolocationPositionError);
                },
            },
        });
        render(<VenuesScreen client={api} config={{ apiBaseUrl: '/v1', environment: 'test' }} online />);

        expect(await screen.findByRole('button', { name: /Парк Пиклбол/ })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Рядом со мной' }));
        expect(await screen.findByText(/Доступ к геолокации не дан/)).toBeInTheDocument();
        expect(screen.getByRole('textbox', { name: 'Название или адрес' })).toBeEnabled();
        expect(screen.getByText('© OpenStreetMap contributors')).toHaveAttribute(
            'href',
            'https://www.openstreetmap.org/copyright'
        );
    });

    it('shows an accessible list fallback when tiles are not configured', async () => {
        render(<VenuesScreen client={client()} config={{ apiBaseUrl: '/v1', environment: 'test' }} online />);
        await screen.findByRole('button', { name: /Парк Пиклбол/ });
        fireEvent.click(screen.getByRole('button', { name: 'Карта' }));
        expect(screen.getByText(/Карта не настроена/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Парк Пиклбол/ })).toBeInTheDocument();
    });

    it('sends the same filters to list and map queries', async () => {
        const api = client();
        render(
            <VenuesScreen
                client={api}
                config={{
                    apiBaseUrl: '/v1',
                    environment: 'test',
                    map: {
                        styleUrl: 'https://tiles.example.test/style.json',
                        attributionText: 'Тестовые тайлы',
                        attributionUrl: 'https://tiles.example.test/terms',
                    },
                }}
                online
            />
        );
        await screen.findByRole('button', { name: /Парк Пиклбол/ });
        fireEvent.change(screen.getByLabelText('Размещение'), { target: { value: 'OUTDOOR' } });
        await waitFor(() => {
            expect(api.searchVenues).toHaveBeenLastCalledWith(expect.objectContaining({ environment: 'OUTDOOR' }));
        });
        fireEvent.click(screen.getByRole('button', { name: 'Карта' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Применить область карты' }));
        await waitFor(() => {
            expect(api.searchVenueMap).toHaveBeenCalledWith(expect.objectContaining({ environment: 'OUTDOOR' }));
        });
    });

    it('reads the cached catalogue but keeps mutations disabled while offline', async () => {
        const api = client();
        render(<VenuesScreen client={api} config={{ apiBaseUrl: '/v1', environment: 'test' }} online={false} />);
        await waitFor(() => {
            expect(api.searchVenues).toHaveBeenCalledOnce();
        });
        expect(screen.getByText(/Показан сохранённый снимок каталога/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Найти' })).toBeDisabled();
    });

    it('blocks an obvious private residence before submission', async () => {
        const api = client();
        render(<VenuesScreen client={api} config={{ apiBaseUrl: '/v1', environment: 'test' }} online />);
        await screen.findByRole('button', { name: /Парк Пиклбол/ });
        fireEvent.click(screen.getByRole('button', { name: 'Новая площадка' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'Название' }), { target: { value: 'Частный дом' } });
        fireEvent.change(screen.getByRole('textbox', { name: 'Публичный адрес' }), { target: { value: 'Дача, 1' } });
        fireEvent.change(screen.getByRole('textbox', { name: 'Населённый пункт' }), { target: { value: 'Москва' } });
        fireEvent.change(screen.getByRole('textbox', { name: 'Широта' }), { target: { value: '55.75' } });
        fireEvent.change(screen.getByRole('textbox', { name: 'Долгота' }), { target: { value: '37.61' } });
        fireEvent.change(screen.getByRole('textbox', { name: 'ID создаваемого матча' }), {
            target: { value: crypto.randomUUID() },
        });
        fireEvent.click(screen.getByRole('checkbox'));
        fireEvent.click(screen.getByRole('button', { name: 'Добавить только в матч' }));
        expect(await screen.findByText(/Похоже на частный дом/)).toBeInTheDocument();
        expect(api.createVenueCandidate).not.toHaveBeenCalled();
    });
});
