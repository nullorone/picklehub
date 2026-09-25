import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { HealthController } from '../src/health.controller.js';

test('liveness succeeds without checking dependencies', () => {
    const controller = new HealthController({
        isAvailable: async () => false,
    } as never);
    assert.deepEqual(controller.live(), { status: 'ok' });
});

test('readiness reports database availability', async () => {
    const ready = new HealthController({
        isAvailable: async () => true,
    } as never);
    const unavailable = new HealthController({
        isAvailable: async () => false,
    } as never);
    assert.deepEqual(await ready.ready(), { status: 'ok' });
    await assert.rejects(unavailable.ready(), (error: unknown) => {
        assert.ok(error instanceof HttpException);
        assert.equal(error.getStatus(), 503);
        assert.deepEqual(error.getResponse(), { status: 'unavailable' });
        return true;
    });
});
