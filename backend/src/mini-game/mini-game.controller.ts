import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';

import { BrowserSecurityService } from '../identity/browser-security.service';
import { MiniGameAuthService, type MiniGameActor } from './mini-game-auth.service';
import {
    ClaimGameRewardsDto,
    CreateGameSessionDto,
    ExchangeGameWebViewLaunchDto,
    SubmitGameResultDto,
} from './mini-game.dto';
import { miniGameError } from './mini-game.errors';
import { MiniGameIdempotencyService } from './mini-game-idempotency.service';
import { MiniGameLaunchService } from './mini-game-launch.service';
import { MiniGameRateLimitService } from './mini-game-rate-limit.service';
import { MiniGameRewardService } from './mini-game-reward.service';
import { MiniGameService } from './mini-game.service';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Controller('mini-game')
export class MiniGameController {
    constructor(
        private readonly auth: MiniGameAuthService,
        private readonly browser: BrowserSecurityService,
        private readonly idempotency: MiniGameIdempotencyService,
        private readonly launch: MiniGameLaunchService,
        private readonly limits: MiniGameRateLimitService,
        private readonly game: MiniGameService,
        private readonly rewards: MiniGameRewardService
    ) {}

    @Post('webview-launches')
    async createLaunch(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const actor = await this.actor(authorization, request, true);
        if (actor.identity.session.platform !== 'MOBILE') throw miniGameError('SESSION_INVALID', 401);
        await this.limits.consume(`launch:${actor.userId}`, 10, 60);
        return this.mutation(actor.userId, key, '/v1/mini-game/webview-launches', {}, 201, response, (tx) =>
            this.launch.create(actor, tx)
        );
    }

    @Post('webview-launches/exchange')
    async exchangeLaunch(
        @Headers('origin') origin: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: ExchangeGameWebViewLaunchDto,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const resolved = await this.launch.resolve(body.capability, origin);
        await this.limits.consume(`exchange:${resolved.capabilityId}`, 5, 60);
        return this.mutation(
            resolved.userId,
            key,
            '/v1/mini-game/webview-launches/exchange',
            body,
            201,
            response,
            (tx) => this.launch.exchange(body.capability, resolved.capabilityId, origin ?? '', tx)
        );
    }

    @Post('sessions')
    async createSession(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: CreateGameSessionDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const actor = await this.actor(authorization, request, true);
        await this.limits.consume(`session:${actor.userId}`, 30, 60);
        return this.mutation(actor.userId, key, '/v1/mini-game/sessions', body, 201, response, (tx) =>
            this.game.createSession(actor, body, tx)
        );
    }

    @Post('sessions/:sessionId/results')
    async submitResult(
        @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: SubmitGameResultDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const actor = await this.actor(authorization, request, true);
        await this.limits.consume(`result:${actor.userId}`, 20, 60);
        return this.mutation(
            actor.userId,
            key,
            `/v1/mini-game/sessions/${sessionId}/results`,
            body,
            201,
            response,
            (tx) => this.game.submitResult(actor, sessionId, body, tx)
        );
    }

    @Get('progress')
    async progress(
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const actor = await this.actor(authorization, request, false);
        await this.limits.consume(`progress:${actor.userId}`, 60, 60);
        this.private(response);
        return this.game.progress(actor.userId);
    }

    @Post('receipts/:receiptId/reward-claim')
    @HttpCode(200)
    async claim(
        @Param('receiptId', new ParseUUIDPipe()) receiptId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: ClaimGameRewardsDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const actor = await this.actor(authorization, request, true);
        await this.limits.consume(`claim:${actor.userId}`, 30, 60);
        return this.mutation(
            actor.userId,
            key,
            `/v1/mini-game/receipts/${receiptId}/reward-claim`,
            body,
            200,
            response,
            (tx) => this.rewards.claim(actor, receiptId, body.resultProof, tx)
        );
    }

    private async actor(
        authorization: string | undefined,
        request: Request,
        mutation: boolean
    ): Promise<MiniGameActor> {
        const actor = await this.auth.authenticate(authorization);
        if (!mutation) return actor;
        if (actor.credentialKind === 'IDENTITY') {
            await this.browser.assertSessionMutation(request, actor.identity.session.platform);
        } else if (request.header('Origin') !== undefined || request.header('X-CSRF-Token') !== undefined) {
            throw miniGameError('SESSION_INVALID', 401);
        }
        return actor;
    }

    private async mutation<T extends object>(
        actorUserId: string,
        key: string | undefined,
        path: string,
        body: object,
        status: number,
        response: Response,
        operation: (tx: Prisma.TransactionClient) => Promise<unknown>
    ): Promise<T> {
        if (key === undefined || !UUID_V4.test(key)) throw miniGameError('VALIDATION_FAILED', 400);
        const result = await this.idempotency.execute(actorUserId, key, path, body, status, operation);
        response.status(status);
        this.private(response);
        if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
        return result.value as T;
    }

    private private(response: Response): void {
        response.setHeader('Cache-Control', 'private, no-store');
        response.setHeader('Pragma', 'no-cache');
    }
}
