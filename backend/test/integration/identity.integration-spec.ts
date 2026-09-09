import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';

import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import { Clock } from '../../src/identity/clock';
import { ClientPlatform } from '../../src/identity/identity.dto';
import { EmailProvider } from '../../src/identity/email-provider';
import { IdentityCryptoService } from '../../src/identity/identity-crypto.service';
import { IdempotencyService } from '../../src/identity/idempotency.service';
import { IdentityService } from '../../src/identity/identity.service';
import { FakeClock } from '../fakes/fake-clock';
import { FakeEmailProvider } from '../fakes/fake-email-provider';

describe('identity transaction invariants', () => {
    const now = new Date('2026-09-09T09:00:00.000Z');
    let application: INestApplication;
    let prisma: PrismaService;
    let identity: IdentityService;
    let crypto: IdentityCryptoService;
    let idempotency: IdempotencyService;
    const email = new FakeEmailProvider();

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(Clock)
            .useValue(new FakeClock(now))
            .overrideProvider(EmailProvider)
            .useValue(email)
            .compile();
        application = module.createNestApplication();
        configureApplication(application);
        await application.init();
        prisma = application.get(PrismaService);
        identity = application.get(IdentityService);
        crypto = application.get(IdentityCryptoService);
        idempotency = application.get(IdempotencyService);
    });

    afterAll(async () => {
        await application.close();
    });

    it('consumes one Telegram proof once under concurrent login', async () => {
        const subject = `concurrent-${crypto.secret()}`;
        const proof = {
            subject,
            subjectKey: crypto.hash(`TELEGRAM:${subject}`),
            subjectCiphertext: crypto.encrypt(subject),
            fingerprint: crypto.hash(`proof:${subject}`),
            expiresAt: new Date(now.getTime() + 300_000),
        };

        const results = await Promise.allSettled([
            identity.loginTelegram(proof, ClientPlatform.WEB),
            identity.loginTelegram(proof, ClientPlatform.WEB),
        ]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        await expect(
            prisma.identity.count({ where: { provider: 'TELEGRAM', subjectKey: proof.subjectKey } })
        ).resolves.toBe(1);
        await expect(
            prisma.session.count({ where: { user: { identities: { some: { subjectKey: proof.subjectKey } } } } })
        ).resolves.toBe(1);
    });

    it('keeps email login neutral and credentials out of JSON and storage', async () => {
        const server = application.getHttpServer() as unknown as Server;
        const context = await request(server).get('/v1/auth/context').set('Origin', 'https://localhost').expect(200);
        const contextBody = context.body as { csrfToken: string };
        const contextCookies = context.headers['set-cookie'] as unknown as string[];
        const contextCookie = contextCookies[0]?.split(';')[0];
        if (contextCookie === undefined) throw new Error('Context cookie was not issued');

        const address = `Player-${crypto.secret().slice(0, 8)}@example.test`;
        const requested = await request(server)
            .post('/v1/auth/magic-links/request')
            .set('Origin', 'https://localhost')
            .set('X-CSRF-Token', contextBody.csrfToken)
            .set('Cookie', contextCookie)
            .send({ email: address, platform: 'WEB' })
            .expect(202);
        expect(requested.body).toEqual({
            status: 'ACCEPTED',
            message: 'Если адрес можно использовать, письмо со ссылкой придёт в ближайшее время',
        });
        expect(requested.headers['cache-control']).toBe('no-store');
        const delivered = email.messages.at(-1);
        if (delivered === undefined) throw new Error('Fake email provider did not receive a link');
        const token = new URL(delivered.link).hash.replace('#token=', '');

        const consumed = await request(server)
            .post('/v1/auth/magic-links/consume')
            .set('Origin', 'https://localhost')
            .set('X-CSRF-Token', contextBody.csrfToken)
            .set('Cookie', contextCookie)
            .send({ token, platform: 'WEB' })
            .expect(200);
        const consumedBody = consumed.body as { accessToken: string; refreshToken?: string };
        expect(consumedBody.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
        expect(consumedBody.refreshToken).toBeUndefined();
        expect(JSON.stringify(consumed.body)).not.toContain(token);

        const stored = await prisma.magicLink.findUniqueOrThrow({ where: { tokenHash: crypto.hash(token) } });
        expect(Buffer.from(stored.subjectCiphertext).toString('utf8')).not.toContain(address.toLowerCase());
        await request(server)
            .get('/v1/me')
            .set('Authorization', `Bearer ${consumedBody.accessToken}`)
            .expect(200)
            .expect('Cache-Control', 'no-store');
    });

    it('revokes the family when a rotated refresh credential is replayed', async () => {
        const subject = `refresh-${crypto.secret()}`;
        const login = await identity.loginTelegram(
            {
                subject,
                subjectKey: crypto.hash(`TELEGRAM:${subject}`),
                subjectCiphertext: crypto.encrypt(subject),
                fingerprint: crypto.hash(`proof:${subject}`),
                expiresAt: new Date(now.getTime() + 300_000),
            },
            ClientPlatform.WEB
        );
        const oldRefresh = login.refreshToken;
        if (oldRefresh === undefined) throw new Error('Test login did not issue refresh');
        const rotated = await identity.refresh(oldRefresh);

        await expect(identity.refresh(oldRefresh)).rejects.toMatchObject({ code: 'SESSION_INVALID' });
        await expect(identity.authenticate(`Bearer ${rotated.accessToken ?? ''}`)).rejects.toMatchObject({
            code: 'SESSION_INVALID',
        });
        await expect(prisma.session.findUniqueOrThrow({ where: { id: login.session.id } })).resolves.toMatchObject({
            revokedAt: now,
        });
    });

    it('encrypts and replays an idempotent draft mutation exactly once', async () => {
        const subject = `idempotency-${crypto.secret()}`;
        const login = await identity.loginTelegram(
            {
                subject,
                subjectKey: crypto.hash(`TELEGRAM:${subject}`),
                subjectCiphertext: crypto.encrypt(subject),
                fingerprint: crypto.hash(`proof:${subject}`),
                expiresAt: new Date(now.getTime() + 300_000),
            },
            ClientPlatform.WEB
        );
        const key = 'ca978112-ca1b-4dca-bac2-31b39a23dc4d';
        const body = { expectedVersion: 0, displayName: 'Игрок' };
        const execute = () =>
            idempotency.execute(login.session.userId, key, 'PATCH', '/v1/me/onboarding', body, (transaction) =>
                identity.updateDraft(login, body, transaction)
            );

        await expect(execute()).resolves.toMatchObject({ replayed: false });
        await expect(execute()).resolves.toMatchObject({ replayed: true });
        await expect(
            prisma.playerProfileDraft.findUniqueOrThrow({ where: { userId: login.session.userId } })
        ).resolves.toMatchObject({ version: 1, displayName: 'Игрок' });
        const record = await prisma.identityIdempotencyRecord.findFirstOrThrow({
            where: { userId: login.session.userId },
        });
        expect(Buffer.from(record.responseCiphertext).toString('utf8')).not.toContain('Игрок');
    });

    it('keeps locality cursors bound to user, query and catalogue version', async () => {
        const marker = crypto.secret().slice(0, 8);
        const ids = [uuidV7(), uuidV7(), uuidV7()];
        await prisma.onboardingLocality.createMany({
            data: ids.map((id, index) => ({
                id,
                name: `${marker}-${String(index)}`,
                countryCode: 'RU',
                region: 'Тестовый регион',
                catalogueVersion: 1,
            })),
        });
        const first = (await identity.localities('user-a', marker, 2)) as {
            items: object[];
            pageInfo: { nextCursor: string | null; hasMore: boolean };
        };
        expect(first.items).toHaveLength(2);
        expect(first.pageInfo.hasMore).toBe(true);
        if (first.pageInfo.nextCursor === null) throw new Error('Expected a second locality page');

        const second = (await identity.localities('user-a', marker, 2, first.pageInfo.nextCursor)) as {
            items: object[];
            pageInfo: { nextCursor: string | null; hasMore: boolean };
        };
        expect(second.items).toHaveLength(1);
        expect(second.pageInfo).toEqual({ nextCursor: null, hasMore: false });
        await expect(identity.localities('user-b', marker, 2, first.pageInfo.nextCursor)).rejects.toMatchObject({
            code: 'INVALID_CURSOR',
        });
        await prisma.onboardingLocality.deleteMany({ where: { id: { in: ids } } });
    });
});
