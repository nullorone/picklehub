import {
    Body,
    Controller,
    Delete,
    Get,
    Headers,
    HttpCode,
    Param,
    ParseUUIDPipe,
    Patch,
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
    AvatarUploadRequestDto,
    ExpectedProfileVersionDto,
    SetDuprProfileLinkDto,
    UpdatePlayerProfileDto,
    UpdateProfilePrivacyDto,
} from './profile.dto';
import { profileError } from './profile.errors';
import { ProfileIdempotencyService } from './profile-idempotency.service';
import { ProfileService } from './profile.service';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Controller()
@UseInterceptors(NoStoreInterceptor)
export class ProfileController {
    constructor(
        private readonly profiles: ProfileService,
        private readonly identity: IdentityService,
        private readonly browser: BrowserSecurityService,
        private readonly limits: IdentityRateLimitService,
        private readonly idempotency: ProfileIdempotencyService
    ) {}

    @Get('me/profile')
    async own(@Headers('authorization') authorization: string | undefined, @Req() request: Request): Promise<object> {
        const userId = await this.readAuth(authorization, request);
        return this.profiles.own(userId);
    }

    @Patch('me/profile')
    async update(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: UpdatePlayerProfileDto
    ): Promise<object> {
        const userId = await this.mutationAuth(authorization, request);
        return this.execute(userId, key, 'PATCH', '/v1/me/profile', body, 200, response, (transaction) =>
            this.profiles.update(userId, body, transaction)
        );
    }

    @Get('me/profile/privacy')
    async privacy(
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request
    ): Promise<object> {
        return this.profiles.privacy(await this.readAuth(authorization, request));
    }

    @Patch('me/profile/privacy')
    async updatePrivacy(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: UpdateProfilePrivacyDto
    ): Promise<object> {
        const userId = await this.mutationAuth(authorization, request);
        return this.execute(userId, key, 'PATCH', '/v1/me/profile/privacy', body, 200, response, (transaction) =>
            this.profiles.updatePrivacy(userId, body, transaction)
        );
    }

    @Put('me/profile/external-links/dupr')
    async setDupr(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: SetDuprProfileLinkDto
    ): Promise<object> {
        const userId = await this.mutationAuth(authorization, request);
        return this.execute(
            userId,
            key,
            'PUT',
            '/v1/me/profile/external-links/dupr',
            body,
            200,
            response,
            (transaction) => this.profiles.setDupr(userId, body, transaction)
        );
    }

    @Delete('me/profile/external-links/dupr')
    @HttpCode(204)
    async removeDupr(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: ExpectedProfileVersionDto
    ): Promise<void> {
        const userId = await this.mutationAuth(authorization, request);
        await this.execute(
            userId,
            key,
            'DELETE',
            '/v1/me/profile/external-links/dupr',
            body,
            204,
            response,
            (transaction) => this.profiles.removeDupr(userId, body.expectedVersion, transaction)
        );
    }

    @Post('me/profile/avatar-uploads')
    @HttpCode(201)
    async avatarUpload(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: AvatarUploadRequestDto
    ): Promise<object> {
        const userId = await this.mutationAuth(authorization, request);
        return this.execute(userId, key, 'POST', '/v1/me/profile/avatar-uploads', body, 201, response, (transaction) =>
            this.profiles.createAvatarUpload(userId, body, transaction)
        );
    }

    @Delete('me/profile/avatar')
    @HttpCode(204)
    async removeAvatar(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
        @Body() body: ExpectedProfileVersionDto
    ): Promise<void> {
        const userId = await this.mutationAuth(authorization, request);
        await this.execute(userId, key, 'DELETE', '/v1/me/profile/avatar', body, 204, response, (transaction) =>
            this.profiles.removeAvatar(userId, body.expectedVersion, transaction)
        );
    }

    @Get('me/statistics')
    async ownStatistics(
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request
    ): Promise<object> {
        return this.profiles.ownStatistics(await this.readAuth(authorization, request));
    }

    @Get('me/match-history')
    async ownHistory(
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request,
        @Query('limit') rawLimit = '20',
        @Query('cursor') cursor?: string
    ): Promise<object> {
        const userId = await this.readAuth(authorization, request);
        return this.profiles.history({
            subjectId: userId,
            viewerId: userId,
            publicOnly: false,
            limit: this.limit(rawLimit),
            ...(cursor === undefined ? {} : { cursor }),
        });
    }

    @Get('players/:playerId')
    async publicProfile(
        @Param('playerId', new ParseUUIDPipe()) playerId: string,
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request
    ): Promise<object> {
        const viewerId = await this.optionalAuth(authorization, request);
        return this.profiles.publicProfile(playerId, viewerId);
    }

    @Get('players/:playerId/statistics')
    async publicStatistics(
        @Param('playerId', new ParseUUIDPipe()) playerId: string,
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request
    ): Promise<object> {
        const viewerId = await this.optionalAuth(authorization, request);
        return this.profiles.publicStatistics(playerId, viewerId);
    }

    @Get('players/:playerId/match-history')
    async publicHistory(
        @Param('playerId', new ParseUUIDPipe()) playerId: string,
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request,
        @Query('limit') rawLimit = '20',
        @Query('cursor') cursor?: string
    ): Promise<object> {
        const viewerId = await this.optionalAuth(authorization, request);
        return this.profiles.history({
            subjectId: playerId,
            ...(viewerId === undefined ? {} : { viewerId }),
            publicOnly: true,
            limit: this.limit(rawLimit),
            ...(cursor === undefined ? {} : { cursor }),
        });
    }

    private async readAuth(authorization: string | undefined, request: Request): Promise<string> {
        const auth = await this.identity.authenticate(authorization);
        await this.limits.consume(`profile-read:user:${auth.session.userId}`, 120, 60);
        await this.limits.consume(`profile-read:ip:${this.ip(request)}`, 240, 60);
        return auth.session.userId;
    }

    private async optionalAuth(authorization: string | undefined, request: Request): Promise<string | undefined> {
        await this.limits.consume(`profile-public:ip:${this.ip(request)}`, 240, 60);
        if (authorization === undefined) return undefined;
        const auth = await this.identity.authenticate(authorization);
        await this.limits.consume(`profile-read:user:${auth.session.userId}`, 120, 60);
        return auth.session.userId;
    }

    private async mutationAuth(authorization: string | undefined, request: Request): Promise<string> {
        const auth = await this.identity.authenticate(authorization);
        await this.browser.assertSessionMutation(request, auth.session.platform);
        await this.limits.consume(`profile-mutation:user:${auth.session.userId}`, 30, 60);
        await this.limits.consume(`profile-mutation:ip:${this.ip(request)}`, 120, 60);
        return auth.session.userId;
    }

    private async execute<T>(
        userId: string,
        key: string | undefined,
        method: string,
        path: string,
        body: object,
        status: number,
        response: Response,
        operation: (transaction: Prisma.TransactionClient) => Promise<T>
    ): Promise<T> {
        if (key === undefined || !UUID_V4.test(key)) throw profileError('VALIDATION_FAILED', 400);
        const result = await this.idempotency.execute(userId, key, method, path, body, status, operation);
        response.setHeader('Idempotency-Replayed', result.replayed ? 'true' : 'false');
        return result.value;
    }

    private limit(raw: string): number {
        const limit = Number(raw);
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw profileError('VALIDATION_FAILED', 400);
        return limit;
    }

    private ip(request: Request): string {
        return request.ip ?? request.socket.remoteAddress ?? 'unknown';
    }
}
