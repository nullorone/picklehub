import type { Meta, StoryObj } from '@storybook/react-vite';
import { Provider } from 'react-redux';
import { useState } from 'react';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { LocationDialog } from '../../../frontend/tg/src/pages/Main/ui/LocationDialog';
import { createAppStore } from '../../../frontend/tg/src/store/store';
import { detectLocation, locationSelected } from '../../../frontend/tg/src/store/locationSlice';

const meta = {
    title: 'Mini App/LocationDialog',
    component: LocationDialog,
    args: { locations: ['Москва', 'Казань'] },
    decorators: [
        function Decorator(Story) {
            const [store] = useState(createAppStore);
            return (
                <Provider store={store}>
                    <Story />
                </Provider>
            );
        },
    ],
} satisfies Meta<typeof LocationDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

function mockGeolocation(allowed: boolean, fails = false) {
    const originalGeo = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
    const originalPermissions = Object.getOwnPropertyDescriptor(navigator, 'permissions');
    const getCurrentPosition = fn((success: PositionCallback, error?: PositionErrorCallback | null) => {
        if (fails) {
            error?.({ code: 1, message: '', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });
        } else {
            success({
                coords: {
                    latitude: 55,
                    longitude: 37,
                    accuracy: 100,
                    altitude: null,
                    altitudeAccuracy: null,
                    heading: null,
                    speed: null,
                },
                timestamp: 0,
            } as GeolocationPosition);
        }
    });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
    Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value: { query: () => Promise.resolve({ state: allowed ? 'granted' : 'prompt' }) },
    });
    return () => {
        if (originalGeo) Object.defineProperty(navigator, 'geolocation', originalGeo);
        else Reflect.deleteProperty(navigator, 'geolocation');
        if (originalPermissions) Object.defineProperty(navigator, 'permissions', originalPermissions);
        else Reflect.deleteProperty(navigator, 'permissions');
    };
}

export const AlreadyAllowed: Story = {
    beforeEach: () => mockGeolocation(true),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const page = within(canvasElement.ownerDocument.body);
        await userEvent.click(canvas.getByRole('button', { name: 'Локации' }));
        const dialog = within(await page.findByRole('dialog'));
        await waitFor(() =>
            expect(dialog.getByRole('region', { name: 'Выбранная локация' })).toHaveTextContent(
                'Текущее местоположение'
            )
        );
        await expect(dialog.getByRole('region', { name: 'Выбранная локация' })).toHaveTextContent(
            'Определена по геолокации'
        );
        await userEvent.click(dialog.getByRole('radio', { name: 'Казань' }));
        await userEvent.click(dialog.getByRole('button', { name: 'Применить' }));
        await expect(canvas.getByRole('button', { name: 'Локации' })).toHaveAttribute('title', 'Казань');
    },
};

export const PermissionDenied: Story = {
    beforeEach: () => mockGeolocation(false, true),
    play: async ({ canvasElement }) => {
        const canvas = within(canvasElement);
        const page = within(canvasElement.ownerDocument.body);
        await userEvent.click(canvas.getByRole('button', { name: 'Локации' }));
        const dialog = within(await page.findByRole('dialog'));
        await expect(dialog.getByRole('region', { name: 'Выбранная локация' })).toHaveTextContent('Локация не выбрана');
        await userEvent.click(dialog.getByRole('button', { name: 'Текущая' }));
        await waitFor(() => expect(dialog.getByRole('alert')).toBeVisible());
        await userEvent.click(dialog.getByRole('radio', { name: 'Москва' }));
        await userEvent.click(dialog.getByRole('button', { name: 'Применить' }));
        await expect(canvas.getByRole('button', { name: 'Локации' })).toHaveAttribute('title', 'Москва');
    },
};

export const ManualChoiceWins: Story = {
    beforeEach: () => mockGeolocation(false),
    play: async () => {
        const store = createAppStore();
        store.dispatch(detectLocation.pending('request', { requestPermission: false }));
        store.dispatch(locationSelected('Казань'));
        store.dispatch(
            detectLocation.fulfilled(
                { source: 'device', name: 'Текущее местоположение', latitude: 55, longitude: 37, accuracy: 100 },
                'request',
                { requestPermission: false }
            )
        );
        await expect(store.getState().location.selected).toEqual({ source: 'manual', name: 'Казань' });
        await store.dispatch(detectLocation({ requestPermission: false }));
        await expect(store.getState().location.selected).toEqual({ source: 'manual', name: 'Казань' });
    },
};
