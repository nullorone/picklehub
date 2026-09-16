import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    Put,
    Query,
    Req,
    Res,
    UseInterceptors,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import { BrowserSecurityService } from '../identity/browser-security.service';
import { IdentityService } from '../identity/identity.service';
import { NoStoreInterceptor } from '../identity/no-store.interceptor';
import { IdentityRateLimitService } from '../identity/rate-limit.service';
import {
    AppealDto,
    CaseResponseDto,
    NoShowSubmissionDto,
    ReportSubmissionDto,
    ReviewSubmissionDto,
    WithdrawalDto,
} from './trust-safety.dto';
import { trustSafetyError } from './trust-safety.errors';
import { TrustSafetyIdempotencyService } from './trust-safety-idempotency.service';
import { TrustSafetyService } from './trust-safety.service';

@Controller()
@UseInterceptors(NoStoreInterceptor)
export class TrustSafetyController {
    constructor(
        private readonly safety: TrustSafetyService,
        private readonly identity: IdentityService,
        private readonly browser: BrowserSecurityService,
        private readonly limits: IdentityRateLimitService,
        private readonly idempotency: TrustSafetyIdempotencyService
    ) {}

    @Put('matches/:matchId/reviews/:subjectPlayerId') async review(
        @Param('matchId', new ParseUUIDPipe()) matchId: string,
        @Param('subjectPlayerId', new ParseUUIDPipe()) subjectId: string,
        @Body() body: ReviewSubmissionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'PUT',
            `/v1/matches/${matchId}/reviews/${subjectId}`,
            body,
            201,
            request,
            response,
            (userId, tx) => this.safety.submitReview(userId, matchId, subjectId, body, tx)
        );
    }

    @Delete('matches/:matchId/reviews/:subjectPlayerId') @HttpCode(204) async withdrawReview(
        @Param('matchId', new ParseUUIDPipe()) matchId: string,
        @Param('subjectPlayerId', new ParseUUIDPipe()) subjectId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<void> {
        await this.command(
            authorization,
            key,
            'DELETE',
            `/v1/matches/${matchId}/reviews/${subjectId}`,
            {},
            204,
            request,
            response,
            (userId, tx) => this.safety.withdrawReview(userId, matchId, subjectId, tx)
        );
    }

    @Post('matches/:matchId/no-show-reports') async noShow(
        @Param('matchId', new ParseUUIDPipe()) matchId: string,
        @Body() body: NoShowSubmissionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/matches/${matchId}/no-show-reports`,
            body,
            201,
            request,
            response,
            (userId, tx) => this.safety.submitNoShow(userId, matchId, body, tx)
        );
    }

    @Post('safety-reports') async report(
        @Body() body: ReportSubmissionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            '/v1/safety-reports',
            body,
            201,
            request,
            response,
            (userId, tx) => this.safety.submitReport(userId, body, tx)
        );
    }

    @Get('me/safety-reports') async list(
        @Headers('authorization') authorization: string | undefined,
        @Query('cursor') cursor?: string,
        @Query('limit') rawLimit = '20'
    ): Promise<object> {
        const userId = await this.user(authorization);
        return this.safety.listOwn(userId, this.limit(rawLimit), cursor);
    }

    @Get('me/safety-reports/:receiptId') async detail(
        @Param('receiptId', new ParseUUIDPipe()) receiptId: string,
        @Headers('authorization') authorization: string | undefined
    ): Promise<object> {
        return this.safety.getOwn(await this.user(authorization), receiptId);
    }

    @Post('me/safety-reports/:receiptId/withdrawal') async withdrawal(
        @Param('receiptId', new ParseUUIDPipe()) receiptId: string,
        @Body() body: WithdrawalDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/me/safety-reports/${receiptId}/withdrawal`,
            body,
            200,
            request,
            response,
            (userId, tx) => this.safety.requestWithdrawal(userId, receiptId, tx)
        );
    }

    @Post('me/safety-reports/:receiptId/responses') async respond(
        @Param('receiptId', new ParseUUIDPipe()) receiptId: string,
        @Body() body: CaseResponseDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/me/safety-reports/${receiptId}/responses`,
            body,
            201,
            request,
            response,
            (userId, tx) => this.safety.respond(userId, receiptId, body, tx)
        );
    }

    @Post('me/safety-reports/:receiptId/appeals') async appeal(
        @Param('receiptId', new ParseUUIDPipe()) receiptId: string,
        @Body() body: AppealDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/me/safety-reports/${receiptId}/appeals`,
            body,
            201,
            request,
            response,
            (userId, tx) => this.safety.appeal(userId, receiptId, body, tx)
        );
    }

    @Get('players/:playerId/reputation') async reputation(
        @Param('playerId', new ParseUUIDPipe()) playerId: string,
        @Headers('authorization') authorization?: string
    ): Promise<object> {
        const viewerId = authorization === undefined ? undefined : await this.user(authorization);
        return this.safety.publicReputation(playerId, viewerId);
    }

    @Get('me/blocks') async blocks(
        @Headers('authorization') authorization: string | undefined,
        @Query('cursor') cursor?: string,
        @Query('limit') rawLimit = '20'
    ): Promise<object> {
        return this.safety.listBlocks(await this.user(authorization), this.limit(rawLimit), cursor);
    }

    private async command<T>(
        authorization: string | undefined,
        key: string | undefined,
        method: 'POST' | 'PUT' | 'DELETE',
        path: string,
        body: object,
        status: number,
        request: Request,
        response: Response,
        operation: (userId: string, tx: Prisma.TransactionClient) => Promise<T>
    ): Promise<T> {
        const auth = await this.identity.authenticate(authorization);
        await this.browser.assertSessionMutation(request, auth.session.platform);
        const userId = auth.session.userId;
        if (key === undefined || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(key))
            throw trustSafetyError('VALIDATION_FAILED', 400);
        await this.limits.consume(`safety-command:user:${userId}`, 20, 60);
        const result = await this.idempotency.execute(userId, key, method, path, body, status, (tx) =>
            operation(userId, tx)
        );
        response.status(result.status).setHeader('Idempotency-Replayed', String(result.replayed));
        return result.value;
    }

    private async user(authorization: string | undefined): Promise<string> {
        return (await this.identity.authenticate(authorization)).session.userId;
    }
    private limit(value: string): number {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) throw trustSafetyError('VALIDATION_FAILED', 400);
        return parsed;
    }
}
