import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    HttpCode,
    Param,
    ParseIntPipe,
    ParseUUIDPipe,
    Patch,
    Post,
    Query,
    Req,
    Res,
    UseInterceptors,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import { BrowserSecurityService } from '../identity/browser-security.service';
import { IdentityService } from '../identity/identity.service';
import { NoStoreInterceptor } from '../identity/no-store.interceptor';
import { IdentityRateLimitService } from '../identity/rate-limit.service';
import {
    DraftMatchDto,
    JoinMatchDto,
    MatchSearchDto,
    ProposeResultDto,
    ResolveResultDto,
    UpdateMatchDto,
    VersionDto,
} from './match.dto';
import { MatchException, matchError } from './match.errors';
import { MatchIdempotencyService } from './match-idempotency.service';
import { MatchService } from './match.service';

@Controller('matches')
@UseInterceptors(NoStoreInterceptor)
export class MatchController {
    constructor(
        private readonly matches: MatchService,
        private readonly identity: IdentityService,
        private readonly browser: BrowserSecurityService,
        private readonly limits: IdentityRateLimitService,
        private readonly idempotency: MatchIdempotencyService
    ) {}

    @Get() async search(@Query() query: MatchSearchDto, @Req() request: Request): Promise<object> {
        await this.limits.consume(`match-search:ip:${this.ip(request)}`, 120, 60);
        const authorization = request.headers.authorization;
        const viewerId =
            authorization === undefined ? undefined : (await this.identity.authenticate(authorization)).session.userId;
        return this.matches.search(query, undefined, viewerId);
    }

    @Get('recommendations') async recommendations(
        @Headers('authorization') authorization: string | undefined,
        @Query() query: MatchSearchDto,
        @Req() request: Request
    ): Promise<object> {
        const auth = await this.identity.authenticate(authorization);
        await this.limits.consume(`match-recommend:user:${auth.session.userId}`, 60, 60);
        await this.limits.consume(`match-search:ip:${this.ip(request)}`, 120, 60);
        return this.matches.search(query, await this.matches.profile(auth.session.userId), auth.session.userId);
    }

    @Post() @HttpCode(201) async create(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: DraftMatchDto
    ): Promise<object> {
        const auth = await this.mutationAuth(authorization, request);
        return this.execute(auth.session.userId, key, 'POST', '/v1/matches', body, response, (tx) =>
            this.matches.create(auth.session.userId, body, tx)
        );
    }

    @Get(':matchId') async detail(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization?: string
    ): Promise<object> {
        const auth = authorization === undefined ? undefined : await this.identity.authenticate(authorization);
        return this.matches.detail(id, auth?.session.userId);
    }

    @Patch(':matchId') async update(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: UpdateMatchDto
    ): Promise<object> {
        const auth = await this.mutationAuth(authorization, request);
        return this.execute(
            auth.session.userId,
            key,
            'PATCH',
            `/v1/matches/${id}`,
            body,
            response,
            (tx) => this.matches.update(auth.session.userId, id, body, tx),
            id
        );
    }

    @Delete(':matchId') @HttpCode(204) async remove(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Query('expectedVersion', ParseIntPipe) expectedVersion: number,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<void> {
        const auth = await this.mutationAuth(authorization, request);
        await this.execute(
            auth.session.userId,
            key,
            'DELETE',
            `/v1/matches/${id}`,
            { expectedVersion },
            response,
            (tx) => this.matches.remove(auth.session.userId, id, expectedVersion, tx),
            id
        );
    }

    @Post(':matchId/publish') publish(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Body() body: VersionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(id, 'publish', body, authorization, key, request, response);
    }
    @Post(':matchId/invite/rotate') rotate(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Body() body: VersionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(id, 'rotate', body, authorization, key, request, response);
    }

    @Post(':matchId/join') async join(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Body() body: JoinMatchDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const auth = await this.mutationAuth(authorization, request);
        return this.execute(
            auth.session.userId,
            key,
            'POST',
            `/v1/matches/${id}/join`,
            body,
            response,
            (tx) => this.matches.join(auth.session.userId, id, body, tx),
            id
        );
    }

    @Get(':matchId/join-requests') async requests(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20',
        @Query('cursor') cursor?: string
    ): Promise<object> {
        const auth = await this.identity.authenticate(authorization);
        return this.matches.listRequests(auth.session.userId, id, this.limit(limit), cursor);
    }
    @Get(':matchId/waitlist') async waitlist(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20'
    ): Promise<object> {
        const auth = await this.identity.authenticate(authorization);
        return this.matches.listWaitlist(auth.session.userId, id, this.limit(limit));
    }

    @Post(':matchId/join-requests/:requestId/approve') approve(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Param('requestId', new ParseUUIDPipe()) requestId: string,
        @Body() body: VersionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.requestCommand(id, requestId, 'APPROVED', body, authorization, key, request, response);
    }
    @Post(':matchId/join-requests/:requestId/reject') reject(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Param('requestId', new ParseUUIDPipe()) requestId: string,
        @Body() body: VersionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.requestCommand(id, requestId, 'REJECTED', body, authorization, key, request, response);
    }
    @Post(':matchId/join-requests/:requestId/withdraw') withdrawRequest(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Param('requestId', new ParseUUIDPipe()) requestId: string,
        @Body() body: VersionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.requestCommand(id, requestId, 'WITHDRAWN', body, authorization, key, request, response);
    }

    @Post(':matchId/waitlist/:entryId/withdraw') withdrawWaitlist(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Param('entryId', new ParseUUIDPipe()) entryId: string,
        @Body() body: VersionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.entryCommand(id, entryId, 'withdraw', body, authorization, key, request, response);
    }
    @Post(':matchId/waitlist/:entryId/promote') promoteWaitlist(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Param('entryId', new ParseUUIDPipe()) entryId: string,
        @Body() body: VersionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.entryCommand(id, entryId, 'promote', body, authorization, key, request, response);
    }
    @Post(':matchId/participants/:participantId/leave') leave(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Param('participantId', new ParseUUIDPipe()) participantId: string,
        @Body() body: VersionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.entryCommand(id, participantId, 'leave', body, authorization, key, request, response);
    }
    @Post(':matchId/cancel') cancel(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Body() body: VersionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(id, 'cancel', body, authorization, key, request, response);
    }
    @Post(':matchId/start') start(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Body() body: VersionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(id, 'start', body, authorization, key, request, response);
    }

    @Post(':matchId/results') @HttpCode(201) async propose(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Body() body: ProposeResultDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const auth = await this.mutationAuth(authorization, request);
        return this.execute(
            auth.session.userId,
            key,
            'POST',
            `/v1/matches/${id}/results`,
            body,
            response,
            (tx) => this.matches.proposeResult(auth.session.userId, id, body, tx),
            id
        );
    }
    @Post(':matchId/results/:resultId/confirm') confirm(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Param('resultId', new ParseUUIDPipe()) resultId: string,
        @Body() body: ResolveResultDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.resultCommand(id, resultId, 'CONFIRMED', body, authorization, key, request, response);
    }
    @Post(':matchId/results/:resultId/dispute') dispute(
        @Param('matchId', new ParseUUIDPipe()) id: string,
        @Param('resultId', new ParseUUIDPipe()) resultId: string,
        @Body() body: ResolveResultDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.resultCommand(id, resultId, 'DISPUTED', body, authorization, key, request, response);
    }

    private async command(
        id: string,
        action: 'publish' | 'rotate' | 'cancel' | 'start',
        body: VersionDto,
        authorization: string | undefined,
        key: string | undefined,
        request: Request,
        response: Response
    ): Promise<object> {
        const auth = await this.mutationAuth(authorization, request);
        const method = action === 'rotate' ? 'invite/rotate' : action;
        return this.execute(
            auth.session.userId,
            key,
            'POST',
            `/v1/matches/${id}/${method}`,
            body,
            response,
            (tx) =>
                action === 'publish'
                    ? this.matches.publish(auth.session.userId, id, body.expectedVersion, tx)
                    : action === 'rotate'
                      ? this.matches.rotateInvite(auth.session.userId, id, body.expectedVersion, tx)
                      : action === 'cancel'
                        ? this.matches.cancel(auth.session.userId, id, body.expectedVersion, tx)
                        : this.matches.start(auth.session.userId, id, body.expectedVersion, tx),
            id
        );
    }
    private async requestCommand(
        id: string,
        requestId: string,
        decision: 'APPROVED' | 'REJECTED' | 'WITHDRAWN',
        body: VersionDto,
        authorization: string | undefined,
        key: string | undefined,
        request: Request,
        response: Response
    ): Promise<object> {
        const auth = await this.mutationAuth(authorization, request);
        const action = decision === 'APPROVED' ? 'approve' : decision === 'REJECTED' ? 'reject' : 'withdraw';
        return this.execute(
            auth.session.userId,
            key,
            'POST',
            `/v1/matches/${id}/join-requests/${requestId}/${action}`,
            body,
            response,
            (tx) => this.matches.decideRequest(auth.session.userId, id, requestId, body.expectedVersion, decision, tx),
            id
        );
    }
    private async entryCommand(
        id: string,
        entryId: string,
        action: 'withdraw' | 'promote' | 'leave',
        body: VersionDto,
        authorization: string | undefined,
        key: string | undefined,
        request: Request,
        response: Response
    ): Promise<object> {
        const auth = await this.mutationAuth(authorization, request);
        const path = action === 'leave' ? `participants/${entryId}/leave` : `waitlist/${entryId}/${action}`;
        return this.execute(
            auth.session.userId,
            key,
            'POST',
            `/v1/matches/${id}/${path}`,
            body,
            response,
            (tx) =>
                action === 'withdraw'
                    ? this.matches.withdrawWaitlist(auth.session.userId, id, entryId, body.expectedVersion, tx)
                    : action === 'promote'
                      ? this.matches.promoteWaitlist(auth.session.userId, id, entryId, body.expectedVersion, tx)
                      : this.matches.leave(auth.session.userId, id, entryId, body.expectedVersion, tx),
            id
        );
    }
    private async resultCommand(
        id: string,
        resultId: string,
        decision: 'CONFIRMED' | 'DISPUTED',
        body: ResolveResultDto,
        authorization: string | undefined,
        key: string | undefined,
        request: Request,
        response: Response
    ): Promise<object> {
        const auth = await this.mutationAuth(authorization, request);
        return this.execute(
            auth.session.userId,
            key,
            'POST',
            `/v1/matches/${id}/results/${resultId}/${decision.toLowerCase()}`,
            body,
            response,
            (tx) => this.matches.resolveResult(auth.session.userId, id, resultId, body, decision, tx),
            id
        );
    }

    private async mutationAuth(authorization: string | undefined, request: Request) {
        const auth = await this.identity.authenticate(authorization);
        await this.browser.assertSessionMutation(request, auth.session.platform);
        return auth;
    }
    private async execute<T>(
        userId: string,
        key: string | undefined,
        method: 'POST' | 'PATCH' | 'DELETE',
        path: string,
        body: object,
        response: Response,
        operation: Parameters<MatchIdempotencyService['execute']>[5],
        matchId?: string
    ): Promise<T> {
        if (key === undefined || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(key))
            throw matchError('VALIDATION_FAILED', 400);
        try {
            await this.limits.consume(
                `match-command:user:${userId}:match:${matchId ?? 'new'}`,
                path.includes('/results/')
                    ? 10
                    : path.includes('/join-requests/') || path.includes('/waitlist/')
                      ? 30
                      : 120,
                path.includes('/results/') ? 3600 : 60
            );
            const result = await this.idempotency.execute(userId, key, method, path, body, operation, matchId);
            response.setHeader('Idempotency-Replayed', String(result.replayed));
            return result.value as T;
        } catch (error) {
            if (error instanceof MatchException) throw error;
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                (error.code === 'P2002' || error.code === 'P2004' || error.code === 'P2034')
            )
                throw matchError('MATCH_VERSION_CONFLICT', 409);
            throw error;
        }
    }
    private limit(value: string): number {
        const limit = Number(value);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw matchError('VALIDATION_FAILED', 400);
        return limit;
    }
    private ip(request: Request): string {
        return request.ip ?? request.socket.remoteAddress ?? 'unknown';
    }
}

@Controller('match-invites')
@UseInterceptors(NoStoreInterceptor)
export class MatchInviteController {
    constructor(private readonly matches: MatchService) {}
    @Get(':inviteToken') detail(@Param('inviteToken') token: string): Promise<object> {
        if (!/^[A-Za-z0-9_-]{22,256}$/u.test(token)) throw matchError('INVITE_INVALID', 404);
        return this.matches.inviteDetail(token);
    }
}
