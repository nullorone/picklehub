import { Injectable } from '@nestjs/common';
import { Prisma, VenueCandidateState, VenuePublicationState, VenueReportReason, VenueSourceKind } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { Clock } from '../identity/clock';
import { CursorService } from '../identity/cursor.service';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import type { AuthenticatedIdentity } from '../identity/identity.service';
import { OutboxService } from '../outbox/outbox.service';
import type {
    CreateVenueCandidateDto,
    CreateVenueReportDto,
    ProposeVenueRevisionDto,
    VenueFiltersDto,
    VenueListQueryDto,
    VenueMapQueryDto,
} from './venue.dto';
import { VenueReportReasonDto } from './venue.dto';
import { venueError } from './venue.errors';
import { VenueMatchPort } from './venue-match.port';
import { VenueMetricsService } from './venue-metrics.service';
import { coordinateHasAllowedPrecision, normalizeVenueAddress, normalizeVenueText } from './venue-normalization';
import { GeocoderPort, STORED_VENUE_FIELDS } from './venue-provider';

interface SearchRow {
    id: string;
    name: string;
    normalizedAddress: string;
    locality: string;
    longitude: number;
    latitude: number;
    verificationState: string;
    accessMode: string;
    environment: string;
    version: number;
    lastVerifiedAt: Date;
    distanceMeters: number | null;
    rank: number | null;
    sources?: AttributionSource[];
}

interface AttributionSource {
    kind: string;
    attributionText: string;
    attributionLink: string | null;
    observedAt: Date;
}

interface SummaryVenue {
    id: string;
    name: string;
    normalizedAddress: string;
    locality: string;
    longitude: Prisma.Decimal | number;
    latitude: Prisma.Decimal | number;
    verificationState: string;
    accessMode: string;
    environment: string;
    version: number;
    lastVerifiedAt: Date;
    distanceMeters?: number | null;
    sources?: AttributionSource[];
}

interface VenueCursor {
    type: 'venue-search';
    bind: string;
    snapshotAt: string;
    lastId: string;
    lastName?: string;
    lastDistance?: number;
    lastRank?: number;
}

@Injectable()
export class VenueService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly clock: Clock,
        private readonly cursors: CursorService,
        private readonly crypto: IdentityCryptoService,
        private readonly geocoder: GeocoderPort,
        private readonly matches: VenueMatchPort,
        private readonly outbox: OutboxService,
        private readonly audit: AuditService,
        private readonly requestContext: RequestContextService,
        private readonly metrics: VenueMetricsService
    ) {}

    async searchList(query: VenueListQueryDto): Promise<object> {
        const radiusParts = [query.longitude, query.latitude, query.radiusMeters];
        const hasRadius = radiusParts.every((value) => value !== undefined);
        const hasPartialRadius = radiusParts.some((value) => value !== undefined) && !hasRadius;
        const hasText = query.query !== undefined;
        if (
            hasPartialRadius ||
            hasRadius === hasText ||
            (query.radiusMeters !== undefined && (query.radiusMeters < 1 || query.radiusMeters > 50_000))
        ) {
            throw venueError('VALIDATION_FAILED', 400);
        }
        const mode = hasRadius ? 'radius' : 'text';
        const normalizedQuery = hasText ? normalizeVenueText(query.query ?? '') : undefined;
        if (hasText && normalizedQuery === '') throw venueError('VALIDATION_FAILED', 400);
        const bind = this.bind({
            mode,
            ...this.filterShape(query),
            longitude: query.longitude,
            latitude: query.latitude,
            radiusMeters: query.radiusMeters,
            query: normalizedQuery,
        });
        const cursor = this.cursor(query.cursor, bind);
        const snapshotAt = cursor?.snapshotAt ?? this.clock.now().toISOString();
        const filter = this.sqlFilters(query);
        const limit = query.limit;
        const pagination = hasRadius
            ? cursor === undefined
                ? Prisma.empty
                : Prisma.sql`AND (ST_Distance(v.location, origin.point), v.id) > (${cursor.lastDistance ?? -1}, ${cursor.lastId}::uuid)`
            : cursor === undefined
              ? Prisma.empty
              : Prisma.sql`AND (-ts_rank(v.search_document, search.query), lower(v.name), v.id) > (${-1 * (cursor.lastRank ?? 0)}, ${cursor.lastName ?? ''}, ${cursor.lastId}::uuid)`;
        const rows = hasRadius
            ? await this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
                SELECT v.id, v.name, v.normalized_address AS "normalizedAddress", v.locality,
                    v.longitude::double precision AS longitude, v.latitude::double precision AS latitude,
                    v.verification_state::text AS "verificationState", v.access_mode::text AS "accessMode",
                    v.environment::text AS environment, v.version, v.last_verified_at AS "lastVerifiedAt",
                    ST_Distance(v.location, origin.point) AS "distanceMeters", NULL::double precision AS rank
                FROM venues v CROSS JOIN (SELECT ST_SetSRID(ST_MakePoint(${query.longitude}, ${query.latitude}), 4326)::geography point) origin
                WHERE v.publication_state = 'PUBLISHED' AND v.created_at <= ${new Date(snapshotAt)}
                  AND ST_DWithin(v.location, origin.point, ${query.radiusMeters}) ${filter} ${pagination}
                ORDER BY "distanceMeters", v.id LIMIT ${limit + 1}`)
            : await this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
                SELECT v.id, v.name, v.normalized_address AS "normalizedAddress", v.locality,
                    v.longitude::double precision AS longitude, v.latitude::double precision AS latitude,
                    v.verification_state::text AS "verificationState", v.access_mode::text AS "accessMode",
                    v.environment::text AS environment, v.version, v.last_verified_at AS "lastVerifiedAt",
                    NULL::double precision AS "distanceMeters", ts_rank(v.search_document, search.query) AS rank
                FROM venues v CROSS JOIN (SELECT websearch_to_tsquery('simple', ${normalizedQuery}) query) search
                WHERE v.publication_state = 'PUBLISHED' AND v.created_at <= ${new Date(snapshotAt)}
                  AND v.search_document @@ search.query ${filter} ${pagination}
                ORDER BY rank DESC, lower(v.name), v.id LIMIT ${limit + 1}`);
        return this.page(rows, limit, bind, snapshotAt, mode === 'text');
    }

    async searchMap(query: VenueMapQueryDto): Promise<object> {
        if (query.west >= query.east || query.south >= query.north) throw venueError('VALIDATION_FAILED', 400);
        const centreLatitude = (query.south + query.north) / 2;
        const width = this.distance(query.west, centreLatitude, query.east, centreLatitude);
        const height = this.distance(query.west, query.south, query.west, query.north);
        if (width > 100_000 || height > 100_000) throw venueError('SEARCH_AREA_TOO_LARGE', 400);
        const bind = this.bind({
            mode: 'map',
            ...this.filterShape(query),
            west: query.west,
            south: query.south,
            east: query.east,
            north: query.north,
        });
        const cursor = this.cursor(query.cursor, bind);
        const snapshotAt = cursor?.snapshotAt ?? this.clock.now().toISOString();
        const pagination =
            cursor === undefined
                ? Prisma.empty
                : Prisma.sql`AND (lower(v.name), v.id) > (${cursor.lastName ?? ''}, ${cursor.lastId}::uuid)`;
        const rows = await this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
            SELECT v.id, v.name, v.normalized_address AS "normalizedAddress", v.locality,
                v.longitude::double precision AS longitude, v.latitude::double precision AS latitude,
                v.verification_state::text AS "verificationState", v.access_mode::text AS "accessMode",
                v.environment::text AS environment, v.version, v.last_verified_at AS "lastVerifiedAt",
                NULL::double precision AS "distanceMeters", NULL::double precision AS rank
            FROM venues v WHERE v.publication_state = 'PUBLISHED' AND v.created_at <= ${new Date(snapshotAt)}
              AND ST_Intersects(v.location, ST_MakeEnvelope(${query.west}, ${query.south}, ${query.east}, ${query.north}, 4326)::geography)
              ${this.sqlFilters(query)} ${pagination}
            ORDER BY lower(v.name), v.id LIMIT ${query.limit + 1}`);
        return this.page(rows, query.limit, bind, snapshotAt, true);
    }

    async detail(id: string): Promise<object> {
        const resolved = await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT resolve_canonical_venue_id(${id}::uuid)::text AS id`;
        const venue =
            resolved[0] === undefined
                ? null
                : await this.prisma.venue.findFirst({
                      where: { id: resolved[0].id, publicationState: VenuePublicationState.PUBLISHED },
                      include: { sources: true },
                  });
        if (venue === null) throw venueError('VENUE_NOT_FOUND', 404);
        return {
            ...this.summary(venue),
            timeZone: venue.timeZone,
            pickleballCourtCount: venue.pickleballCourtCount,
            surfaceType: venue.surfaceType,
            amenities: {
                permanentNet: venue.permanentNet,
                lighting: venue.lighting,
                changingRoom: venue.changingRoom,
                toilet: venue.toilet,
                drinkingWater: venue.drinkingWater,
                parking: venue.parking,
                wheelchairAccess: venue.wheelchairAccess,
            },
            openingHours: venue.openingHours,
            seasonality: venue.seasonality,
            closedUntil: venue.closedUntil?.toISOString() ?? null,
            createdAt: venue.createdAt.toISOString(),
            updatedAt: venue.updatedAt.toISOString(),
        };
    }

    async suggestions(query: string, limit: number): Promise<object> {
        const items = await this.geocoder.suggest(query, limit);
        this.metrics.increment('venue_geocoder_requests_total');
        return {
            items: items.map((item) => ({
                selectionToken: item.id,
                label: item.label,
                ...(item.longitude === undefined || item.latitude === undefined
                    ? {}
                    : { location: { longitude: item.longitude, latitude: item.latitude } }),
                attribution: {
                    sourceKind: 'GEOCODER',
                    text: item.storage.attributionText,
                    link: item.storage.attributionLink,
                    observedAt: item.storage.observedAt.toISOString(),
                },
            })),
        };
    }

    async createCandidate(
        auth: AuthenticatedIdentity,
        body: CreateVenueCandidateDto,
        transaction: Prisma.TransactionClient
    ): Promise<object> {
        this.assertOnboarded(auth);
        if (!(await this.matches.canAttachCandidate(body.sourceMatchId, auth.session.userId)))
            throw venueError('MATCH_NOT_FOUND', 404);
        let data = {
            name: normalizeVenueText(body.name),
            normalizedAddress: normalizeVenueAddress(body.normalizedAddress),
            locality: normalizeVenueText(body.locality),
            timeZone: body.timeZone,
            longitude: body.location.longitude,
            latitude: body.location.latitude,
        };
        let source: Prisma.VenueSourceCreateWithoutCandidateInput;
        if (body.source.kind === 'ALLOWED_GEOCODER') {
            if (body.source.selectionToken === undefined) throw venueError('VALIDATION_FAILED', 400);
            const selected = await this.geocoder.resolve(body.source.selectionToken);
            if (!STORED_VENUE_FIELDS.every((field) => selected.provenance.allowedFields.includes(field)))
                throw venueError('REQUEST_NOT_ALLOWED', 403);
            data = {
                ...selected,
                name: normalizeVenueText(selected.name),
                normalizedAddress: normalizeVenueAddress(selected.normalizedAddress),
                locality: normalizeVenueText(selected.locality),
            };
            source = {
                id: uuidV7(),
                kind: VenueSourceKind.GEOCODER,
                providerKey: selected.provenance.providerKey,
                externalSourceId: selected.provenance.externalSourceId,
                ...(selected.provenance.externalSourceVersion === undefined
                    ? {}
                    : { externalSourceVersion: selected.provenance.externalSourceVersion }),
                observedAt: selected.provenance.observedAt,
                license: selected.provenance.license,
                policyVersion: selected.provenance.policyVersion,
                storageAllowed: true,
                allowedFields: selected.provenance.allowedFields,
                attributionText: selected.provenance.attributionText,
                ...(selected.provenance.attributionLink === undefined
                    ? {}
                    : { attributionLink: selected.provenance.attributionLink }),
            };
        } else {
            if (body.source.selectionToken !== undefined) throw venueError('VALIDATION_FAILED', 400);
            source = {
                id: uuidV7(),
                kind: VenueSourceKind.COMMUNITY,
                contributor: { connect: { id: auth.session.userId } },
                contributorAgreement: 'venue-public-sports-v1',
                observedAt: this.clock.now(),
                license: 'COMMUNITY_TERMS',
                policyVersion: 'venue-community-v1',
                storageAllowed: true,
                allowedFields: [...STORED_VENUE_FIELDS],
                attributionText: 'Добавлено сообществом',
            };
        }
        if (!data.name || !data.normalizedAddress || !data.locality) throw venueError('VALIDATION_FAILED', 400);
        if (
            !coordinateHasAllowedPrecision(data.longitude) ||
            !coordinateHasAllowedPrecision(data.latitude) ||
            data.longitude < -180 ||
            data.longitude > 180 ||
            data.latitude < -90 ||
            data.latitude > 90
        ) {
            throw venueError('VALIDATION_FAILED', 400);
        }
        const candidate = await transaction.venueCandidate.create({
            data: {
                id: uuidV7(),
                sourceMatchId: body.sourceMatchId,
                contributorId: auth.session.userId,
                ...data,
                sources: { create: source },
            },
        });
        await this.outbox.enqueue(transaction, {
            type: 'venue.candidate.created.v1',
            schemaVersion: 1,
            payload: { candidateId: candidate.id, sourceMatchId: candidate.sourceMatchId },
            correlationId: this.context().correlationId,
            occurredAt: candidate.createdAt,
        });
        await this.audit.append(transaction, {
            actorType: 'USER',
            actorId: auth.session.userId,
            action: 'venue.candidate.created',
            targetType: 'VENUE_CANDIDATE',
            targetId: candidate.id,
            outcome: 'SUCCESS',
            changedFields: { fields: [...STORED_VENUE_FIELDS] },
            ...this.context(),
            source: 'API',
        });
        this.metrics.increment('venue_candidates_created_total');
        return this.candidateProjection(candidate);
    }

    async qualifyFromConfirmedMatch(matchId: string, occurredAt: Date, correlationId: string): Promise<boolean> {
        return this.prisma.$transaction(async (transaction) => {
            const candidate = await transaction.venueCandidate.findUnique({ where: { sourceMatchId: matchId } });
            if (
                candidate === null ||
                (candidate.state !== VenueCandidateState.MATCH_ONLY &&
                    candidate.state !== VenueCandidateState.AWAITING_MATCH_COMPLETION)
            )
                return false;
            const updated = await transaction.venueCandidate.updateMany({
                where: { id: candidate.id, state: candidate.state },
                data: { state: VenueCandidateState.PENDING_REVIEW, qualifiedAt: occurredAt },
            });
            if (updated.count !== 1) return false;
            const nearby = await transaction.$queryRaw<{ id: string }[]>`
                SELECT id FROM venues WHERE publication_state = 'PUBLISHED'
                AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(${Number(candidate.longitude)}, ${Number(candidate.latitude)}), 4326)::geography, 100)
                ORDER BY ST_Distance(location, ST_SetSRID(ST_MakePoint(${Number(candidate.longitude)}, ${Number(candidate.latitude)}), 4326)::geography), id LIMIT 20`;
            await this.audit.append(transaction, {
                actorType: 'SYSTEM',
                action: 'venue.candidate.qualified',
                targetType: 'VENUE_CANDIDATE',
                targetId: candidate.id,
                outcome: 'SUCCESS',
                changedFields: { nearbyCount: nearby.length },
                requestId: correlationId,
                correlationId,
                source: 'EVENT',
            });
            this.metrics.increment('venue_candidates_qualified_total');
            if (nearby.length > 0) this.metrics.increment('venue_candidate_possible_duplicates_total');
            return true;
        });
    }

    async candidate(auth: AuthenticatedIdentity, id: string): Promise<object> {
        const candidate = await this.prisma.venueCandidate.findFirst({
            where: { id, contributorId: auth.session.userId },
        });
        if (candidate === null) throw venueError('VENUE_NOT_FOUND', 404);
        return this.candidateProjection(candidate);
    }

    async revise(
        auth: AuthenticatedIdentity,
        venueId: string,
        body: ProposeVenueRevisionDto,
        transaction: Prisma.TransactionClient
    ): Promise<object> {
        this.assertOnboarded(auth);
        const entries = Object.entries(body).filter(([key, value]) => key !== 'baseVersion' && value !== undefined);
        if (entries.length === 0) throw venueError('VALIDATION_FAILED', 400);
        const venue = await transaction.venue.findFirst({
            where: { id: venueId, publicationState: VenuePublicationState.PUBLISHED },
        });
        if (venue === null) throw venueError('VENUE_NOT_FOUND', 404);
        if (venue.version !== body.baseVersion) throw venueError('VENUE_VERSION_CONFLICT', 409);
        const proposed = Object.fromEntries(entries) as Prisma.InputJsonObject;
        const revision = await transaction.venueRevision.create({
            data: {
                id: uuidV7(),
                venueId,
                contributorId: auth.session.userId,
                baseVersion: body.baseVersion,
                proposedData: proposed,
                changedFields: entries.map(([key]) => key),
                sources: {
                    create: {
                        id: uuidV7(),
                        kind: VenueSourceKind.COMMUNITY,
                        contributorId: auth.session.userId,
                        contributorAgreement: 'venue-public-sports-v1',
                        observedAt: this.clock.now(),
                        license: 'COMMUNITY_TERMS',
                        policyVersion: 'venue-community-v1',
                        storageAllowed: true,
                        allowedFields: entries.map(([key]) => key),
                        attributionText: 'Предложено сообществом',
                    },
                },
            },
        });
        await this.audit.append(transaction, {
            actorType: 'USER',
            actorId: auth.session.userId,
            action: 'venue.revision.created',
            targetType: 'VENUE_REVISION',
            targetId: revision.id,
            outcome: 'SUCCESS',
            changedFields: { fields: revision.changedFields },
            ...this.context(),
            source: 'API',
        });
        return {
            id: revision.id,
            venueId,
            baseVersion: revision.baseVersion,
            state: revision.state,
            createdAt: revision.createdAt.toISOString(),
            decidedAt: null,
        };
    }

    async report(
        auth: AuthenticatedIdentity,
        venueId: string,
        body: CreateVenueReportDto,
        transaction: Prisma.TransactionClient
    ): Promise<object> {
        this.assertOnboarded(auth);
        const venue = await transaction.venue.findFirst({
            where: {
                id: venueId,
                publicationState: { in: [VenuePublicationState.PUBLISHED, VenuePublicationState.PRIVACY_REVIEW] },
            },
        });
        if (venue === null) throw venueError('VENUE_NOT_FOUND', 404);
        const report = await transaction.venueReport.create({
            data: { id: uuidV7(), venueId, reporterId: auth.session.userId, reason: body.reason as VenueReportReason },
        });
        if (
            body.reason === VenueReportReasonDto.PRIVATE_RESIDENCE &&
            venue.publicationState === VenuePublicationState.PUBLISHED
        ) {
            await transaction.venue.update({
                where: { id: venueId },
                data: {
                    publicationState: VenuePublicationState.PRIVACY_REVIEW,
                    version: { increment: 1 },
                    updatedAt: this.clock.now(),
                },
            });
        }
        await this.audit.append(transaction, {
            actorType: 'USER',
            actorId: auth.session.userId,
            action: 'venue.report.created',
            targetType: 'VENUE_REPORT',
            targetId: report.id,
            outcome: 'SUCCESS',
            changedFields: {
                reason: body.reason,
                privacyQuarantined: body.reason === VenueReportReasonDto.PRIVATE_RESIDENCE,
            },
            ...this.context(),
            source: 'API',
        });
        this.metrics.increment('venue_reports_created_total');
        if (body.reason === VenueReportReasonDto.PRIVATE_RESIDENCE)
            this.metrics.increment('venue_privacy_quarantines_total');
        return {
            id: report.id,
            venueId,
            reason: report.reason,
            state: report.state,
            createdAt: report.createdAt.toISOString(),
            resolvedAt: null,
        };
    }

    private async page(
        rows: SearchRow[],
        limit: number,
        bind: string,
        snapshotAt: string,
        includeName: boolean
    ): Promise<object> {
        const hasMore = rows.length > limit;
        const pageRows = rows.slice(0, limit);
        const sources =
            pageRows.length === 0
                ? []
                : await this.prisma.venueSource.findMany({
                      where: { venueId: { in: pageRows.map((row) => row.id) } },
                      select: {
                          venueId: true,
                          kind: true,
                          attributionText: true,
                          attributionLink: true,
                          observedAt: true,
                      },
                      orderBy: [{ observedAt: 'desc' }, { id: 'desc' }],
                  });
        const sourcesByVenue = new Map<string, AttributionSource[]>();
        for (const source of sources) {
            if (source.venueId === null) continue;
            const items = sourcesByVenue.get(source.venueId) ?? [];
            items.push(source);
            sourcesByVenue.set(source.venueId, items);
        }
        for (const row of pageRows) row.sources = sourcesByVenue.get(row.id) ?? [];
        const last = pageRows.at(-1);
        const nextCursor =
            hasMore && last !== undefined
                ? this.cursors.encode({
                      type: 'venue-search',
                      bind,
                      snapshotAt,
                      lastId: last.id,
                      ...(includeName
                          ? { lastName: last.name.toLocaleLowerCase('ru-RU'), lastRank: last.rank ?? undefined }
                          : { lastDistance: last.distanceMeters ?? undefined }),
                  })
                : null;
        this.metrics.increment('venue_search_requests_total');
        return { items: pageRows.map((row) => this.summary(row)), pageInfo: { nextCursor, hasMore }, snapshotAt };
    }

    private summary(venue: SummaryVenue): object {
        const sources = venue.sources ?? [];
        return {
            id: venue.id,
            name: venue.name,
            normalizedAddress: venue.normalizedAddress,
            locality: venue.locality,
            location: { longitude: Number(venue.longitude), latitude: Number(venue.latitude) },
            publicationState: 'PUBLISHED',
            verificationState: venue.verificationState,
            accessMode: venue.accessMode,
            environment: venue.environment,
            ...(venue.distanceMeters === null || venue.distanceMeters === undefined
                ? {}
                : { distanceMeters: Math.round(venue.distanceMeters) }),
            version: venue.version,
            lastVerifiedAt: venue.lastVerifiedAt.toISOString(),
            attribution: sources.map((source) => ({
                sourceKind: source.kind,
                text: source.attributionText,
                link: source.attributionLink ?? undefined,
                observedAt: source.observedAt.toISOString(),
            })),
        };
    }

    private cursor(value: string | undefined, bind: string): VenueCursor | undefined {
        if (value === undefined) return undefined;
        const cursor = this.cursors.decode<VenueCursor>(value, 'venue-search');
        if (cursor.bind !== bind || Number.isNaN(Date.parse(cursor.snapshotAt)))
            throw venueError('INVALID_CURSOR', 400);
        return cursor;
    }

    private sqlFilters(filters: VenueFiltersDto): Prisma.Sql {
        return Prisma.sql`${filters.accessMode === undefined ? Prisma.empty : Prisma.sql`AND v.access_mode = ${filters.accessMode}::venue_access_mode`}
            ${filters.environment === undefined ? Prisma.empty : Prisma.sql`AND v.environment = ${filters.environment}::venue_environment`}
            ${filters.permanentNet === undefined ? Prisma.empty : Prisma.sql`AND v.permanent_net = ${filters.permanentNet}::venue_amenity_state`}
            ${filters.lighting === undefined ? Prisma.empty : Prisma.sql`AND v.lighting = ${filters.lighting}::venue_amenity_state`}`;
    }

    private filterShape(filters: VenueFiltersDto): object {
        return {
            accessMode: filters.accessMode,
            environment: filters.environment,
            permanentNet: filters.permanentNet,
            lighting: filters.lighting,
        };
    }

    private bind(value: object): string {
        return this.crypto.hash(`VENUE_CURSOR:${JSON.stringify(value)}`);
    }

    private candidateProjection(candidate: {
        id: string;
        sourceMatchId: string;
        state: VenueCandidateState;
        canonicalVenueId: string | null;
        createdAt: Date;
        decidedAt: Date | null;
    }): object {
        return {
            id: candidate.id,
            sourceMatchId: candidate.sourceMatchId,
            state: candidate.state,
            canonicalVenueId: candidate.canonicalVenueId,
            createdAt: candidate.createdAt.toISOString(),
            decidedAt: candidate.decidedAt?.toISOString() ?? null,
        };
    }

    private assertOnboarded(auth: AuthenticatedIdentity): void {
        if (auth.session.user.completedAt === null) throw venueError('ONBOARDING_REQUIRED', 403);
    }

    private context(): { requestId: string; correlationId: string } {
        const context = this.requestContext.get();
        return { requestId: context?.requestId ?? uuidV7(), correlationId: context?.correlationId ?? uuidV7() };
    }

    private distance(lon1: number, lat1: number, lon2: number, lat2: number): number {
        const radians = (value: number) => (value * Math.PI) / 180;
        const a =
            Math.sin(radians(lat2 - lat1) / 2) ** 2 +
            Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lon2 - lon1) / 2) ** 2;
        return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
