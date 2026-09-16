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
    CreateVenueCandidateDto,
    CreateVenueReportDto,
    GeocoderQueryDto,
    ProposeVenueRevisionDto,
    VenueListQueryDto,
    VenueMapQueryDto,
    VenueReportReasonDto,
} from './venue.dto';
import { VenueCacheService } from './venue-cache.service';
import { venueError } from './venue.errors';
import { VenueIdempotencyService } from './venue-idempotency.service';
import { VenueService } from './venue.service';

@Controller()
@UseInterceptors(NoStoreInterceptor)
export class VenueController {
    constructor(
        private readonly venues: VenueService,
        private readonly identity: IdentityService,
        private readonly browser: BrowserSecurityService,
        private readonly limits: IdentityRateLimitService,
        private readonly idempotency: VenueIdempotencyService,
        private readonly cache: VenueCacheService
    ) {}

    @Get('venues') list(@Query() query: VenueListQueryDto): Promise<object> {
        return this.venues.searchList(query);
    }
    @Get('venues/map') map(@Query() query: VenueMapQueryDto): Promise<object> {
        return this.venues.searchMap(query);
    }

    @Get('venues/geocoding/suggestions')
    async suggest(
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request,
        @Query() query: GeocoderQueryDto
    ): Promise<object> {
        const auth = await this.identity.authenticate(authorization);
        if (auth.session.user.completedAt === null) throw venueError('ONBOARDING_REQUIRED', 403);
        await this.limits.consume(`venue-geocoder:user:${auth.session.userId}`, 30, 60);
        await this.limits.consume(`venue-geocoder:ip:${this.ip(request)}`, 120, 60);
        return this.venues.suggestions(query.query, query.limit);
    }

    @Get('venues/:venueId') detail(@Param('venueId', new ParseUUIDPipe()) venueId: string): Promise<object> {
        return this.venues.detail(venueId);
    }

    @Post('venues/candidates')
    @HttpCode(201)
    async createCandidate(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: CreateVenueCandidateDto
    ): Promise<object> {
        const auth = await this.identity.authenticate(authorization);
        await this.browser.assertSessionMutation(request, auth.session.platform);
        const result = await this.execute(auth.session.userId, key, '/v1/venues/candidates', body, (transaction) =>
            this.venues.createCandidate(auth, body, transaction)
        );
        response.setHeader('Idempotency-Replayed', String(result.replayed));
        return result.value;
    }

    @Get('venue-candidates/:candidateId')
    async candidate(
        @Headers('authorization') authorization: string | undefined,
        @Param('candidateId', new ParseUUIDPipe()) id: string
    ): Promise<object> {
        return this.venues.candidate(await this.identity.authenticate(authorization), id);
    }

    @Post('venues/:venueId/revisions')
    @HttpCode(201)
    async revise(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Param('venueId', new ParseUUIDPipe()) venueId: string,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: ProposeVenueRevisionDto
    ): Promise<object> {
        const auth = await this.identity.authenticate(authorization);
        await this.browser.assertSessionMutation(request, auth.session.platform);
        const result = await this.execute(
            auth.session.userId,
            key,
            `/v1/venues/${venueId}/revisions`,
            body,
            (transaction) => this.venues.revise(auth, venueId, body, transaction)
        );
        response.setHeader('Idempotency-Replayed', String(result.replayed));
        return result.value;
    }

    @Post('venues/:venueId/reports')
    @HttpCode(201)
    async report(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Param('venueId', new ParseUUIDPipe()) venueId: string,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: CreateVenueReportDto
    ): Promise<object> {
        const auth = await this.identity.authenticate(authorization);
        await this.browser.assertSessionMutation(request, auth.session.platform);
        try {
            const result = await this.execute(
                auth.session.userId,
                key,
                `/v1/venues/${venueId}/reports`,
                body,
                (transaction) => this.venues.report(auth, venueId, body, transaction)
            );
            response.setHeader('Idempotency-Replayed', String(result.replayed));
            if (body.reason === VenueReportReasonDto.PRIVATE_RESIDENCE) await this.cache.invalidateCatalogue();
            return result.value;
        } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
                throw venueError('VENUE_ALREADY_REPORTED', 409);
            throw error;
        }
    }

    private execute(
        userId: string,
        key: string | undefined,
        path: string,
        body: object,
        operation: Parameters<VenueIdempotencyService['execute']>[4]
    ): Promise<{ value: object; replayed: boolean }> {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(key ?? ''))
            throw venueError('VALIDATION_FAILED', 400);
        if (key === undefined) throw venueError('VALIDATION_FAILED', 400);
        return this.idempotency.execute(userId, key, path, body, operation);
    }

    private ip(request: Request): string {
        return request.ip ?? request.socket.remoteAddress ?? 'unknown';
    }
}
