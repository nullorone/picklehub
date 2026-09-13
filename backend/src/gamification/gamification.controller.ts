import {
    Body,
    Controller,
    Get,
    Headers,
    Param,
    ParseUUIDPipe,
    Put,
    Query,
    Req,
    Res,
    UseInterceptors,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { AdministrationSessionService } from '../administration/administration-session.service';
import { BrowserSecurityService } from '../identity/browser-security.service';
import { IdentityService } from '../identity/identity.service';
import { NoStoreInterceptor } from '../identity/no-store.interceptor';
import { IdentityRateLimitService } from '../identity/rate-limit.service';
import { LeaderboardConsentDto, UpdateClubGamificationDto } from './gamification.dto';
import { GamificationIdempotencyService } from './gamification-idempotency.service';
import { gamificationError } from './gamification.errors';
import { GamificationService } from './gamification.service';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Controller()
@UseInterceptors(NoStoreInterceptor)
export class GamificationController {
    constructor(
        private readonly gamification: GamificationService,
        private readonly identity: IdentityService,
        private readonly browser: BrowserSecurityService,
        private readonly limits: IdentityRateLimitService,
        private readonly idempotency: GamificationIdempotencyService,
        private readonly administration: AdministrationSessionService
    ) {}

    @Get('gamification/progress')
    async globalProgress(
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request
    ): Promise<object> {
        return this.gamification.globalProgress(await this.user(authorization, request));
    }

    @Get('clubs/:clubId/gamification/progress')
    async clubProgress(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request
    ): Promise<object> {
        return this.gamification.clubProgress(await this.user(authorization, request), clubId);
    }

    @Get('gamification/achievements')
    async achievements(
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request,
        @Query('limit') rawLimit = '20',
        @Query('cursor') cursor?: string
    ): Promise<object> {
        return this.gamification.achievements(await this.user(authorization, request), this.limit(rawLimit), cursor);
    }

    @Get('gamification/seasons/:seasonId/leaderboard')
    async leaderboard(
        @Param('seasonId', new ParseUUIDPipe()) seasonId: string,
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request,
        @Query('limit') rawLimit = '20',
        @Query('cursor') cursor?: string
    ): Promise<object> {
        return this.gamification.leaderboard(
            await this.user(authorization, request),
            seasonId,
            this.limit(rawLimit),
            cursor
        );
    }

    @Put('gamification/seasons/:seasonId/leaderboard-consent')
    async consent(
        @Param('seasonId', new ParseUUIDPipe()) seasonId: string,
        @Body() body: LeaderboardConsentDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.browser.assertMutation(request);
        const userId = await this.user(authorization, request);
        return this.mutation(
            userId,
            key,
            `/v1/gamification/seasons/${seasonId}/leaderboard-consent`,
            body,
            response,
            (tx) =>
                this.gamification.setConsent(
                    userId,
                    seasonId,
                    body.optedIn,
                    body.policyVersion,
                    body.expectedRevision,
                    tx
                )
        );
    }

    @Get('clubs/:clubId/gamification/configuration')
    async clubConfiguration(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request
    ): Promise<object> {
        return this.gamification.clubConfiguration(await this.user(authorization, request), clubId);
    }

    @Put('clubs/:clubId/gamification/configuration')
    async updateClubConfiguration(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Body() body: UpdateClubGamificationDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.browser.assertMutation(request);
        const userId = await this.user(authorization, request);
        return this.mutation(userId, key, `/v1/clubs/${clubId}/gamification/configuration`, body, response, (tx) =>
            this.gamification.updateClubConfiguration(userId, clubId, body, tx)
        );
    }

    @Get('gamification/admin/definitions')
    async adminDefinitions(@Headers('authorization') authorization: string | undefined): Promise<object> {
        const admin = await this.administration.authenticate(authorization);
        this.administration.assertCapability(admin, 'GAMIFICATION_DEFINITION_READ');
        return this.gamification.adminDefinitions();
    }

    private async user(authorization: string | undefined, request: Request): Promise<string> {
        const auth = await this.identity.authenticate(authorization);
        if (auth.session.user.completedAt === null) throw gamificationError('ONBOARDING_REQUIRED', 403);
        await this.limits.consume(`gamification-read:user:${auth.session.userId}`, 120, 60);
        await this.limits.consume(
            `gamification-read:ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`,
            240,
            60
        );
        return auth.session.userId;
    }

    private async mutation<T>(
        userId: string,
        key: string | undefined,
        path: string,
        body: object,
        response: Response,
        operation: Parameters<GamificationIdempotencyService['execute']>[4]
    ): Promise<T> {
        if (key === undefined || !UUID_V4.test(key)) throw gamificationError('VALIDATION_FAILED', 400);
        await this.limits.consume(`gamification-mutation:user:${userId}`, 30, 60);
        const result = await this.idempotency.execute(userId, key, path, body, operation);
        response.setHeader('Idempotency-Replayed', String(result.replayed));
        return result.value as T;
    }

    private limit(raw: string): number {
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 1 || value > 100) throw gamificationError('VALIDATION_FAILED', 400);
        return value;
    }
}
