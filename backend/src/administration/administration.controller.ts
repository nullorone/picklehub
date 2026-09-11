import {
    Body,
    Controller,
    Get,
    Headers,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Post,
    Query,
    Req,
    UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';

import { BrowserSecurityService } from '../identity/browser-security.service';
import { NoStoreInterceptor } from '../identity/no-store.interceptor';
import {
    AssignCaseDto,
    AuditQueryDto,
    CaseQueryDto,
    ChangeRestrictionDto,
    CreateBreakGlassDto,
    CreateRoleGrantDto,
    DecideCaseDto,
    DecideVenueDto,
    MergeVenueDto,
    RevokeDto,
    UserLookupDto,
    VenueQueryDto,
} from './administration.dto';
import { administrationError } from './administration.errors';
import { AdministrationRateLimitService } from './administration-rate-limit.service';
import { AdministrationService } from './administration.service';
import { AdministrationSessionService, type AuthenticatedAdmin } from './administration-session.service';
import type { AdminCapability } from './administration.policy';

@Controller('admin')
@UseInterceptors(NoStoreInterceptor)
export class AdministrationController {
    constructor(
        private readonly sessions: AdministrationSessionService,
        private readonly administration: AdministrationService,
        private readonly browser: BrowserSecurityService,
        private readonly limits: AdministrationRateLimitService
    ) {}

    @Get('session')
    async session(@Headers('authorization') authorization?: string): Promise<object> {
        const admin = await this.authorize(authorization, 'ADMIN_SESSION_ACCESS');
        return this.sessions.context(admin);
    }

    @Post('role-grants')
    async grantRole(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: CreateRoleGrantDto,
        @Req() request: Request
    ): Promise<object> {
        const admin = await this.mutation(authorization, request, 'ROLE_GRANT_MANAGE', true);
        return this.administration.grantRole(admin, body, this.key(key));
    }

    @Post('role-grants/:grantId/revoke')
    @HttpCode(200)
    async revokeRole(
        @Param('grantId', ParseUUIDPipe) grantId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: RevokeDto,
        @Req() request: Request
    ): Promise<object> {
        const admin = await this.mutation(authorization, request, 'ROLE_GRANT_MANAGE', true);
        return this.administration.revokeRole(admin, grantId, body, this.key(key));
    }

    @Post('users/lookup')
    @HttpCode(200)
    async lookupUser(
        @Headers('authorization') authorization: string | undefined,
        @Body() body: UserLookupDto,
        @Req() request: Request
    ): Promise<object> {
        const admin = await this.mutation(authorization, request, 'USER_LOOKUP');
        await this.limits.consume(admin.actorId, 'user_lookup', 20, 60);
        return this.administration.lookupUser(admin, body);
    }

    @Get('cases')
    async listCases(
        @Headers('authorization') authorization: string | undefined,
        @Query() query: CaseQueryDto
    ): Promise<object> {
        const admin = await this.authorize(authorization, 'SAFETY_CASE_ROUTE');
        await this.limits.consume(admin.actorId, 'case_list', 120, 60);
        return this.administration.listCases(admin, query);
    }

    @Get('cases/:caseId')
    async caseDetail(
        @Param('caseId', ParseUUIDPipe) caseId: string,
        @Headers('authorization') authorization?: string
    ): Promise<object> {
        const admin = await this.authorize(authorization, 'SAFETY_CASE_ROUTE');
        await this.limits.consume(admin.actorId, 'case_detail', 120, 60);
        return this.administration.caseDetail(admin, caseId);
    }

    @Post('cases/:caseId/assignment')
    @HttpCode(200)
    async assignCase(
        @Param('caseId', ParseUUIDPipe) caseId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: AssignCaseDto,
        @Req() request: Request
    ): Promise<object> {
        const admin = await this.mutation(authorization, request, 'SAFETY_CASE_ROUTE');
        return this.administration.assignCase(admin, caseId, body.assigneeUserId, body, this.key(key));
    }

    @Post('cases/:caseId/decision')
    @HttpCode(200)
    async decideCase(
        @Param('caseId', ParseUUIDPipe) caseId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: DecideCaseDto,
        @Req() request: Request
    ): Promise<object> {
        const admin = await this.mutation(authorization, request, 'SAFETY_CASE_DECIDE');
        return this.administration.decideCase(admin, caseId, body, this.key(key));
    }

    @Post('users/:userId/restrictions')
    async restrictUser(
        @Param('userId', ParseUUIDPipe) userId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: ChangeRestrictionDto,
        @Req() request: Request
    ): Promise<object> {
        const sensitive = body.scope === 'PLATFORM_ACCESS' || body.expiresAt === undefined;
        const admin = await this.mutation(authorization, request, 'USER_RESTRICT', sensitive);
        return this.administration.createRestriction(admin, userId, body, this.key(key));
    }

    @Post('users/:userId/restrictions/:restrictionId/revoke')
    @HttpCode(200)
    async revokeRestriction(
        @Param('userId', ParseUUIDPipe) userId: string,
        @Param('restrictionId', ParseUUIDPipe) restrictionId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: RevokeDto,
        @Req() request: Request
    ): Promise<object> {
        const admin = await this.mutation(authorization, request, 'USER_RESTRICT');
        return this.administration.revokeRestriction(admin, userId, restrictionId, body, this.key(key));
    }

    @Get('venue-candidates')
    async listVenues(
        @Headers('authorization') authorization: string | undefined,
        @Query() query: VenueQueryDto
    ): Promise<object> {
        const admin = await this.authorize(authorization, 'VENUE_MODERATE');
        await this.limits.consume(admin.actorId, 'venue_list', 120, 60);
        return this.administration.listVenues(admin, query);
    }

    @Get('venue-candidates/:itemId')
    async venueDetail(
        @Param('itemId', ParseUUIDPipe) itemId: string,
        @Headers('authorization') authorization?: string
    ): Promise<object> {
        await this.authorize(authorization, 'VENUE_MODERATE');
        return this.administration.venueDetail(itemId);
    }

    @Post('venue-candidates/:itemId/decision')
    @HttpCode(200)
    async decideVenue(
        @Param('itemId', ParseUUIDPipe) itemId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: DecideVenueDto,
        @Req() request: Request
    ): Promise<object> {
        const admin = await this.mutation(authorization, request, 'VENUE_MODERATE');
        return this.administration.decideVenue(admin, itemId, body, this.key(key));
    }

    @Post('venue-candidates/:itemId/merge')
    @HttpCode(200)
    async mergeVenue(
        @Param('itemId', ParseUUIDPipe) itemId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: MergeVenueDto,
        @Req() request: Request
    ): Promise<object> {
        const admin = await this.mutation(authorization, request, 'VENUE_MODERATE', true);
        return this.administration.mergeVenue(admin, itemId, body, this.key(key));
    }

    @Get('audit')
    async audit(
        @Headers('authorization') authorization: string | undefined,
        @Query() query: AuditQueryDto
    ): Promise<object> {
        const admin = await this.authorize(authorization, 'AUDIT_SEARCH');
        await this.limits.consume(admin.actorId, 'audit_search', 30, 60);
        return this.administration.searchAudit(admin, query);
    }

    @Post('break-glass-grants')
    async createBreakGlass(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: CreateBreakGlassDto,
        @Req() request: Request
    ): Promise<object> {
        const admin = await this.mutation(authorization, request, 'BREAK_GLASS_MANAGE', true);
        return this.administration.createBreakGlass(admin, body, this.key(key));
    }

    @Post('break-glass-grants/:grantId/revoke')
    @HttpCode(200)
    async revokeBreakGlass(
        @Param('grantId', ParseUUIDPipe) grantId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: RevokeDto,
        @Req() request: Request
    ): Promise<object> {
        const admin = await this.mutation(authorization, request, 'BREAK_GLASS_MANAGE', true);
        return this.administration.revokeBreakGlass(admin, grantId, body, this.key(key));
    }

    private async authorize(
        authorization: string | undefined,
        capability: AdminCapability
    ): Promise<AuthenticatedAdmin> {
        const admin = await this.sessions.authenticate(authorization);
        try {
            this.sessions.assertCapability(admin, capability);
        } catch (error) {
            await this.administration.auditAuthorizationDenied(admin, capability);
            throw error;
        }
        return admin;
    }

    private async mutation(
        authorization: string | undefined,
        request: Request,
        capability: AdminCapability,
        sensitive = false
    ): Promise<AuthenticatedAdmin> {
        await this.browser.assertMutation(request);
        const admin = await this.authorize(authorization, capability);
        if (sensitive) this.sessions.assertFreshReauthentication(admin);
        await this.limits.consume(admin.actorId, `mutation_${capability.toLowerCase()}`, 60, 60);
        return admin;
    }

    private key(value: string | undefined): string {
        if (
            value === undefined ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)
        )
            throw administrationError('VALIDATION_FAILED', 400);
        return value;
    }
}
