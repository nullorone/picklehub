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
    BindNotificationDeviceDto,
    EditMessageDto,
    MarkConversationReadDto,
    ReportMessageDto,
    SendMessageDto,
    UpdateNotificationPreferenceDto,
} from './communication.dto';
import { communicationError } from './communication.errors';
import { CommunicationIdempotencyService } from './communication-idempotency.service';
import { CommunicationService } from './communication.service';

@Controller()
@UseInterceptors(NoStoreInterceptor)
export class CommunicationController {
    constructor(
        private readonly communications: CommunicationService,
        private readonly identity: IdentityService,
        private readonly browser: BrowserSecurityService,
        private readonly limits: IdentityRateLimitService,
        private readonly idempotency: CommunicationIdempotencyService
    ) {}

    @Get('matches/:matchId/conversation') async snapshot(
        @Param('matchId', new ParseUUIDPipe()) matchId: string,
        @Headers('authorization') authorization: string | undefined
    ): Promise<object> {
        const userId = await this.user(authorization);
        await this.limits.consume(`chat-read:user:${userId}`, 180, 60);
        return this.communications.snapshot(userId, matchId);
    }

    @Get('matches/:matchId/conversation/messages') async history(
        @Param('matchId', new ParseUUIDPipe()) matchId: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('cursor') cursor: string,
        @Query('limit') limit = '50'
    ): Promise<object> {
        const userId = await this.user(authorization);
        await this.limits.consume(`chat-read:user:${userId}`, 180, 60);
        if (typeof cursor !== 'string' || cursor.length === 0) throw communicationError('INVALID_CURSOR', 400);
        return this.communications.history(userId, matchId, cursor, this.limit(limit));
    }

    @Post('matches/:matchId/conversation/messages') @HttpCode(201) async send(
        @Param('matchId', new ParseUUIDPipe()) matchId: string,
        @Body() body: SendMessageDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/matches/${matchId}/conversation/messages`,
            body,
            201,
            request,
            response,
            (userId, tx) => this.communications.send(userId, matchId, body.text, tx)
        );
    }

    @Patch('matches/:matchId/conversation/messages/:messageId') async edit(
        @Param('matchId', new ParseUUIDPipe()) matchId: string,
        @Param('messageId', new ParseUUIDPipe()) messageId: string,
        @Body() body: EditMessageDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'PATCH',
            `/v1/matches/${matchId}/conversation/messages/${messageId}`,
            body,
            200,
            request,
            response,
            (userId, tx) => this.communications.edit(userId, matchId, messageId, body.expectedRevision, body.text, tx)
        );
    }

    @Delete('matches/:matchId/conversation/messages/:messageId') async remove(
        @Param('matchId', new ParseUUIDPipe()) matchId: string,
        @Param('messageId', new ParseUUIDPipe()) messageId: string,
        @Query('expectedRevision', ParseIntPipe) expectedRevision: number,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'DELETE',
            `/v1/matches/${matchId}/conversation/messages/${messageId}`,
            { expectedRevision },
            200,
            request,
            response,
            (userId, tx) => this.communications.remove(userId, matchId, messageId, expectedRevision, tx)
        );
    }

    @Post('matches/:matchId/conversation/read') async markRead(
        @Param('matchId', new ParseUUIDPipe()) matchId: string,
        @Body() body: MarkConversationReadDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/matches/${matchId}/conversation/read`,
            body,
            200,
            request,
            response,
            (userId, tx) => this.communications.markRead(userId, matchId, body.throughSequence, tx)
        );
    }

    @Post('matches/:matchId/conversation/messages/:messageId/reports') @HttpCode(201) async report(
        @Param('matchId', new ParseUUIDPipe()) matchId: string,
        @Param('messageId', new ParseUUIDPipe()) messageId: string,
        @Body() body: ReportMessageDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/matches/${matchId}/conversation/messages/${messageId}/reports`,
            body,
            201,
            request,
            response,
            (userId, tx, operationId) =>
                this.communications.report(userId, matchId, messageId, body.revision, body.reason, operationId, tx)
        );
    }

    @Put('communication-blocks/:blockedUserId') async block(
        @Param('blockedUserId', new ParseUUIDPipe()) blockedUserId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'PUT',
            `/v1/communication-blocks/${blockedUserId}`,
            {},
            200,
            request,
            response,
            (userId, tx) => this.communications.block(userId, blockedUserId, tx)
        );
    }

    @Delete('communication-blocks/:blockedUserId') @HttpCode(204) async unblock(
        @Param('blockedUserId', new ParseUUIDPipe()) blockedUserId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<void> {
        await this.command(
            authorization,
            key,
            'DELETE',
            `/v1/communication-blocks/${blockedUserId}`,
            {},
            204,
            request,
            response,
            (userId, tx) => this.communications.unblock(userId, blockedUserId, tx)
        );
    }

    @Get('notifications') async notifications(
        @Headers('authorization') authorization: string | undefined,
        @Query('cursor') cursor?: string,
        @Query('limit') limit = '50'
    ): Promise<object> {
        const userId = await this.user(authorization);
        return this.communications.listNotifications(userId, cursor, this.limit(limit));
    }

    @Post('notifications/:notificationId/read') async readNotification(
        @Param('notificationId', new ParseUUIDPipe()) notificationId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            `/v1/notifications/${notificationId}/read`,
            {},
            200,
            request,
            response,
            (userId, tx) => this.communications.readNotification(userId, notificationId, tx)
        );
    }

    @Get('notification-preferences') async preferences(
        @Headers('authorization') authorization: string | undefined
    ): Promise<object> {
        return this.communications.preferences(await this.user(authorization));
    }

    @Put('notification-preferences') async updatePreferences(
        @Body() body: UpdateNotificationPreferenceDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'PUT',
            '/v1/notification-preferences',
            body,
            200,
            request,
            response,
            (userId, tx) => this.communications.updatePreferences(userId, body, tx)
        );
    }

    @Post('notification-devices') @HttpCode(201) async bindDevice(
        @Body() body: BindNotificationDeviceDto,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.command(
            authorization,
            key,
            'POST',
            '/v1/notification-devices',
            body,
            201,
            request,
            response,
            (userId, tx) => this.communications.bindDevice(userId, body, tx)
        );
    }

    @Delete('notification-devices/:installationId') @HttpCode(204) async unbindDevice(
        @Param('installationId', new ParseUUIDPipe({ version: '4' })) installationId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<void> {
        await this.command(
            authorization,
            key,
            'DELETE',
            `/v1/notification-devices/${installationId}`,
            {},
            204,
            request,
            response,
            (userId, tx) => this.communications.unbindDevice(userId, installationId, tx)
        );
    }

    private async command<T>(
        authorization: string | undefined,
        key: string | undefined,
        method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
        path: string,
        body: object,
        status: number,
        request: Request,
        response: Response,
        operation: (userId: string, transaction: Prisma.TransactionClient, operationId: string) => Promise<T>
    ): Promise<T> {
        await this.browser.assertMutation(request);
        const userId = await this.user(authorization);
        if (key === undefined || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(key))
            throw communicationError('VALIDATION_FAILED', 400);
        await this.limits.consume(`communication-command:user:${userId}`, path.includes('/messages') ? 60 : 120, 60);
        const result = await this.idempotency.execute(userId, key, method, path, body, status, (transaction) =>
            operation(userId, transaction, key)
        );
        response.setHeader('Idempotency-Replayed', String(result.replayed));
        return result.value;
    }

    private async user(authorization: string | undefined): Promise<string> {
        return (await this.identity.authenticate(authorization)).session.userId;
    }

    private limit(value: string): number {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) throw communicationError('VALIDATION_FAILED', 400);
        return parsed;
    }
}
