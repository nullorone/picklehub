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
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
    AdministrationSessionService,
    type AuthenticatedAdmin,
} from '../administration/administration-session.service';
import type { AdminCapability } from '../administration/administration.policy';
import { BrowserSecurityService } from '../identity/browser-security.service';
import { IdentityService } from '../identity/identity.service';
import { IdentityRateLimitService } from '../identity/rate-limit.service';
import { ContentIdempotencyService } from './content-idempotency.service';
import { contentError } from './content.errors';
import { ContentService } from './content.service';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
type Input = Record<string, unknown>;
const BODY_KEYS = {
    search: ['query', 'locale', 'category', 'tag', 'cursor', 'limit'],
    source: [
        'expectedVersion',
        'integrationKind',
        'legalName',
        'displayName',
        'canonicalOrigin',
        'endpoint',
        'attributionTemplate',
        'licenseNotice',
        'policyVersion',
        'rights',
    ],
    sourceState: ['expectedVersion', 'state', 'reason', 'reauthenticationProof'],
    sourcePause: ['expectedVersion', 'reason'],
    candidateDecision: ['expectedVersion', 'state', 'duplicateGroupId', 'duplicateKind', 'selectedArticleId', 'reason'],
    article: ['originKind', 'candidateId'],
    revision: [
        'expectedArticleVersion',
        'locale',
        'slug',
        'title',
        'subtitle',
        'summary',
        'body',
        'categoryId',
        'tagIds',
        'originKind',
        'origins',
        'media',
        'seo',
        'correctionNote',
        'translationOfRevisionId',
    ],
    decision: [
        'expectedArticleVersion',
        'revisionId',
        'decision',
        'reason',
        'checklist',
        'scheduledFor',
        'reauthenticationProof',
    ],
    emergency: ['expectedArticleVersion', 'revisionId', 'decision', 'reason', 'reauthenticationProof'],
} as const;

@Controller()
export class ContentController {
    constructor(
        private readonly content: ContentService,
        private readonly identity: IdentityService,
        private readonly administration: AdministrationSessionService,
        private readonly browser: BrowserSecurityService,
        private readonly limits: IdentityRateLimitService,
        private readonly idempotency: ContentIdempotencyService
    ) {}

    @Get('content/articles')
    async feed(
        @Query('limit') rawLimit = '20',
        @Query('cursor') cursor?: string,
        @Query('locale') locale?: string,
        @Query('category') category?: string,
        @Query('tag') tag?: string,
        @Res({ passthrough: true }) response?: Response
    ): Promise<object> {
        this.publicCache(response);
        return this.content.feed({
            limit: this.limit(rawLimit, 50),
            ...(cursor === undefined ? {} : { cursor }),
            ...(locale === undefined ? {} : { locale }),
            ...(category === undefined ? {} : { category }),
            ...(tag === undefined ? {} : { tag }),
        });
    }

    @Get('content/articles/:locale/:slug')
    async article(
        @Param('locale') locale: string,
        @Param('slug') slug: string,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.publicCache(response);
        return this.content.article(locale, slug);
    }

    @Post('content/search')
    @HttpCode(200)
    async search(
        @Body() body: Input,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.exact(body, BODY_KEYS.search);
        this.privateCache(response);
        await this.limits.consume(
            `content-search:ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`,
            60,
            60
        );
        const query = typeof body.query === 'string' ? body.query : '';
        const locale = typeof body.locale === 'string' ? body.locale : '';
        const rawLimit = typeof body.limit === 'number' || typeof body.limit === 'string' ? String(body.limit) : '20';
        return this.content.search(
            query,
            locale,
            {
                limit: this.limit(rawLimit, 50),
                ...(typeof body.cursor === 'string' ? { cursor: body.cursor } : {}),
            },
            typeof body.category === 'string' ? body.category : undefined,
            typeof body.tag === 'string' ? body.tag : undefined
        );
    }

    @Get('content/bookmarks')
    async bookmarks(
        @Headers('authorization') authorization: string | undefined,
        @Req() request: Request,
        @Query('limit') rawLimit = '20',
        @Query('cursor') cursor?: string,
        @Res({ passthrough: true }) response?: Response
    ): Promise<object> {
        if (response !== undefined) this.privateCache(response);
        return this.content.bookmarks(await this.user(authorization, request), {
            limit: this.limit(rawLimit, 50),
            ...(cursor === undefined ? {} : { cursor }),
        });
    }

    @Put('content/bookmarks/:articleId')
    async putBookmark(
        @Param('articleId', new ParseUUIDPipe()) articleId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.browser.assertMutation(request);
        const userId = await this.user(authorization, request);
        return this.mutation(userId, key, 'PUT', `/v1/content/bookmarks/${articleId}`, {}, 200, response, (tx) =>
            this.content.putBookmark(userId, articleId, tx)
        );
    }

    @Delete('content/bookmarks/:articleId')
    @HttpCode(204)
    async removeBookmark(
        @Param('articleId', new ParseUUIDPipe()) articleId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<void> {
        await this.browser.assertMutation(request);
        const userId = await this.user(authorization, request);
        await this.mutation(userId, key, 'DELETE', `/v1/content/bookmarks/${articleId}`, {}, 204, response, (tx) =>
            this.content.removeBookmark(userId, articleId, tx)
        );
    }

    @Get('admin/content/sources')
    async sources(
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20',
        @Query('cursor') cursor?: string,
        @Res({ passthrough: true }) response?: Response
    ): Promise<object> {
        await this.admin(authorization, 'CONTENT_SOURCE_READ');
        if (response !== undefined) this.privateCache(response);
        return this.content.listSources({
            limit: this.limit(limit, 100),
            ...(cursor === undefined ? {} : { cursor }),
        });
    }

    @Post('admin/content/sources')
    async createSource(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: Input,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.exact(body, BODY_KEYS.source);
        const admin = await this.adminMutation(authorization, request, 'CONTENT_SOURCE_PROPOSE');
        response.status(201);
        return this.mutation(admin.actorId, key, 'POST', '/v1/admin/content/sources', body, 201, response, (tx) =>
            this.content.createSource(admin.actorId, body as never, tx)
        );
    }

    @Put('admin/content/sources/:sourceId')
    async updateSource(
        @Param('sourceId', new ParseUUIDPipe()) sourceId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: Input,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.exact(body, BODY_KEYS.source);
        const admin = await this.adminMutation(authorization, request, 'CONTENT_SOURCE_PROPOSE');
        return this.mutation(
            admin.actorId,
            key,
            'PUT',
            `/v1/admin/content/sources/${sourceId}`,
            body,
            200,
            response,
            (tx) => this.content.updateSource(admin.actorId, sourceId, body as never, tx)
        );
    }

    @Post('admin/content/sources/:sourceId/state')
    async sourceState(
        @Param('sourceId', new ParseUUIDPipe()) sourceId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: Input,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.exact(body, BODY_KEYS.sourceState);
        const admin = await this.adminMutation(authorization, request, 'CONTENT_SOURCE_GOVERN', true);
        this.reauthenticationProof(body);
        return this.mutation(
            admin.actorId,
            key,
            'POST',
            `/v1/admin/content/sources/${sourceId}/state`,
            body,
            200,
            response,
            (tx) =>
                this.content.changeSourceState(
                    admin.actorId,
                    sourceId,
                    Number(body.expectedVersion),
                    String(body.state),
                    String(body.reason),
                    tx
                )
        );
    }

    @Post('admin/content/sources/:sourceId/pause')
    async pauseSource(
        @Param('sourceId', new ParseUUIDPipe()) sourceId: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: Input,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.exact(body, BODY_KEYS.sourcePause);
        const admin = await this.adminMutation(authorization, request, 'CONTENT_SOURCE_PAUSE');
        return this.mutation(
            admin.actorId,
            key,
            'POST',
            `/v1/admin/content/sources/${sourceId}/pause`,
            body,
            200,
            response,
            (tx) =>
                this.content.pauseSource(admin.actorId, sourceId, Number(body.expectedVersion), String(body.reason), tx)
        );
    }

    @Get('admin/content/candidates')
    async candidates(
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20',
        @Query('state') state?: string,
        @Query('cursor') cursor?: string,
        @Res({ passthrough: true }) response?: Response
    ): Promise<object> {
        await this.admin(authorization, 'CONTENT_CANDIDATE_REVIEW');
        if (response !== undefined) this.privateCache(response);
        return this.content.listCandidates(
            { limit: this.limit(limit, 100), ...(cursor === undefined ? {} : { cursor }) },
            state
        );
    }

    @Get('admin/content/candidates/:candidateId')
    async candidate(
        @Param('candidateId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Res({ passthrough: true }) response?: Response
    ): Promise<object> {
        await this.admin(authorization, 'CONTENT_CANDIDATE_REVIEW');
        if (response !== undefined) this.privateCache(response);
        return this.content.candidateById(id);
    }

    @Post('admin/content/candidates/:candidateId/decision')
    async decideCandidate(
        @Param('candidateId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: Input,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.exact(body, BODY_KEYS.candidateDecision);
        const admin = await this.adminMutation(authorization, request, 'CONTENT_CANDIDATE_REVIEW');
        return this.mutation(
            admin.actorId,
            key,
            'POST',
            `/v1/admin/content/candidates/${id}/decision`,
            body,
            200,
            response,
            (tx) => this.content.decideCandidate(admin.actorId, id, body, tx)
        );
    }

    @Get('admin/content/articles')
    async adminArticles(
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20',
        @Query('state') state?: string,
        @Query('cursor') cursor?: string,
        @Res({ passthrough: true }) response?: Response
    ): Promise<object> {
        await this.admin(authorization, 'CONTENT_EDIT');
        if (response !== undefined) this.privateCache(response);
        return this.content.listArticles(
            { limit: this.limit(limit, 100), ...(cursor === undefined ? {} : { cursor }) },
            state
        );
    }

    @Post('admin/content/articles')
    async createArticle(
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: Input,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.exact(body, BODY_KEYS.article);
        const admin = await this.adminMutation(authorization, request, 'CONTENT_EDIT');
        response.status(201);
        return this.mutation(admin.actorId, key, 'POST', '/v1/admin/content/articles', body, 201, response, (tx) =>
            this.content.createArticle(
                admin.actorId,
                String(body.originKind),
                typeof body.candidateId === 'string' ? body.candidateId : undefined,
                tx
            )
        );
    }

    @Get('admin/content/articles/:articleId')
    async adminArticle(
        @Param('articleId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Res({ passthrough: true }) response?: Response
    ): Promise<object> {
        await this.admin(authorization, 'CONTENT_EDIT');
        if (response !== undefined) this.privateCache(response);
        return this.content.adminArticleById(id);
    }

    @Get('admin/content/articles/:articleId/revisions')
    async revisions(
        @Param('articleId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Query('limit') limit = '20',
        @Query('cursor') cursor?: string,
        @Res({ passthrough: true }) response?: Response
    ): Promise<object> {
        await this.admin(authorization, 'CONTENT_EDIT');
        if (response !== undefined) this.privateCache(response);
        return this.content.revisions(id, {
            limit: this.limit(limit, 100),
            ...(cursor === undefined ? {} : { cursor }),
        });
    }

    @Post('admin/content/articles/:articleId/revisions')
    async createRevision(
        @Param('articleId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: Input,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.exact(body, BODY_KEYS.revision);
        const admin = await this.adminMutation(authorization, request, 'CONTENT_EDIT');
        response.status(201);
        return this.mutation(
            admin.actorId,
            key,
            'POST',
            `/v1/admin/content/articles/${id}/revisions`,
            body,
            201,
            response,
            (tx) => this.content.createRevision(admin.actorId, id, body as never, tx)
        );
    }

    @Get('admin/content/articles/:articleId/revisions/:revisionId')
    async revision(
        @Param('articleId', new ParseUUIDPipe()) articleId: string,
        @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
        @Headers('authorization') authorization: string | undefined,
        @Res({ passthrough: true }) response?: Response
    ): Promise<object> {
        await this.admin(authorization, 'CONTENT_EDIT');
        if (response !== undefined) this.privateCache(response);
        return this.content.revision(articleId, revisionId);
    }

    @Get('admin/content/articles/:articleId/revisions/:revisionId/preview')
    async preview(
        @Param('articleId', new ParseUUIDPipe()) articleId: string,
        @Param('revisionId', new ParseUUIDPipe()) revisionId: string,
        @Headers('authorization') authorization: string | undefined,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        await this.admin(authorization, 'CONTENT_PREVIEW');
        this.privateCache(response);
        response.setHeader('X-Robots-Tag', 'noindex, nofollow');
        return this.content.revision(articleId, revisionId);
    }

    @Post('admin/content/articles/:articleId/decisions')
    async decideArticle(
        @Param('articleId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: Input,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.exact(body, BODY_KEYS.decision);
        const admin = await this.adminMutation(authorization, request, 'CONTENT_PUBLISH');
        return this.mutation(
            admin.actorId,
            key,
            'POST',
            `/v1/admin/content/articles/${id}/decisions`,
            body,
            200,
            response,
            (tx) => this.content.decideArticle(admin.actorId, id, body as never, tx)
        );
    }

    @Post('admin/content/articles/:articleId/emergency-unpublish')
    async emergencyUnpublish(
        @Param('articleId', new ParseUUIDPipe()) id: string,
        @Headers('authorization') authorization: string | undefined,
        @Headers('idempotency-key') key: string | undefined,
        @Body() body: Input,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response
    ): Promise<object> {
        this.exact(body, BODY_KEYS.emergency);
        const admin = await this.adminMutation(authorization, request, 'CONTENT_EMERGENCY_UNPUBLISH', true);
        this.reauthenticationProof(body);
        if (
            body.decision !== 'UNPUBLISH' ||
            typeof body.reason !== 'string' ||
            !['CORRECTION', 'RIGHTS_REVOKED', 'LEGAL_TAKEDOWN', 'SAFETY_REQUEST'].includes(body.reason)
        )
            throw contentError('VALIDATION_FAILED', 400);
        return this.mutation(
            admin.actorId,
            key,
            'POST',
            `/v1/admin/content/articles/${id}/emergency-unpublish`,
            body,
            200,
            response,
            (tx) => this.content.decideArticle(admin.actorId, id, body as never, tx)
        );
    }

    private async user(authorization: string | undefined, request: Request): Promise<string> {
        const auth = await this.identity.authenticate(authorization);
        if (auth.session.user.completedAt === null) throw contentError('ONBOARDING_REQUIRED', 403);
        await this.limits.consume(`content:user:${auth.session.userId}`, 120, 60);
        await this.limits.consume(`content:ip:${request.ip ?? request.socket.remoteAddress ?? 'unknown'}`, 240, 60);
        return auth.session.userId;
    }

    private async admin(authorization: string | undefined, capability: AdminCapability): Promise<AuthenticatedAdmin> {
        const admin = await this.administration.authenticate(authorization);
        this.administration.assertCapability(admin, capability);
        await this.limits.consume(`content-admin:${admin.actorId}`, 180, 60);
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
        actorId: string,
        key: string | undefined,
        method: string,
        path: string,
        body: object,
        status: number,
        response: Response,
        operation: Parameters<ContentIdempotencyService['execute']>[6]
    ): Promise<T> {
        if (key === undefined || !UUID_V4.test(key)) throw contentError('VALIDATION_FAILED', 400);
        this.privateCache(response);
        const result = await this.idempotency.execute(actorId, key, method, path, body, status, operation);
        response.setHeader('Idempotency-Replayed', String(result.replayed));
        return result.value as T;
    }

    private reauthenticationProof(body: Input): void {
        if (typeof body.reauthenticationProof !== 'string' || !UUID_V4.test(body.reauthenticationProof))
            throw contentError('REAUTHENTICATION_REQUIRED', 401);
    }

    private limit(raw: string, maximum: number): number {
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 1 || value > maximum) throw contentError('VALIDATION_FAILED', 400);
        return value;
    }

    private exact(body: Input, keys: readonly string[]): void {
        if (Object.keys(body).some((key) => !keys.includes(key))) throw contentError('VALIDATION_FAILED', 400);
    }

    private privateCache(response: Response): void {
        response.setHeader('Cache-Control', 'private, no-store');
    }
    private publicCache(response?: Response): void {
        response?.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    }
}
