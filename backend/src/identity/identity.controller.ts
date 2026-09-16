import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Req,
    Res,
    UseInterceptors,
} from '@nestjs/common';
import type { ConsentPurpose } from '@prisma/client';
import type { Request, Response } from 'express';

import { BrowserSecurityService } from './browser-security.service';
import {
    CompleteOnboardingDto,
    ClientPlatform,
    ConsentChangeDto,
    DeleteAccountDto,
    EmailProofConsumeDto,
    EmailProofRequestDto,
    EmailRequestDto,
    EmptyDto,
    FinishAttemptDto,
    MagicConsumeDto,
    NativeEmailRequestDto,
    NativeMagicConsumeDto,
    NativeRefreshDto,
    StartAttemptDto,
    TelegramLoginDto,
    TelegramProofDto,
    UpdateDraftDto,
} from './identity.dto';
import { identityError } from './identity.errors';
import { IdentityAttemptService } from './identity-attempt.service';
import { IdentityCryptoService } from './identity-crypto.service';
import { IdempotencyService } from './idempotency.service';
import { IdentityRateLimitService } from './rate-limit.service';
import { IdentityService, type AuthenticatedIdentity } from './identity.service';
import { IdentityMetricsService } from './identity-metrics.service';
import { NoStoreInterceptor } from './no-store.interceptor';
import { TelegramVerifierService } from './telegram-verifier.service';

const MAGIC_ACCEPTED = {
    status: 'ACCEPTED',
    message: 'Если адрес можно использовать, письмо со ссылкой придёт в ближайшее время',
};

@Controller()
@UseInterceptors(NoStoreInterceptor)
export class IdentityController {
    constructor(
        private readonly identity: IdentityService,
        private readonly attempts: IdentityAttemptService,
        private readonly browser: BrowserSecurityService,
        private readonly telegram: TelegramVerifierService,
        private readonly limits: IdentityRateLimitService,
        private readonly crypto: IdentityCryptoService,
        private readonly idempotency: IdempotencyService,
        private readonly metrics: IdentityMetricsService
    ) {}

    @Get('auth/context')
    async context(@Req() request: Request, @Res({ passthrough: true }) response: Response): Promise<object> {
        await this.limitIp(request, 'context', 30, 60);
        return this.browser.context(request, response);
    }

    @Post('auth/telegram')
    @HttpCode(200)
    async loginTelegram(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: TelegramLoginDto
    ): Promise<object> {
        await this.browser.assertMutation(request);
        await this.limitIp(request, 'telegram', 20, 300);
        const proof = this.telegram.verify(body.initData);
        await this.limits.consume(`telegram-subject:${proof.subjectKey}`, 10, 300);
        return this.credentialResponse(await this.identity.loginTelegram(proof, body.platform), response);
    }

    @Post('auth/magic-links/request')
    @HttpCode(202)
    async requestMagic(@Req() request: Request, @Body() body: EmailRequestDto): Promise<object> {
        await this.browser.assertMutation(request);
        await this.limitIp(request, 'magic-request-10m', 10, 600);
        await this.limitIp(request, 'magic-request-hour', 30, 3600);
        const email = this.identity.normalizeEmail(body.email);
        const allowed =
            (await this.limits.consume(`magic-login-address-minute:${this.crypto.hash(email)}`, 1, 60, true)) &&
            (await this.limits.consume(`magic-login-address-hour:${this.crypto.hash(email)}`, 5, 3600, true));
        await this.identity.requestLoginEmail(email, body.platform, allowed);
        return MAGIC_ACCEPTED;
    }

    @Post('auth/magic-links/consume')
    @HttpCode(200)
    async consumeMagic(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: MagicConsumeDto
    ): Promise<object> {
        await this.browser.assertMutation(request);
        await this.limitIp(request, 'magic-consume', 10, 300);
        return this.credentialResponse(await this.identity.consumeLoginEmail(body.token, body.platform), response);
    }

    @Post('auth/mobile/magic-links/request')
    @HttpCode(202)
    async requestNativeMagic(@Req() request: Request, @Body() body: NativeEmailRequestDto): Promise<object> {
        this.metrics.increment('mobile_auth_total', { action: 'request' });
        this.browser.assertNativeMutation(request);
        await this.limitIp(request, 'magic-request-10m', 10, 600);
        await this.limitIp(request, 'magic-request-hour', 30, 3600);
        const email = this.identity.normalizeEmail(body.email);
        const allowed =
            (await this.limits.consume(`magic-login-address-minute:${this.crypto.hash(email)}`, 1, 60, true)) &&
            (await this.limits.consume(`magic-login-address-hour:${this.crypto.hash(email)}`, 5, 3600, true));
        await this.identity.requestNativeLoginEmail(email, body.codeChallenge, body.destination, allowed);
        return MAGIC_ACCEPTED;
    }

    @Post('auth/mobile/magic-links/consume')
    @HttpCode(200)
    async consumeNativeMagic(@Req() request: Request, @Body() body: NativeMagicConsumeDto): Promise<object> {
        this.metrics.increment('mobile_auth_total', { action: 'consume' });
        this.browser.assertNativeMutation(request);
        await this.limitIp(request, 'magic-consume', 10, 300);
        const result = await this.identity.consumeNativeLoginEmail(body.token, body.codeVerifier);
        return this.identity.nativeResponse(result.auth, result.destination);
    }

    @Post('auth/mobile/refresh')
    @HttpCode(200)
    async refreshNative(@Req() request: Request, @Body() body: NativeRefreshDto): Promise<object> {
        this.metrics.increment('mobile_auth_total', { action: 'refresh' });
        this.browser.assertNativeMutation(request);
        await this.limitIp(request, 'refresh', 120, 300);
        await this.limits.consume(`refresh:family:${this.crypto.hash(body.refreshToken)}`, 30, 300);
        return this.identity.nativeResponse(await this.identity.refresh(body.refreshToken, [ClientPlatform.MOBILE]));
    }

    @Post('auth/mobile/logout')
    @HttpCode(200)
    async logoutNative(@Req() request: Request, @Body() body: NativeRefreshDto): Promise<object> {
        this.metrics.increment('mobile_auth_total', { action: 'logout' });
        this.browser.assertNativeMutation(request);
        await this.limitIp(request, 'logout', 30, 60);
        await this.identity.logout(body.refreshToken, [ClientPlatform.MOBILE]);
        return { status: 'SIGNED_OUT' };
    }

    @Post('auth/refresh')
    @HttpCode(200)
    async refresh(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() _body: EmptyDto
    ): Promise<object> {
        void _body;
        await this.browser.assertMutation(request);
        await this.limitIp(request, 'refresh', 120, 300);
        const refreshToken = this.browser.refreshToken(request);
        if (refreshToken !== undefined) {
            await this.limits.consume(`refresh:family:${this.crypto.hash(refreshToken)}`, 30, 300);
        }
        return this.credentialResponse(
            await this.identity.refresh(refreshToken, [ClientPlatform.WEB, ClientPlatform.TMA]),
            response
        );
    }

    @Post('auth/logout')
    @HttpCode(200)
    async logout(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() _body: EmptyDto
    ): Promise<object> {
        void _body;
        await this.browser.assertMutation(request);
        await this.limitIp(request, 'logout', 30, 60);
        await this.identity.logout(this.browser.refreshToken(request), [ClientPlatform.WEB, ClientPlatform.TMA]);
        this.browser.clearRefresh(response);
        return { status: 'SIGNED_OUT' };
    }

    @Post('auth/logout-all')
    @HttpCode(200)
    async logoutAll(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Headers('authorization') authorization: string | undefined,
        @Body() _body: EmptyDto
    ): Promise<object> {
        void _body;
        const auth = await this.authenticateMutation(request, authorization);
        await this.identity.logoutAll(auth);
        this.browser.clearRefresh(response);
        return { status: 'SIGNED_OUT' };
    }

    @Get('me')
    async me(@Headers('authorization') authorization: string | undefined): Promise<object> {
        return this.identity.getMe(await this.identity.authenticate(authorization));
    }

    @Get('me/identities')
    async identities(@Headers('authorization') authorization: string | undefined): Promise<object> {
        const auth = await this.identity.authenticate(authorization);
        return {
            items: auth.session.user.identities.map((item) => ({
                id: item.id,
                provider: item.provider,
                linkedAt: item.linkedAt.toISOString(),
            })),
        };
    }

    @Post('me/identity-attempts')
    @HttpCode(200)
    async startAttempt(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() body: StartAttemptDto
    ): Promise<object> {
        const key = this.assertIdempotencyKey(idempotencyKey);
        const auth = await this.authenticateMutation(request, authorization);
        if (auth.session.platform === 'MOBILE' && body.action === 'LINK' && body.targetProvider === 'TELEGRAM') {
            throw identityError('REQUEST_NOT_ALLOWED', 403);
        }
        await this.limitIp(request, 'identity-attempt', 20, 3600);
        await this.limits.consume(`identity-attempt:user:${auth.session.userId}`, 5, 3600);
        const result = await this.idempotency.execute(
            auth.session.userId,
            key,
            'POST',
            '/v1/me/identity-attempts',
            body,
            (transaction) => this.attempts.start(auth, body, transaction)
        );
        this.setReplayed(response, result.replayed);
        return result.value;
    }

    @Get('me/identity-attempts/:attemptId')
    async getAttempt(
        @Headers('authorization') authorization: string | undefined,
        @Param('attemptId', new ParseUUIDPipe()) attemptId: string
    ): Promise<object> {
        return this.attempts.get(await this.identity.authenticate(authorization), attemptId);
    }

    @Post('me/identity-attempts/:attemptId/telegram')
    @HttpCode(200)
    async proveTelegram(
        @Req() request: Request,
        @Headers('authorization') authorization: string | undefined,
        @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
        @Body() body: TelegramProofDto
    ): Promise<object> {
        const auth = await this.authenticateMutation(request, authorization);
        if (auth.session.platform === 'MOBILE') throw identityError('REQUEST_NOT_ALLOWED', 403);
        await this.limitIp(request, 'telegram', 20, 300);
        const proof = this.telegram.verify(body.initData);
        await this.limits.consume(`telegram-subject:${proof.subjectKey}`, 10, 300);
        return this.attempts.proveTelegram(auth, attemptId, body.side, proof);
    }

    @Post('me/identity-attempts/:attemptId/email/request')
    @HttpCode(202)
    async requestProof(
        @Req() request: Request,
        @Headers('authorization') authorization: string | undefined,
        @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
        @Body() body: EmailProofRequestDto
    ): Promise<object> {
        await this.limitIp(request, 'magic-request-10m', 10, 600);
        const auth = await this.authenticateMutation(request, authorization);
        const email = this.identity.normalizeEmail(body.email);
        const allowed =
            (await this.limits.consume(`magic-proof-address-minute:${this.crypto.hash(email)}`, 1, 60, true)) &&
            (await this.limits.consume(`magic-proof-address-hour:${this.crypto.hash(email)}`, 5, 3600, true));
        await this.attempts.requestEmailProof(auth, attemptId, body.side, email, allowed);
        return MAGIC_ACCEPTED;
    }

    @Post('me/identity-attempts/:attemptId/email/consume')
    @HttpCode(200)
    async consumeProof(
        @Req() request: Request,
        @Headers('authorization') authorization: string | undefined,
        @Param('attemptId', new ParseUUIDPipe()) attemptId: string,
        @Body() body: EmailProofConsumeDto
    ): Promise<object> {
        const auth = await this.authenticateMutation(request, authorization);
        await this.limitIp(request, 'magic-consume', 10, 300);
        return this.attempts.consumeEmailProof(auth, attemptId, body.token);
    }

    @Post('me/identities/link')
    @HttpCode(200)
    async link(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Headers('authorization') authorization: string | undefined,
        @Body() body: FinishAttemptDto
    ): Promise<object> {
        const auth = await this.authenticateMutation(request, authorization);
        return this.sessionCredentialResponse(await this.attempts.link(auth, body.attemptId), response);
    }

    @Post('me/identities/:identityId/unlink')
    @HttpCode(200)
    async unlink(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Headers('authorization') authorization: string | undefined,
        @Param('identityId', new ParseUUIDPipe()) identityId: string,
        @Body() body: FinishAttemptDto
    ): Promise<object> {
        const auth = await this.authenticateMutation(request, authorization);
        return this.sessionCredentialResponse(await this.attempts.unlink(auth, identityId, body.attemptId), response);
    }

    @Get('me/onboarding')
    async onboarding(@Headers('authorization') authorization: string | undefined): Promise<object> {
        return this.identity.getOnboarding(await this.identity.authenticate(authorization));
    }

    @Patch('me/onboarding')
    async saveOnboarding(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() body: UpdateDraftDto
    ): Promise<object> {
        const key = this.assertIdempotencyKey(idempotencyKey);
        const auth = await this.authenticateMutation(request, authorization);
        await this.mutationLimit(request, auth);
        const result = await this.idempotency.execute(
            auth.session.userId,
            key,
            'PATCH',
            '/v1/me/onboarding',
            body,
            (transaction) => this.identity.updateDraft(auth, body, transaction)
        );
        this.setReplayed(response, result.replayed);
        return result.value;
    }

    @Post('me/onboarding/complete')
    @HttpCode(200)
    async completeOnboarding(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() body: CompleteOnboardingDto
    ): Promise<object> {
        const key = this.assertIdempotencyKey(idempotencyKey);
        const auth = await this.authenticateMutation(request, authorization);
        await this.mutationLimit(request, auth);
        const result = await this.idempotency.execute(
            auth.session.userId,
            key,
            'POST',
            '/v1/me/onboarding/complete',
            body,
            (transaction) => this.identity.completeOnboarding(auth, body, transaction)
        );
        this.setReplayed(response, result.replayed);
        return result.value;
    }

    @Get('me/consents')
    async consents(
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20',
        @Query('cursor') cursor?: string
    ): Promise<object> {
        return this.identity.listConsents(
            await this.identity.authenticate(authorization),
            this.parseLimit(limit),
            cursor
        );
    }

    @Post('me/consents')
    @HttpCode(200)
    async changeConsent(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') idempotencyKey: string | undefined,
        @Body() body: ConsentChangeDto
    ): Promise<object> {
        const key = this.assertIdempotencyKey(idempotencyKey);
        const auth = await this.authenticateMutation(request, authorization);
        await this.mutationLimit(request, auth);
        const result = await this.idempotency.execute(
            auth.session.userId,
            key,
            'POST',
            '/v1/me/consents',
            body,
            (transaction) => this.identity.changeConsent(auth, body, key, transaction)
        );
        this.setReplayed(response, result.replayed);
        return result.value;
    }

    @Post('me/deletion')
    @HttpCode(202)
    async deleteAccount(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Headers('authorization') authorization: string | undefined,
        @Body() body: DeleteAccountDto
    ): Promise<object> {
        const auth = await this.authenticateMutation(request, authorization);
        await this.limitIp(request, 'deletion', 10, 3600);
        await this.limits.consume(`deletion:user:${auth.session.userId}`, 3, 3600);
        const requestedAt = await this.attempts.deleteAccount(auth, body.attemptId);
        this.browser.clearRefresh(response);
        return { status: 'DELETION_PENDING', requestedAt: requestedAt.toISOString() };
    }

    @Get('identity/documents')
    async documents(@Req() request: Request): Promise<object> {
        await this.limitIp(request, 'documents', 60, 60);
        return this.identity.listDocuments();
    }

    @Get('identity/documents/:purpose/:version')
    async document(@Param('purpose') purpose: string, @Param('version') version: string): Promise<object> {
        if (!['TERMS', 'PERSONAL_DATA', 'ANALYTICS', 'MARKETING'].includes(purpose)) {
            throw identityError('DOCUMENT_NOT_FOUND', 404);
        }
        return this.identity.getDocument(purpose as ConsentPurpose, version);
    }

    @Get('identity/onboarding-options')
    async options(@Headers('authorization') authorization: string | undefined): Promise<object> {
        await this.identity.authenticate(authorization);
        return this.identity.onboardingOptions();
    }

    @Get('identity/onboarding-options/localities')
    async localities(
        @Headers('authorization') authorization: string | undefined,
        @Query('query') query?: string,
        @Query('limit') limit = '20',
        @Query('cursor') cursor?: string
    ): Promise<object> {
        const auth = await this.identity.authenticate(authorization);
        return this.identity.localities(auth.session.userId, query, this.parseLimit(limit), cursor);
    }

    private async credentialResponse(auth: AuthenticatedIdentity, response: Response): Promise<object> {
        if (auth.refreshToken === undefined) throw new Error('Missing refresh token');
        const maximum = Math.max(0, Math.floor((auth.session.idleExpiresAt.getTime() - Date.now()) / 1000));
        this.browser.setRefresh(response, auth.refreshToken, maximum);
        const context = await this.browser.rotateContext(response);
        return { ...this.identity.response(auth), csrfToken: context.csrfToken };
    }

    private async sessionCredentialResponse(auth: AuthenticatedIdentity, response: Response): Promise<object> {
        return auth.session.platform === 'MOBILE'
            ? this.identity.nativeResponse(auth)
            : await this.credentialResponse(auth, response);
    }

    private async limitIp(request: Request, name: string, count: number, seconds: number): Promise<void> {
        await this.limits.consume(`${name}:ip:${this.crypto.hash(request.ip ?? 'unknown')}`, count, seconds);
    }

    private assertIdempotencyKey(value: string | undefined): string {
        if (
            value === undefined ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value)
        ) {
            throw identityError('VALIDATION_FAILED', 400);
        }
        return value;
    }

    private setReplayed(response: Response, replayed: boolean): void {
        if (replayed) response.setHeader('Idempotency-Replayed', 'true');
    }

    private async mutationLimit(request: Request, auth: AuthenticatedIdentity): Promise<void> {
        await this.limitIp(request, 'self-mutation', 120, 60);
        await this.limits.consume(`self-mutation:user:${auth.session.userId}`, 30, 60);
    }

    private async authenticateMutation(
        request: Request,
        authorization: string | undefined
    ): Promise<AuthenticatedIdentity> {
        const auth = await this.identity.authenticate(authorization);
        await this.browser.assertSessionMutation(request, auth.session.platform);
        return auth;
    }

    private parseLimit(value: string): number {
        const limit = Number(value);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw identityError('VALIDATION_FAILED', 400);
        return limit;
    }
}
