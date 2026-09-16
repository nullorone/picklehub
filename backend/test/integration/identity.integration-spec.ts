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
import { IdentityAttemptService } from '../../src/identity/identity-attempt.service';
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
    let attempts: IdentityAttemptService;
    const clock = new FakeClock(now);
    const email = new FakeEmailProvider();

    beforeAll(async () => {
        const module = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(Clock)
            .useValue(clock)
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
        attempts = application.get(IdentityAttemptService);
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
        expect(contextCookies[0]).toContain('__Host-ph-context=');
        expect(contextCookies[0]).toContain('Path=/');
        expect(contextCookies[0]).toContain('HttpOnly');
        expect(contextCookies[0]).toContain('Secure');
        expect(contextCookies[0]).toContain('SameSite=Lax');
        expect(contextCookies[0]).not.toContain('Domain=');

        await request(server)
            .post('/v1/auth/magic-links/request')
            .set('Origin', 'https://evil.example')
            .set('X-CSRF-Token', contextBody.csrfToken)
            .set('Cookie', contextCookie)
            .send({ email: 'nobody@example.test', platform: 'WEB' })
            .expect(403)
            .expect('Cache-Control', 'no-store');
        await request(server)
            .post('/v1/auth/magic-links/request')
            .set('Origin', 'https://localhost')
            .set('X-CSRF-Token', 'wrong-csrf-value')
            .set('Cookie', contextCookie)
            .send({ email: 'nobody@example.test', platform: 'WEB' })
            .expect(403);

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
        const authCookies = consumed.headers['set-cookie'] as unknown as string[];
        const refreshCookie = authCookies.find((cookie) => cookie.startsWith('__Secure-ph-refresh='));
        expect(refreshCookie).toContain('Path=/v1/auth');
        expect(refreshCookie).toContain('HttpOnly');
        expect(refreshCookie).toContain('Secure');
        expect(refreshCookie).toContain('SameSite=Lax');
        expect(refreshCookie).not.toContain('Domain=');

        const stored = await prisma.magicLink.findUniqueOrThrow({ where: { tokenHash: crypto.hash(token) } });
        expect(Buffer.from(stored.subjectCiphertext).toString('utf8')).not.toContain(address.toLowerCase());
        await request(server)
            .get('/v1/me')
            .set('Authorization', `Bearer ${consumedBody.accessToken}`)
            .expect(200)
            .expect('Cache-Control', 'no-store');

        const repeated = await request(server)
            .post('/v1/auth/magic-links/request')
            .set('Origin', 'https://localhost')
            .set('X-CSRF-Token', contextBody.csrfToken)
            .set('Cookie', contextCookie)
            .send({ email: address, platform: 'WEB' })
            .expect(202);
        expect(repeated.body).toEqual(requested.body);
        expect(repeated.headers['cache-control']).toBe(requested.headers['cache-control']);
    });

    it('proof-binds, rotates and revokes a body-only mobile session', async () => {
        const server = application.getHttpServer() as unknown as Server;
        const verifier = `${crypto.secret()}native-verifier`;
        const address = `native-${crypto.secret().slice(0, 8)}@example.test`;
        await request(server)
            .post('/v1/auth/mobile/magic-links/request')
            .send({
                email: address,
                platform: 'MOBILE',
                codeChallenge: crypto.codeChallenge(verifier),
                destination: { kind: 'MATCH', matchId: uuidV7() },
            })
            .expect(202);
        const delivered = email.messages.at(-1);
        if (delivered === undefined) throw new Error('Fake email provider did not receive a native link');
        const token = new URL(delivered.link).hash.replace('#token=', '');

        await request(server)
            .post('/v1/auth/mobile/magic-links/consume')
            .send({ token, platform: 'MOBILE', codeVerifier: `${verifier}wrong` })
            .expect(401);
        const consumed = await request(server)
            .post('/v1/auth/mobile/magic-links/consume')
            .send({ token, platform: 'MOBILE', codeVerifier: verifier })
            .expect(200);
        const body = consumed.body as {
            accessToken: string;
            refreshToken: string;
            session: { id: string };
            destination: { kind: string; matchId: string };
        };
        expect(body.refreshToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
        expect(body.destination).toMatchObject({ kind: 'MATCH' });
        expect(consumed.headers['set-cookie']).toBeUndefined();
        await expect(prisma.session.findUniqueOrThrow({ where: { id: body.session.id } })).resolves.toMatchObject({
            platform: 'MOBILE',
        });
        await expect(
            identity.refresh(body.refreshToken, [ClientPlatform.WEB, ClientPlatform.TMA])
        ).rejects.toMatchObject({ code: 'SESSION_INVALID' });

        const rotated = await request(server)
            .post('/v1/auth/mobile/refresh')
            .send({ refreshToken: body.refreshToken })
            .expect(200);
        const rotatedBody = rotated.body as { accessToken: string; refreshToken: string; destination: null };
        expect(rotatedBody.refreshToken).not.toBe(body.refreshToken);
        expect(rotatedBody.destination).toBeNull();
        await request(server).post('/v1/auth/mobile/refresh').send({ refreshToken: body.refreshToken }).expect(401);
        await request(server).get('/v1/me').set('Authorization', `Bearer ${rotatedBody.accessToken}`).expect(401);
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

    it('allows only one concurrent consumer of a magic link', async () => {
        const address = `race-${crypto.secret().slice(0, 8)}@example.test`;
        await identity.requestLoginEmail(address, ClientPlatform.WEB);
        const delivered = email.messages.at(-1);
        if (delivered === undefined) throw new Error('Fake email provider did not receive a link');
        const token = new URL(delivered.link).hash.replace('#token=', '');

        const results = await Promise.allSettled([
            identity.consumeLoginEmail(token, ClientPlatform.WEB),
            identity.consumeLoginEmail(token, ClientPlatform.TMA),
        ]);

        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
        await expect(
            prisma.magicLink.findUniqueOrThrow({ where: { tokenHash: crypto.hash(token) } })
        ).resolves.toMatchObject({
            consumedAt: now,
        });
        await expect(
            prisma.session.count({
                where: { user: { identities: { some: { subjectKey: crypto.hash(`EMAIL:${address}`) } } } },
            })
        ).resolves.toBe(1);
    });

    it('lets only one account link a concurrently claimed identity and emits safe events', async () => {
        const targetAddress = `claimed-${crypto.secret().slice(0, 8)}@example.test`;
        const targetSubjectKey = crypto.hash(`EMAIL:${targetAddress}`);
        const logins = await Promise.all(
            ['first', 'second'].map((marker) => {
                const subject = `${marker}-${crypto.secret()}`;
                return identity.loginTelegram(
                    {
                        subject,
                        subjectKey: crypto.hash(`TELEGRAM:${subject}`),
                        subjectCiphertext: crypto.encrypt(subject),
                        fingerprint: crypto.hash(`proof:${subject}`),
                        expiresAt: new Date(now.getTime() + 300_000),
                    },
                    ClientPlatform.WEB
                );
            })
        );
        const attemptIds: string[] = [];
        for (const login of logins) {
            const started = (await attempts.start(login, { action: 'LINK', targetProvider: 'EMAIL' })) as {
                id: string;
            };
            const currentIdentity = login.session.user.identities[0];
            if (currentIdentity === undefined) throw new Error('Test login has no current identity');
            attemptIds.push(started.id);
            await prisma.identityAttempt.update({
                where: { id: started.id },
                data: {
                    currentProofExpiresAt: new Date(now.getTime() + 300_000),
                    currentProvider: 'TELEGRAM',
                    currentSubjectKey: currentIdentity.subjectKey,
                    targetEncryptionKeyVersion: 1,
                    targetProofExpiresAt: new Date(now.getTime() + 300_000),
                    targetSubjectCiphertext: crypto.encrypt(targetAddress),
                    targetSubjectKey,
                },
            });
        }

        const linkOperations = logins.map((login, index) => {
            const attemptId = attemptIds[index];
            if (attemptId === undefined) throw new Error('Test attempt was not created');
            return attempts.link(login, attemptId);
        });
        const results = await Promise.allSettled(linkOperations);
        expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
        expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
        await expect(
            prisma.identity.count({ where: { provider: 'EMAIL', subjectKey: targetSubjectKey } })
        ).resolves.toBe(1);
        const winner = results.find((result) => result.status === 'fulfilled');
        if (winner?.status !== 'fulfilled') throw new Error('Expected one successful link');
        const events = await prisma.outboxEvent.findMany({
            where: {
                type: 'identity.linked.v1',
                payload: { path: ['userId'], equals: winner.value.session.userId },
            },
        });
        expect(events).toHaveLength(1);
        expect(JSON.stringify(events)).not.toContain(targetAddress);
        expect(JSON.stringify(events)).not.toContain(targetSubjectKey);
    });

    it('accepts deletion once, revokes access and creates one minimal cleanup event', async () => {
        const subject = `delete-${crypto.secret()}`;
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
        const started = (await attempts.start(login, { action: 'DELETE_ACCOUNT' })) as { id: string };
        const currentIdentity = login.session.user.identities[0];
        if (currentIdentity === undefined) throw new Error('Test login has no current identity');
        await prisma.identityAttempt.update({
            where: { id: started.id },
            data: {
                currentProofExpiresAt: new Date(now.getTime() + 300_000),
                currentProvider: 'TELEGRAM',
                currentSubjectKey: currentIdentity.subjectKey,
            },
        });

        const server = application.getHttpServer() as unknown as Server;
        const context = await request(server).get('/v1/auth/context').set('Origin', 'https://localhost').expect(200);
        const contextBody = context.body as { csrfToken: string };
        const contextCookie = (context.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0];
        if (contextCookie === undefined || login.refreshToken === undefined) {
            throw new Error('Deletion test credentials were not issued');
        }
        const deleted = await request(server)
            .post('/v1/me/deletion')
            .set('Origin', 'https://localhost')
            .set('X-CSRF-Token', contextBody.csrfToken)
            .set('Authorization', `Bearer ${login.accessToken ?? ''}`)
            .set('Cookie', `${contextCookie}; __Secure-ph-refresh=${login.refreshToken}`)
            .send({ attemptId: started.id, confirmed: true })
            .expect(202)
            .expect('Cache-Control', 'no-store');
        expect(deleted.body).toEqual({ status: 'DELETION_PENDING', requestedAt: now.toISOString() });
        expect(deleted.headers['set-cookie']?.[0]).toContain('__Secure-ph-refresh=;');
        expect(deleted.headers['set-cookie']?.[0]).toContain('Max-Age=0');
        await expect(identity.authenticate(`Bearer ${login.accessToken ?? ''}`)).rejects.toMatchObject({
            code: 'SESSION_INVALID',
        });
        await expect(prisma.user.findUniqueOrThrow({ where: { id: login.session.userId } })).resolves.toMatchObject({
            status: 'DELETION_PENDING',
            deletionRequestedAt: now,
        });
        await expect(
            prisma.outboxEvent.count({
                where: {
                    type: 'identity.account.deletion.requested.v1',
                    payload: { path: ['userId'], equals: login.session.userId },
                },
            })
        ).resolves.toBe(1);
        await request(server)
            .post('/v1/me/deletion')
            .set('Origin', 'https://localhost')
            .set('X-CSRF-Token', contextBody.csrfToken)
            .set('Authorization', `Bearer ${login.accessToken ?? ''}`)
            .set('Cookie', contextCookie)
            .send({ attemptId: started.id, confirmed: true })
            .expect(401);
        await expect(
            prisma.outboxEvent.count({
                where: {
                    type: 'identity.account.deletion.requested.v1',
                    payload: { path: ['userId'], equals: login.session.userId },
                },
            })
        ).resolves.toBe(1);
    });

    it('rejects an expired magic link with the same public error as replay', async () => {
        const address = `expired-${crypto.secret().slice(0, 8)}@example.test`;
        await identity.requestLoginEmail(address, ClientPlatform.WEB);
        const delivered = email.messages.at(-1);
        if (delivered === undefined) throw new Error('Fake email provider did not receive a link');
        const token = new URL(delivered.link).hash.replace('#token=', '');
        clock.advance(600_000);

        await expect(identity.consumeLoginEmail(token, ClientPlatform.WEB)).rejects.toMatchObject({
            code: 'MAGIC_LINK_INVALID',
        });
        await expect(identity.consumeLoginEmail('x'.repeat(43), ClientPlatform.WEB)).rejects.toMatchObject({
            code: 'MAGIC_LINK_INVALID',
        });
    });
});
