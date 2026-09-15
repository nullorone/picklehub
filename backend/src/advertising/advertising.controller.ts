import {
    Body,
    Controller,
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
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
    AdministrationSessionService,
    type AuthenticatedAdmin,
} from '../administration/administration-session.service';
import type { AdminCapability } from '../administration/administration.policy';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { BrowserSecurityService } from '../identity/browser-security.service';
import { AdvertisingIdempotencyService } from './advertising-idempotency.service';
import { AdvertisingRateLimitService } from './advertising-rate-limit.service';
import { AdvertisingService } from './advertising.service';
import type {
    CampaignInput,
    CampaignRevisionInput,
    CreativeInput,
    DecisionContext,
    JsonRecord,
} from './advertising.types';
import { advertisingError } from './advertising.errors';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Controller()
export class AdvertisingController {
    constructor(
        private readonly advertising: AdvertisingService,
        private readonly administration: AdministrationSessionService,
        private readonly browser: BrowserSecurityService,
        private readonly idempotency: AdvertisingIdempotencyService,
        private readonly limits: AdvertisingRateLimitService,
        private readonly crypto: IdentityCryptoService
    ) {}

    @Post('advertising/decisions')
    @HttpCode(200)
    async decide(
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.exact(body, ['context']);
        await this.browser.assertMutation(request);
        const actor = this.publicScope(request, body.context);
        await this.limits.consume(`decision:${actor}`, 60, 60, false);
        return this.mutation(actor, key, 'POST', '/v1/advertising/decisions', body, 200, response, (tx) =>
            this.advertising.decide(body.context as DecisionContext, actor, tx)
        );
    }

    @Post('advertising/impressions')
    @HttpCode(200)
    async impression(
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.browser.assertMutation(request);
        const actor = this.publicScope(request, body.deliveryToken);
        await this.limits.consume(`impression:${String(body.deliveryToken)}`, 8, 60, true);
        return this.mutation(actor, key, 'POST', '/v1/advertising/impressions', body, 200, response, (tx) =>
            this.advertising.impression(body, tx)
        );
    }

    @Post('advertising/clicks')
    @HttpCode(200)
    async click(
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.browser.assertMutation(request);
        const actor = this.publicScope(request, body.clickToken);
        await this.limits.consume(`click:${String(body.clickToken)}`, 5, 60, true);
        return this.mutation(actor, key, 'POST', '/v1/advertising/clicks', body, 200, response, (tx) =>
            this.advertising.click(body, tx)
        );
    }

    @Get('admin/advertising/placements')
    async placements(
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20',
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.admin(authorization, 'AD_PLACEMENT_MANAGE');
        this.privateCache(response);
        return this.advertising.listPlacements(this.limit(limit));
    }

    @Post('admin/advertising/placements')
    async createPlacement(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const admin = await this.adminMutation(authorization, request, 'AD_PLACEMENT_MANAGE');
        response.status(201);
        return this.mutation(
            admin.actorId,
            key,
            'POST',
            '/v1/admin/advertising/placements',
            body,
            201,
            response,
            (tx) => this.advertising.createPlacement(admin.actorId, body, tx)
        );
    }

    @Put('admin/advertising/placements/:placementId')
    async updatePlacement(
        @Param('placementId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const admin = await this.adminMutation(authorization, request, 'AD_PLACEMENT_MANAGE');
        return this.mutation(
            admin.actorId,
            key,
            'PUT',
            `/v1/admin/advertising/placements/${id}`,
            body,
            200,
            response,
            (tx) => this.advertising.updatePlacement(admin.actorId, id, body, tx)
        );
    }

    @Get('admin/advertising/campaigns')
    async campaigns(
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20',
        @Query('state') state: string | undefined,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.admin(authorization, 'AD_CAMPAIGN_MANAGE');
        this.privateCache(response);
        return this.advertising.listCampaigns(this.limit(limit), state);
    }

    @Post('admin/advertising/campaigns')
    async createCampaign(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const admin = await this.adminMutation(authorization, request, 'AD_CAMPAIGN_MANAGE');
        response.status(201);
        return this.mutation(admin.actorId, key, 'POST', '/v1/admin/advertising/campaigns', body, 201, response, (tx) =>
            this.advertising.createCampaign(admin.actorId, body as CampaignInput, tx)
        );
    }

    @Get('admin/advertising/campaigns/:campaignId')
    async campaign(
        @Param('campaignId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.admin(authorization, 'AD_CAMPAIGN_MANAGE');
        this.privateCache(response);
        return this.advertising.getCampaign(id);
    }

    @Post('admin/advertising/campaigns/:campaignId/revisions')
    async createRevision(
        @Param('campaignId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const admin = await this.adminMutation(authorization, request, 'AD_CAMPAIGN_MANAGE');
        response.status(201);
        return this.mutation(
            admin.actorId,
            key,
            'POST',
            `/v1/admin/advertising/campaigns/${id}/revisions`,
            body,
            201,
            response,
            (tx) => this.advertising.createRevision(admin.actorId, id, body as CampaignRevisionInput, tx)
        );
    }

    @Post('admin/advertising/campaigns/:campaignId/decisions')
    async campaignDecision(
        @Param('campaignId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const admin = await this.adminMutation(authorization, request, 'AD_CAMPAIGN_REVIEW');
        return this.mutation(
            admin.actorId,
            key,
            'POST',
            `/v1/admin/advertising/campaigns/${id}/decisions`,
            body,
            200,
            response,
            (tx) => this.advertising.decideCampaign(admin.actorId, id, body, tx)
        );
    }

    @Post('admin/advertising/campaigns/:campaignId/pause')
    async pauseCampaign(
        @Param('campaignId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.stateMutation(id, authorization, key, body, request, response, false);
    }

    @Post('admin/advertising/campaigns/:campaignId/resume')
    async resumeCampaign(
        @Param('campaignId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        return this.stateMutation(id, authorization, key, body, request, response, true);
    }

    @Post('admin/advertising/creatives')
    async createCreative(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const admin = await this.adminMutation(authorization, request, 'AD_CREATIVE_MANAGE');
        response.status(201);
        return this.mutation(admin.actorId, key, 'POST', '/v1/admin/advertising/creatives', body, 201, response, (tx) =>
            this.advertising.createCreative(admin.actorId, body as CreativeInput, tx)
        );
    }

    @Get('admin/advertising/creatives/:creativeId')
    async creative(
        @Param('creativeId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.admin(authorization, 'AD_CREATIVE_MANAGE');
        this.privateCache(response);
        return this.advertising.getCreative(id);
    }

    @Get('admin/advertising/providers')
    async providers(
        @Headers('authorization') authorization: string | undefined,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.admin(authorization, 'AD_PROVIDER_GOVERN');
        this.privateCache(response);
        return this.advertising.listProviders();
    }

    @Post('admin/advertising/providers/:providerCode/state')
    async providerState(
        @Param('providerCode') code: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        const admin = await this.adminMutation(authorization, request, 'AD_PROVIDER_GOVERN', true);
        return this.mutation(
            admin.actorId,
            key,
            'POST',
            `/v1/admin/advertising/providers/${code}/state`,
            body,
            200,
            response,
            (tx) => this.advertising.changeProvider(admin.actorId, code, body, tx)
        );
    }

    @Post('admin/advertising/reports')
    @HttpCode(200)
    async report(
        @Headers('authorization') authorization: string | undefined,
        @Body() body: JsonRecord,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.adminMutation(authorization, request, 'AD_REPORT_READ');
        this.privateCache(response);
        return this.advertising.report(body);
    }

    private async stateMutation(
        id: string,
        authorization: string | undefined,
        key: string | undefined,
        body: JsonRecord,
        request: Request,
        response: Response,
        resume: boolean
    ): Promise<object> {
        const admin = await this.adminMutation(authorization, request, 'AD_CAMPAIGN_PAUSE');
        const action = resume ? 'resume' : 'pause';
        return this.mutation(
            admin.actorId,
            key,
            'POST',
            `/v1/admin/advertising/campaigns/${id}/${action}`,
            body,
            200,
            response,
            (tx) => this.advertising.campaignState(admin.actorId, id, body, resume, tx)
        );
    }

    private async admin(authorization: string | undefined, capability: AdminCapability): Promise<AuthenticatedAdmin> {
        const admin = await this.administration.authenticate(authorization);
        this.administration.assertCapability(admin, capability);
        return admin;
    }
    private async adminMutation(
        authorization: string | undefined,
        request: Request,
        capability: AdminCapability,
        reauthenticate = false
    ): Promise<AuthenticatedAdmin> {
        await this.browser.assertMutation(request);
        const admin = await this.admin(authorization, capability);
        if (reauthenticate) this.administration.assertFreshReauthentication(admin);
        return admin;
    }
    private async mutation<T>(
        actor: string,
        key: string | undefined,
        method: string,
        path: string,
        body: object,
        status: number,
        response: Response,
        operation: Parameters<AdvertisingIdempotencyService['execute']>[6]
    ): Promise<T> {
        if (key === undefined || !UUID_V4.test(key)) throw advertisingError('VALIDATION_FAILED', 400);
        this.privateCache(response);
        const result = await this.idempotency.execute(actor, key, method, path, body, status, operation);
        if (result.replayed) response.setHeader('Idempotency-Replayed', 'true');
        return result.value as T;
    }
    private publicScope(request: Request, token: unknown): string {
        const csrf = request.header('X-CSRF-Token') ?? '';
        return this.crypto.hash(`AD_PUBLIC:${csrf}:${typeof token === 'string' ? token : ''}`);
    }
    private privateCache(response: Response): void {
        response.setHeader('Cache-Control', 'private, no-store');
    }
    private exact(value: object, keys: readonly string[]): void {
        if (Object.keys(value).some((key) => !keys.includes(key))) throw advertisingError('VALIDATION_FAILED', 400);
    }
    private limit(value: string): number {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) throw advertisingError('VALIDATION_FAILED', 400);
        return parsed;
    }
}
