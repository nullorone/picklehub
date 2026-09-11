import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { RequestContextService } from '../common/request-context/request-context.service';
import { Clock } from '../identity/clock';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { OutboxService } from '../outbox/outbox.service';
import type {
    AvatarUploadRequestDto,
    SetDuprProfileLinkDto,
    UpdatePlayerProfileDto,
    UpdateProfilePrivacyDto,
} from './profile.dto';
import { ProfileAvatarStorage } from './profile-avatar-storage';
import { ProfileCursorService } from './profile-cursor.service';
import { profileError } from './profile.errors';

type Transaction = Prisma.TransactionClient;

interface HistoryOptions {
    subjectId: string;
    viewerId?: string;
    publicOnly: boolean;
    limit: number;
    cursor?: string;
}

type HistoryMatch = Prisma.MatchGetPayload<{
    include: {
        participants: true;
        results: { include: { games: true } };
        metricMarkers: true;
    };
}>;

@Injectable()
export class ProfileService {
    private readonly duprHosts: Set<string>;
    private readonly duprPath: RegExp;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly prisma: PrismaService,
        private readonly clock: Clock,
        private readonly crypto: IdentityCryptoService,
        private readonly storage: ProfileAvatarStorage,
        private readonly cursors: ProfileCursorService,
        private readonly outbox: OutboxService,
        private readonly audit: AuditService,
        private readonly context: RequestContextService
    ) {
        this.duprHosts = new Set(
            environment.PROFILE_DUPR_ALLOWED_HOSTS.split(',')
                .map((host) => host.trim().toLowerCase())
                .filter(Boolean)
        );
        try {
            this.duprPath = new RegExp(environment.PROFILE_DUPR_ALLOWED_PATH_PATTERN, 'u');
        } catch {
            throw new Error('Invalid PROFILE_DUPR_ALLOWED_PATH_PATTERN');
        }
    }

    async own(userId: string): Promise<object> {
        await this.assertOwner(userId);
        return this.projectProfile(userId, false);
    }

    async publicProfile(playerId: string, viewerId?: string): Promise<object> {
        await this.assertPublicAccess(playerId, viewerId);
        return this.projectProfile(playerId, true);
    }

    async privacy(userId: string): Promise<object> {
        const profile = await this.prisma.playerProfile.findUnique({ where: { userId } });
        if (profile === null) throw profileError('PROFILE_NOT_AVAILABLE', 404);
        return { version: profile.version, visibility: profile.visibility, updatedAt: profile.updatedAt.toISOString() };
    }

    async update(userId: string, body: UpdatePlayerProfileDto, transaction: Transaction): Promise<object> {
        await this.assertMutationAllowed(userId, transaction);
        const changed = Object.keys(body).filter((key) => key !== 'expectedVersion');
        if (changed.length === 0) throw profileError('VALIDATION_FAILED', 400);
        if (body.displayName !== undefined && /\p{Cc}/u.test(body.displayName))
            throw profileError('VALIDATION_FAILED', 400);
        if (body.timeZone !== undefined) this.assertTimeZone(body.timeZone);
        if (body.localityId !== undefined) {
            const locality = await transaction.onboardingLocality.count({ where: { id: body.localityId } });
            if (locality !== 1) throw profileError('VALIDATION_FAILED', 400);
        }
        const { expectedVersion, ...data } = body;
        const updated = await transaction.playerProfile.updateMany({
            where: { userId, version: expectedVersion },
            data: { ...data, version: { increment: 1 }, updatedAt: this.clock.now() },
        });
        if (updated.count !== 1) throw profileError('PROFILE_VERSION_CONFLICT', 409);
        await this.recordChange(transaction, userId, expectedVersion + 1, 'FIELDS', changed);
        return this.projectProfile(userId, false, transaction);
    }

    async updatePrivacy(userId: string, body: UpdateProfilePrivacyDto, transaction: Transaction): Promise<object> {
        await this.assertMutationAllowed(userId, transaction);
        const updated = await transaction.playerProfile.updateMany({
            where: { userId, version: body.expectedVersion },
            data: { visibility: body.visibility, version: { increment: 1 }, updatedAt: this.clock.now() },
        });
        if (updated.count !== 1) throw profileError('PROFILE_VERSION_CONFLICT', 409);
        await this.recordChange(transaction, userId, body.expectedVersion + 1, 'VISIBILITY', ['visibility']);
        const profile = await transaction.playerProfile.findUniqueOrThrow({ where: { userId } });
        return { version: profile.version, visibility: profile.visibility, updatedAt: profile.updatedAt.toISOString() };
    }

    async setDupr(userId: string, body: SetDuprProfileLinkDto, transaction: Transaction): Promise<object> {
        await this.assertMutationAllowed(userId, transaction);
        const canonicalUrl = this.validateDupr(body.url);
        const policyVersion = this.environment.PROFILE_DUPR_POLICY_VERSION;
        if (policyVersion === undefined) throw profileError('DUPR_LINK_NOT_ALLOWED', 400);
        await this.bumpVersion(userId, body.expectedVersion, transaction);
        await transaction.externalProfileLink.upsert({
            where: { userId_provider: { userId, provider: 'DUPR' } },
            create: {
                id: uuidV7(),
                userId,
                provider: 'DUPR',
                urlKey: this.crypto.hash(canonicalUrl),
                urlCiphertext: this.crypto.encrypt(canonicalUrl),
                encryptionKeyVersion: 1,
                policyVersion,
                outboundEnabled: this.environment.PROFILE_DUPR_OUTBOUND_ENABLED === 'true',
            },
            update: {
                urlKey: this.crypto.hash(canonicalUrl),
                urlCiphertext: this.crypto.encrypt(canonicalUrl),
                encryptionKeyVersion: 1,
                policyVersion,
                outboundEnabled: this.environment.PROFILE_DUPR_OUTBOUND_ENABLED === 'true',
                updatedAt: this.clock.now(),
            },
        });
        await this.recordChange(transaction, userId, body.expectedVersion + 1, 'DUPR_LINK', ['externalProfileLink']);
        return this.projectProfile(userId, false, transaction);
    }

    async removeDupr(userId: string, expectedVersion: number, transaction: Transaction): Promise<null> {
        await this.assertMutationAllowed(userId, transaction);
        await this.bumpVersion(userId, expectedVersion, transaction);
        await transaction.externalProfileLink.deleteMany({ where: { userId, provider: 'DUPR' } });
        await this.recordChange(transaction, userId, expectedVersion + 1, 'DUPR_LINK', ['externalProfileLink']);
        return null;
    }

    async createAvatarUpload(userId: string, body: AvatarUploadRequestDto, transaction: Transaction): Promise<object> {
        await this.assertMutationAllowed(userId, transaction);
        const profile = await transaction.playerProfile.findUnique({ where: { userId } });
        if (profile?.version !== body.expectedVersion) throw profileError('PROFILE_VERSION_CONFLICT', 409);
        const assetId = uuidV7();
        const objectKey = `profiles/${userId}/avatars/${assetId}/original`;
        const createdAt = this.clock.now();
        const expiresAt = new Date(createdAt.getTime() + 300_000);
        const signed = await this.storage.createUploadPolicy({
            objectKey,
            contentType: body.contentType,
            contentLength: body.contentLength,
            sha256: body.sha256,
            expiresAt,
        });
        await transaction.profileAvatarAsset.create({
            data: {
                id: assetId,
                userId,
                objectKey,
                mediaType: body.contentType,
                expectedBytes: body.contentLength,
                expectedSha256: body.sha256,
                createdAt,
                uploadExpiresAt: expiresAt,
            },
        });
        return {
            assetId,
            objectKey,
            uploadUrl: signed.uploadUrl,
            method: 'PUT',
            expiresAt: expiresAt.toISOString(),
            requiredHeaders: { contentType: body.contentType, sha256: body.sha256 },
            maxBytes: 5_242_880,
        };
    }

    async removeAvatar(userId: string, expectedVersion: number, transaction: Transaction): Promise<null> {
        await this.assertMutationAllowed(userId, transaction);
        await this.bumpVersion(userId, expectedVersion, transaction, { activeAvatarAssetId: null });
        await this.recordChange(transaction, userId, expectedVersion + 1, 'AVATAR', ['avatar']);
        return null;
    }

    async ownStatistics(userId: string): Promise<object> {
        await this.assertOwner(userId);
        return this.statistics(userId, false);
    }

    async publicStatistics(playerId: string, viewerId?: string): Promise<object> {
        await this.assertPublicAccess(playerId, viewerId);
        return this.statistics(playerId, true);
    }

    async history(options: HistoryOptions): Promise<object> {
        if (options.publicOnly) await this.assertPublicAccess(options.subjectId, options.viewerId);
        else await this.assertOwner(options.subjectId);
        const decoded = options.cursor === undefined ? undefined : this.cursors.decode(options.cursor);
        const snapshotAt = decoded === undefined ? this.clock.now() : new Date(decoded.snapshotAt);
        const offset = decoded?.offset ?? 0;
        if (
            decoded !== undefined &&
            (decoded.subjectId !== options.subjectId ||
                decoded.viewerId !== (options.viewerId ?? null) ||
                decoded.publicOnly !== options.publicOnly)
        ) {
            throw profileError('INVALID_CURSOR', 400);
        }
        const rows = await this.prisma.matchParticipant.findMany({
            where: {
                userId: options.subjectId,
                match: {
                    updatedAt: { lte: snapshotAt },
                    state: options.publicOnly
                        ? 'COMPLETED'
                        : { in: ['AWAITING_CONFIRMATION', 'DISPUTED', 'CANCELLED', 'COMPLETED', 'VOIDED'] },
                    format: { not: null },
                    startsAt: { not: null },
                    ...(options.publicOnly ? { visibility: 'PUBLIC' } : {}),
                },
            },
            include: {
                match: {
                    include: {
                        participants: true,
                        results: {
                            orderBy: { version: 'desc' },
                            include: { games: { orderBy: { gameNumber: 'asc' } } },
                        },
                        metricMarkers: { where: { metricType: 'CONFIRMED_MATCH' } },
                    },
                },
            },
        });
        const allowed = rows
            .filter(
                ({ match }) =>
                    !options.publicOnly || (match.results[0]?.state === 'CONFIRMED' && match.metricMarkers.length === 1)
            )
            .sort((left, right) => {
                const leftTime =
                    left.match.metricMarkers[0]?.confirmedAt ?? left.match.startsAt ?? left.match.updatedAt;
                const rightTime =
                    right.match.metricMarkers[0]?.confirmedAt ?? right.match.startsAt ?? right.match.updatedAt;
                return rightTime.getTime() - leftTime.getTime() || left.match.id.localeCompare(right.match.id);
            });
        const selected = allowed.slice(offset, offset + options.limit);
        const items = await Promise.all(
            selected.map(({ match }) => this.historyEntry(match, options.viewerId, options.publicOnly))
        );
        const hasNext = offset + options.limit < allowed.length;
        return {
            items,
            pageInfo: {
                hasNext,
                nextCursor: hasNext
                    ? this.cursors.encode({
                          type: 'profile-history',
                          subjectId: options.subjectId,
                          viewerId: options.viewerId ?? null,
                          publicOnly: options.publicOnly,
                          snapshotAt: snapshotAt.toISOString(),
                          offset: offset + options.limit,
                      })
                    : null,
            },
            snapshotAt: snapshotAt.toISOString(),
        };
    }

    private async historyEntry(
        match: HistoryMatch,
        viewerId: string | undefined,
        publicOnly: boolean
    ): Promise<object> {
        const result = match.results.find((item) => item.state === 'CONFIRMED') ?? match.results[0];
        const marker =
            result === undefined ? undefined : match.metricMarkers.find((item) => item.resultId === result.id);
        const state = this.historyState(match.state, result?.state, result?.mode, marker !== undefined);
        if (match.startsAt === null) throw new Error('Profile history source has no start time');
        const participantProfiles = await this.prisma.playerProfile.findMany({
            where: {
                userId: { in: match.participants.map((item) => item.userId) },
                ...(publicOnly ? { visibility: 'PUBLIC' } : {}),
            },
        });
        const profiles = new Map(participantProfiles.map((profile) => [profile.userId, profile]));
        const participants = [];
        for (const participant of match.participants) {
            const profile = profiles.get(participant.userId);
            if (profile === undefined) continue;
            if (publicOnly && viewerId !== undefined && (await this.blocked(viewerId, participant.userId))) continue;
            participants.push({
                playerId: profile.userId,
                displayName: profile.displayName,
                skillSelfAssessment: Number(profile.skillSelfAssessment),
            });
        }
        return {
            matchId: match.id,
            format: match.format,
            state,
            startsAt: match.startsAt.toISOString(),
            confirmedAt: marker?.confirmedAt.toISOString() ?? null,
            venue: { venueId: match.venueId },
            winningTeam: result?.winningTeam ?? null,
            games: (result?.games ?? []).map((game) => ({
                gameNumber: game.gameNumber,
                teamAPoints: game.teamAPoints,
                teamBPoints: game.teamBPoints,
            })),
            participants,
        };
    }

    private historyState(
        matchState: string,
        resultState: string | undefined,
        mode: string | undefined,
        marked: boolean
    ): string {
        if (matchState === 'CANCELLED') return 'CANCELLED';
        if (matchState === 'VOIDED' || resultState === 'VOIDED') return 'VOIDED';
        if (matchState === 'DISPUTED' || resultState === 'DISPUTED') return 'DISPUTED';
        if (resultState === 'CONFIRMED' && marked) return mode === 'SCORED' ? 'CONFIRMED_SCORED' : 'CONFIRMED_PLAYED';
        return 'AWAITING_CONFIRMATION';
    }

    private async projectProfile(
        userId: string,
        publicOnly: boolean,
        database: Transaction | PrismaService = this.prisma
    ): Promise<object> {
        const profile = await database.playerProfile.findUnique({ where: { userId } });
        if (profile === null) throw profileError('PROFILE_NOT_AVAILABLE', 404);
        const [locality, link, avatar, statistics] = await Promise.all([
            database.onboardingLocality.findUniqueOrThrow({ where: { id: profile.localityId } }),
            database.externalProfileLink.findUnique({ where: { userId_provider: { userId, provider: 'DUPR' } } }),
            profile.activeAvatarAssetId === null
                ? null
                : database.profileAvatarAsset.findUnique({ where: { id: profile.activeAvatarAssetId } }),
            this.statistics(userId, publicOnly, database),
        ]);
        const externalProfileLink =
            link === null
                ? null
                : {
                      provider: 'DUPR',
                      url: this.crypto.decrypt(link.urlCiphertext),
                      label: 'EXTERNAL_NOT_VERIFIED_OR_SYNCED',
                      outboundEnabled: link.outboundEnabled,
                  };
        const avatarUrl = avatar?.state === 'ACTIVE' ? await this.storage.createReadUrl(avatar.objectKey) : null;
        const common = {
            playerId: userId,
            displayName: profile.displayName,
            locality: {
                id: locality.id,
                name: locality.name,
                countryCode: locality.countryCode,
                region: locality.region,
            },
            gameFormats: profile.gameFormats,
            skillSelfAssessment: Number(profile.skillSelfAssessment),
            ...(publicOnly
                ? { avatarUrl }
                : { avatar: avatar === null ? null : { assetId: avatar.id, state: avatar.state, url: avatarUrl } }),
            externalProfileLink,
            statistics,
            updatedAt: profile.updatedAt.toISOString(),
        };
        return publicOnly
            ? common
            : { ...common, version: profile.version, visibility: profile.visibility, timeZone: profile.timeZone };
    }

    private async statistics(
        userId: string,
        publicOnly: boolean,
        database: Transaction | PrismaService = this.prisma
    ): Promise<object> {
        const generation = await database.profileProjectionGeneration.findFirst({ where: { state: 'ACTIVE' } });
        const updating =
            (await database.profileProjectionGeneration.count({ where: { state: { in: ['BUILDING', 'READY'] } } })) > 0;
        const rows =
            generation === null
                ? []
                : await database.playerStatisticAggregate.findMany({
                      where: { generationId: generation.id, playerId: userId },
                  });
        const reliability =
            generation === null
                ? null
                : await database.playerReliabilityAggregate.findUnique({
                      where: { generationId_playerId: { generationId: generation.id, playerId: userId } },
                  });
        const bySlice = new Map(rows.map((row) => [row.slice, row]));
        const calculatedAt =
            rows.reduce<Date | null>(
                (latest, row) => (latest === null || row.calculatedAt > latest ? row.calculatedAt : latest),
                generation?.activatedAt ?? null
            ) ?? this.clock.now();
        const totals = (['ALL', 'SINGLES', 'DOUBLES'] as const).map((slice) => {
            const row = bySlice.get(slice);
            const wins = row?.wins ?? 0n;
            const losses = row?.losses ?? 0n;
            return {
                slice,
                played: (row?.played ?? 0n).toString(),
                wins: wins.toString(),
                losses: losses.toString(),
                decided: (wins + losses).toString(),
                gamesPlayed: (row?.gamesPlayed ?? 0n).toString(),
                pointsFor: (row?.pointsFor ?? 0n).toString(),
                pointsAgainst: (row?.pointsAgainst ?? 0n).toString(),
                pointsDifference: ((row?.pointsFor ?? 0n) - (row?.pointsAgainst ?? 0n)).toString(),
                winRateNumerator: wins.toString(),
                winRateDenominator: (wins + losses).toString(),
                lastConfirmedAt: row?.lastConfirmedAt?.toISOString() ?? null,
            };
        });
        const successes = reliability?.organizedSuccesses ?? 0n;
        const failures = reliability?.organizedFailures ?? 0n;
        const reliabilityDenominator = successes + failures;
        const played = bySlice.get('ALL')?.played ?? 0n;
        const noShows = reliability?.confirmedNoShows ?? 0n;
        const attendanceDenominator = played + noShows;
        const percentage = (numerator: bigint, denominator: bigint) =>
            denominator < 5n ? null : Number((numerator * 10_000n) / denominator) / 100;
        const common = { state: updating ? 'UPDATING' : 'CURRENT', totals, calculatedAt: calculatedAt.toISOString() };
        if (publicOnly) {
            return {
                ...common,
                reliability: {
                    percentage: percentage(successes, reliabilityDenominator),
                    sampleSize: reliabilityDenominator < 5n ? null : reliabilityDenominator.toString(),
                },
                attendance: { percentage: null, sampleSize: null },
                attendanceAvailable: false,
            };
        }
        return {
            ...common,
            reliability: {
                organizedSuccesses: successes.toString(),
                organizedFailures: failures.toString(),
                denominator: reliabilityDenominator.toString(),
                percentage: percentage(successes, reliabilityDenominator),
            },
            attendance: {
                confirmedNoShows: noShows.toString(),
                attendanceCommitments: attendanceDenominator.toString(),
                percentage: null,
                available: false,
            },
        };
    }

    private async assertOwner(userId: string): Promise<void> {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { status: true, completedAt: true },
        });
        if (user?.status !== 'ACTIVE' || user.completedAt === null) throw profileError('PROFILE_NOT_AVAILABLE', 404);
    }

    private async assertPublicAccess(playerId: string, viewerId?: string): Promise<void> {
        const profile = await this.prisma.playerProfile.findUnique({ where: { userId: playerId } });
        const user = await this.prisma.user.findUnique({ where: { id: playerId }, select: { status: true } });
        if (
            profile?.visibility !== 'PUBLIC' ||
            user?.status !== 'ACTIVE' ||
            (viewerId !== undefined && (await this.blocked(viewerId, playerId)))
        ) {
            throw profileError('PROFILE_NOT_AVAILABLE', 404);
        }
    }

    private async blocked(left: string, right: string): Promise<boolean> {
        if (left === right) return false;
        return (
            (await this.prisma.communicationBlock.count({
                where: {
                    OR: [
                        { blockerId: left, blockedUserId: right },
                        { blockerId: right, blockedUserId: left },
                    ],
                },
            })) > 0
        );
    }

    private async assertMutationAllowed(userId: string, transaction: Transaction): Promise<void> {
        const user = await transaction.user.findUnique({ where: { id: userId } });
        if (user?.status !== 'ACTIVE' || user.completedAt === null) throw profileError('ONBOARDING_REQUIRED', 403);
        const documents = await transaction.consentDocument.findMany({
            where: {
                purpose: { in: ['TERMS', 'PERSONAL_DATA'] },
                isCurrent: true,
                effectiveAt: { lte: this.clock.now() },
            },
            select: { purpose: true, version: true },
        });
        for (const document of documents) {
            const latest = await transaction.consent.findFirst({
                where: { userId, purpose: document.purpose },
                orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
            });
            if (latest?.action !== 'ACCEPTED' || latest.version !== document.version)
                throw profileError('CONSENT_REQUIRED', 403);
        }
    }

    private async bumpVersion(
        userId: string,
        expectedVersion: number,
        transaction: Transaction,
        data: object = {}
    ): Promise<void> {
        const result = await transaction.playerProfile.updateMany({
            where: { userId, version: expectedVersion },
            data: { ...data, version: { increment: 1 }, updatedAt: this.clock.now() },
        });
        if (result.count !== 1) throw profileError('PROFILE_VERSION_CONFLICT', 409);
    }

    private validateDupr(value: string): string {
        if (this.duprHosts.size === 0 || this.environment.PROFILE_DUPR_POLICY_VERSION === undefined) {
            throw profileError('DUPR_LINK_NOT_ALLOWED', 400);
        }
        try {
            const url = new URL(value);
            if (
                url.protocol !== 'https:' ||
                url.username !== '' ||
                url.password !== '' ||
                url.port !== '' ||
                url.search !== '' ||
                url.hash !== '' ||
                !this.duprHosts.has(url.hostname.toLowerCase()) ||
                !this.duprPath.test(url.pathname)
            ) {
                throw new Error();
            }
            url.hostname = url.hostname.toLowerCase();
            return url.toString();
        } catch {
            throw profileError('DUPR_LINK_NOT_ALLOWED', 400);
        }
    }

    private assertTimeZone(value: string): void {
        try {
            new Intl.DateTimeFormat('ru-RU', { timeZone: value }).format();
        } catch {
            throw profileError('VALIDATION_FAILED', 400);
        }
    }

    private async recordChange(
        transaction: Transaction,
        userId: string,
        version: number,
        change: 'FIELDS' | 'VISIBILITY' | 'DUPR_LINK' | 'AVATAR',
        fields: string[]
    ): Promise<void> {
        const now = this.clock.now();
        const request = this.context.get();
        const correlationId = request?.correlationId ?? uuidV7();
        await this.outbox.enqueue(transaction, {
            type: 'profile.changed.v1',
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type: 'profile.changed.v1',
                occurredAt: now.toISOString(),
                correlationId,
                causationId: null,
                data: { profileId: userId, profileVersion: version, change },
            },
            correlationId,
            occurredAt: now,
        });
        await this.audit.append(transaction, {
            actorType: 'USER',
            actorId: userId,
            action: `profile.${change.toLowerCase()}.changed`,
            targetType: 'player_profile',
            targetId: userId,
            outcome: 'SUCCESS',
            changedFields: { fields },
            requestId: request?.requestId ?? uuidV7(),
            correlationId,
            source: 'profile-api',
        });
    }
}
