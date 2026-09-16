import { UnauthorizedException } from '@nestjs/common';

import type { Environment } from '../../src/common/config/environment';
import { OperationsController } from '../../src/operations/operations.controller';

describe('OperationsController', () => {
    it('marks an unauthorized metrics response as non-cacheable', async () => {
        const environment = {
            OPERATIONS_METRICS_KEY: 'test-operations-key-with-at-least-32-characters',
        } as Environment;
        const controller = new OperationsController(environment, {} as never, {} as never, {} as never);
        const response = { setHeader: jest.fn() };

        await expect(controller.scrape(undefined, response as never)).rejects.toBeInstanceOf(UnauthorizedException);
        expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    });
});
