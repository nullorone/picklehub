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
import { ClubState, Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

import { BrowserSecurityService } from '../identity/browser-security.service';
import { IdentityService } from '../identity/identity.service';
import { NoStoreInterceptor } from '../identity/no-store.interceptor';
import { IdentityRateLimitService } from '../identity/rate-limit.service';
import {
    ChangeClubRoleDto,
    ClubReasonDto,
    ClubResourceReasonDto,
    ClubSearchDto,
    ClubVenueDto,
    CreateClubDto,
    CreateClubMatchDto,
    CreateRecurringRuleDto,
    ExpectedClubResourceDto,
    ExpectedClubVersionDto,
    InviteClubMemberDto,
    TransferClubOwnershipDto,
    UpdateClubDto,
    UpdateRecurringRuleDto,
} from './club.dto';
import { ClubException, clubError } from './club.errors';
import { ClubIdempotencyService } from './club-idempotency.service';
import { ClubService } from './club.service';

@Controller()
@UseInterceptors(NoStoreInterceptor)
export class ClubController {
    constructor(
        private readonly clubs: ClubService,
        private readonly identity: IdentityService,
        private readonly browser: BrowserSecurityService,
        private readonly limits: IdentityRateLimitService,
        private readonly idempotency: ClubIdempotencyService
    ) {}

    @Get('clubs') search(@Query() query: ClubSearchDto): Promise<object> {
        return this.clubs.search(query);
    }

    @Post('clubs') @HttpCode(201) create(
        @Body() body: CreateClubDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            '/v1/clubs',
            body,
            201,
            request,
            response,
            undefined,
            (userId, tx) => this.clubs.create(userId, body, tx)
        );
    }

    @Get('clubs/:clubId') detail(@Param('clubId', new ParseUUIDPipe()) clubId: string): Promise<object> {
        return this.clubs.detail(clubId);
    }

    @Patch('clubs/:clubId') update(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Body() body: UpdateClubDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'PATCH',
            `/v1/clubs/${clubId}`,
            body,
            200,
            request,
            response,
            clubId,
            (userId, tx) => this.clubs.update(userId, clubId, body, tx)
        );
    }

    @Post('clubs/:clubId/archive') archive(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Body() body: ClubReasonDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.clubState(ClubState.ARCHIVED, clubId, body, authorization, key, request, response);
    }

    @Post('clubs/:clubId/restore') restore(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Body() body: ClubReasonDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.clubState(ClubState.ACTIVE, clubId, body, authorization, key, request, response);
    }

    @Post('clubs/:clubId/join') join(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Body() body: ExpectedClubVersionDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.clubCommand(clubId, 'join', body, authorization, key, request, response, (userId, tx) =>
            this.clubs.join(userId, clubId, body, tx)
        );
    }

    @Get('clubs/:clubId/members') async members(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') rawLimit = '20'
    ): Promise<object> {
        return this.clubs.listMembers(await this.user(authorization), clubId, this.limit(rawLimit));
    }

    @Post('clubs/:clubId/members/:membershipId/leave') leave(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
        @Body() body: ExpectedClubResourceDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.clubCommand(
            clubId,
            `members/${membershipId}/leave`,
            body,
            authorization,
            key,
            request,
            response,
            (userId, tx) => this.clubs.leave(userId, clubId, membershipId, body, tx)
        );
    }

    @Post('clubs/:clubId/members/:membershipId/exclude') exclude(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
        @Body() body: ClubResourceReasonDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.clubCommand(
            clubId,
            `members/${membershipId}/exclude`,
            body,
            authorization,
            key,
            request,
            response,
            (userId, tx) => this.clubs.exclude(userId, clubId, membershipId, body, tx)
        );
    }

    @Patch('clubs/:clubId/members/:membershipId/role') role(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
        @Body() body: ChangeClubRoleDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'PATCH',
            `/v1/clubs/${clubId}/members/${membershipId}/role`,
            body,
            200,
            request,
            response,
            clubId,
            (userId, tx) => this.clubs.changeRole(userId, clubId, membershipId, body, tx)
        );
    }

    @Post('clubs/:clubId/ownership/transfer') transfer(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Body() body: TransferClubOwnershipDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.clubCommand(
            clubId,
            'ownership/transfer',
            body,
            authorization,
            key,
            request,
            response,
            (userId, tx) => this.clubs.transfer(userId, clubId, body, tx)
        );
    }

    @Get('clubs/:clubId/join-requests') async requests(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20'
    ): Promise<object> {
        return this.clubs.listRequests(await this.user(authorization), clubId, this.limit(limit));
    }

    @Post('clubs/:clubId/join-requests/:joinRequestId/cancel') cancelRequest(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('joinRequestId', new ParseUUIDPipe()) requestId: string,
        @Body() body: ExpectedClubResourceDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.requestDecision(clubId, requestId, 'CANCELLED', body, authorization, key, request, response);
    }

    @Post('clubs/:clubId/join-requests/:joinRequestId/approve') approveRequest(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('joinRequestId', new ParseUUIDPipe()) requestId: string,
        @Body() body: ExpectedClubResourceDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.requestDecision(clubId, requestId, 'APPROVED', body, authorization, key, request, response);
    }

    @Post('clubs/:clubId/join-requests/:joinRequestId/reject') rejectRequest(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('joinRequestId', new ParseUUIDPipe()) requestId: string,
        @Body() body: ExpectedClubResourceDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.requestDecision(clubId, requestId, 'REJECTED', body, authorization, key, request, response);
    }

    @Get('clubs/:clubId/invitations') async invitations(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20'
    ): Promise<object> {
        return this.clubs.listInvitations(await this.user(authorization), clubId, this.limit(limit));
    }

    @Post('clubs/:clubId/invitations') @HttpCode(201) invite(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Body() body: InviteClubMemberDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/clubs/${clubId}/invitations`,
            body,
            201,
            request,
            response,
            clubId,
            (userId, tx) => this.clubs.createInvitation(userId, clubId, body.inviteeId, body.expectedVersion, tx)
        );
    }

    @Post('clubs/:clubId/invitations/:invitationId/revoke') revoke(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
        @Body() body: ExpectedClubResourceDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.clubCommand(
            clubId,
            `invitations/${invitationId}/revoke`,
            body,
            authorization,
            key,
            request,
            response,
            (userId, tx) => this.clubs.revokeInvitation(userId, clubId, invitationId, body, tx)
        );
    }

    @Post('clubs/:clubId/members/:membershipId/block') @HttpCode(204) async block(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('membershipId', new ParseUUIDPipe()) membershipId: string,
        @Body() body: ClubResourceReasonDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<void> {
        await this.clubCommand(
            clubId,
            `members/${membershipId}/block`,
            body,
            authorization,
            key,
            request,
            response,
            (userId, tx) => this.clubs.block(userId, clubId, membershipId, body, tx)
        );
    }

    @Post('clubs/:clubId/blocks/:blockId/lift') @HttpCode(204) async lift(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('blockId', new ParseUUIDPipe()) blockId: string,
        @Body() body: ClubResourceReasonDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<void> {
        await this.clubCommand(
            clubId,
            `blocks/${blockId}/lift`,
            body,
            authorization,
            key,
            request,
            response,
            (userId, tx) => this.clubs.liftBlock(userId, clubId, blockId, body, tx)
        );
    }

    @Get('clubs/:clubId/venues') venues(@Param('clubId', new ParseUUIDPipe()) clubId: string): Promise<object> {
        return this.clubs.venues(clubId);
    }

    @Post('clubs/:clubId/venues') @HttpCode(201) linkVenue(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Body() body: ClubVenueDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/clubs/${clubId}/venues`,
            body,
            201,
            request,
            response,
            clubId,
            (userId, tx) => this.clubs.linkVenue(userId, clubId, body.venueId, body.expectedVersion, tx)
        );
    }

    @Delete('clubs/:clubId/venues/:venueId') @HttpCode(204) async unlinkVenue(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('venueId', new ParseUUIDPipe()) venueId: string,
        @Query('expectedVersion', ParseIntPipe) expectedVersion: number,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<void> {
        await this.command(
            authorization,
            key,
            'DELETE',
            `/v1/clubs/${clubId}/venues/${venueId}`,
            { expectedVersion },
            204,
            request,
            response,
            clubId,
            (userId, tx) => this.clubs.unlinkVenue(userId, clubId, venueId, expectedVersion, tx)
        );
    }

    @Post('clubs/:clubId/matches') @HttpCode(201) clubMatch(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Body() body: CreateClubMatchDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/clubs/${clubId}/matches`,
            body,
            201,
            request,
            response,
            clubId,
            (userId, tx) => this.clubs.createMatch(userId, clubId, body, tx)
        );
    }

    @Get('clubs/:clubId/recurring-match-rules') async rules(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20'
    ): Promise<object> {
        return this.clubs.listRules(await this.user(authorization), clubId, this.limit(limit));
    }

    @Post('clubs/:clubId/recurring-match-rules') @HttpCode(201) createRule(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Body() body: CreateRecurringRuleDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/clubs/${clubId}/recurring-match-rules`,
            body,
            201,
            request,
            response,
            clubId,
            (userId, tx) => this.clubs.createRule(userId, clubId, body, tx)
        );
    }

    @Get('clubs/:clubId/recurring-match-rules/:ruleId') async rule(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
        @Headers('authorization') authorization: string | undefined
    ): Promise<object> {
        return this.clubs.rule(await this.user(authorization), clubId, ruleId);
    }

    @Patch('clubs/:clubId/recurring-match-rules/:ruleId') updateRule(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
        @Body() body: UpdateRecurringRuleDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'PATCH',
            `/v1/clubs/${clubId}/recurring-match-rules/${ruleId}`,
            body,
            200,
            request,
            response,
            clubId,
            (userId, tx) => this.clubs.updateRule(userId, clubId, ruleId, body, tx)
        );
    }

    @Post('clubs/:clubId/recurring-match-rules/:ruleId/pause') pauseRule(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
        @Body() body: ClubResourceReasonDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.ruleState(clubId, ruleId, 'PAUSED', body, authorization, key, request, response);
    }

    @Post('clubs/:clubId/recurring-match-rules/:ruleId/resume') resumeRule(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
        @Body() body: ClubResourceReasonDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.ruleState(clubId, ruleId, 'ACTIVE', body, authorization, key, request, response);
    }

    @Post('clubs/:clubId/recurring-match-rules/:ruleId/end') endRule(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
        @Body() body: ClubResourceReasonDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.ruleState(clubId, ruleId, 'ENDED', body, authorization, key, request, response);
    }

    @Get('clubs/:clubId/recurring-match-rules/:ruleId/occurrences') async occurrences(
        @Param('clubId', new ParseUUIDPipe()) clubId: string,
        @Param('ruleId', new ParseUUIDPipe()) ruleId: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20'
    ): Promise<object> {
        return this.clubs.occurrences(await this.user(authorization), clubId, ruleId, this.limit(limit));
    }

    @Get('club-invitations/:invitationToken') async invitation(
        @Param('invitationToken') token: string,
        @Headers('authorization') authorization: string | undefined
    ): Promise<object> {
        this.invitationToken(token);
        return this.clubs.invitation(await this.user(authorization), token);
    }

    @Post('club-invitations/:invitationToken/accept') acceptInvitation(
        @Param('invitationToken') token: string,
        @Body() body: ExpectedClubResourceDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.invitationDecision(token, 'ACCEPTED', body, authorization, key, request, response);
    }

    @Post('club-invitations/:invitationToken/decline') declineInvitation(
        @Param('invitationToken') token: string,
        @Body() body: ExpectedClubResourceDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.invitationDecision(token, 'DECLINED', body, authorization, key, request, response);
    }

    private clubState(
        target: ClubState,
        clubId: string,
        body: ClubReasonDto,
        authorization: string | undefined,
        key: string | undefined,
        request: Request,
        response: Response
    ): Promise<object> {
        const action = target === ClubState.ARCHIVED ? 'archive' : 'restore';
        return this.clubCommand(clubId, action, body, authorization, key, request, response, (userId, tx) =>
            this.clubs.state(userId, clubId, target, body, tx)
        );
    }
    private requestDecision(
        clubId: string,
        requestId: string,
        state: 'APPROVED' | 'REJECTED' | 'CANCELLED',
        body: ExpectedClubResourceDto,
        authorization: string | undefined,
        key: string | undefined,
        request: Request,
        response: Response
    ): Promise<object> {
        const action = state === 'APPROVED' ? 'approve' : state === 'REJECTED' ? 'reject' : 'cancel';
        return this.clubCommand(
            clubId,
            `join-requests/${requestId}/${action}`,
            body,
            authorization,
            key,
            request,
            response,
            (userId, tx) => this.clubs.decideRequest(userId, clubId, requestId, state, body, tx)
        );
    }
    private ruleState(
        clubId: string,
        ruleId: string,
        state: 'ACTIVE' | 'PAUSED' | 'ENDED',
        body: ClubResourceReasonDto,
        authorization: string | undefined,
        key: string | undefined,
        request: Request,
        response: Response
    ): Promise<object> {
        const action = state === 'ACTIVE' ? 'resume' : state.toLowerCase();
        return this.clubCommand(
            clubId,
            `recurring-match-rules/${ruleId}/${action}`,
            body,
            authorization,
            key,
            request,
            response,
            (userId, tx) => this.clubs.ruleState(userId, clubId, ruleId, state, body, tx)
        );
    }
    private invitationDecision(
        token: string,
        state: 'ACCEPTED' | 'DECLINED',
        body: ExpectedClubResourceDto,
        authorization: string | undefined,
        key: string | undefined,
        request: Request,
        response: Response
    ): Promise<object> {
        const action = state === 'ACCEPTED' ? 'accept' : 'decline';
        this.invitationToken(token);
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/club-invitations/:invitationToken/${action}`,
            {
                expectedClubVersion: body.expectedClubVersion,
                expectedRevision: body.expectedRevision,
                invitationToken: token,
            },
            200,
            request,
            response,
            undefined,
            (userId, tx) => this.clubs.decideInvitation(userId, token, state, body, tx)
        );
    }
    private clubCommand<T>(
        clubId: string,
        suffix: string,
        body: object,
        authorization: string | undefined,
        key: string | undefined,
        request: Request,
        response: Response,
        operation: (userId: string, tx: Prisma.TransactionClient) => Promise<T>
    ): Promise<T> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/clubs/${clubId}/${suffix}`,
            body,
            200,
            request,
            response,
            clubId,
            operation
        );
    }
    private async command<T>(
        authorization: string | undefined,
        key: string | undefined,
        method: 'POST' | 'PATCH' | 'DELETE',
        path: string,
        body: object,
        status: number,
        request: Request,
        response: Response,
        clubId: string | undefined,
        operation: (userId: string, tx: Prisma.TransactionClient) => Promise<T>
    ): Promise<T> {
        await this.browser.assertMutation(request);
        const userId = await this.user(authorization);
        if (key === undefined || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(key))
            throw clubError('VALIDATION_FAILED', 400);
        await this.limits.consume(`club-command:user:${userId}`, 30, 60);
        try {
            const result = await this.idempotency.execute(userId, clubId, key, method, path, body, status, (tx) =>
                operation(userId, tx)
            );
            response.status(result.status).setHeader('Idempotency-Replayed', String(result.replayed));
            return result.value;
        } catch (error) {
            if (error instanceof ClubException) throw error;
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
                if (error.code === 'P2002') throw clubError('CLUB_INTENT_EXISTS', 409);
                if (error.code === 'P2004') throw clubError('CLUB_TRANSITION_NOT_ALLOWED', 409);
                if (error.code === 'P2025') throw clubError('CLUB_RESOURCE_NOT_FOUND', 404);
                if (error.code === 'P2034') throw clubError('CLUB_VERSION_CONFLICT', 409);
            }
            throw error;
        }
    }
    private async user(authorization: string | undefined): Promise<string> {
        return (await this.identity.authenticate(authorization)).session.userId;
    }
    private limit(raw: string): number {
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 1 || value > 100) throw clubError('VALIDATION_FAILED', 400);
        return value;
    }

    private invitationToken(token: string): void {
        if (token.length < 22 || token.length > 256 || !/^[A-Za-z0-9_-]+$/u.test(token))
            throw clubError('VALIDATION_FAILED', 400);
    }
}
