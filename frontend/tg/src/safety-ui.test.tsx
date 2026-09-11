// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import type { IdentityClient } from '@picklehub/api-client';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SafetyReportScreen } from './safety-ui';

describe('TMA trust and safety parity', () => {
    afterEach(cleanup);

    it('keeps emergency guidance, offline mutation safety and the ad-free critical surface', () => {
        const client = { submitSafetyReport: vi.fn() } as unknown as IdentityClient;
        const { container } = render(
            <MemoryRouter
                initialEntries={[
                    '/safety/report?sourceKind=MATCH&sourceId=11111111-1111-4111-8111-111111111111&sourceRevision=1',
                ]}
            >
                <SafetyReportScreen client={client} online={false} />
            </MemoryRouter>
        );
        expect(screen.getByText(/Позвоните 112/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Отправить обращение' })).toBeDisabled();
        expect(container.querySelector('[data-ad-slot]')).not.toBeInTheDocument();
        expect(client.submitSafetyReport).not.toHaveBeenCalled();
    });
});
