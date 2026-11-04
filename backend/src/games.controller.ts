import { createHash } from 'node:crypto';
import {
    Body,
    Controller,
    Delete,
    Get,
    HttpException,
    HttpStatus,
    Param,
    Patch,
    Post,
    Put,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import { AuthenticatedRequest, SessionAuthGuard } from './session-auth.guard.js';
import { PrismaService } from './prisma.service.js';

interface CreateGameBody {
    venueName?: unknown;
    venueAddress?: unknown;
    startsAt?: unknown;
    durationMinutes?: unknown;
    participantLimit?: unknown;
    organizerParticipates?: unknown;
    desiredLevel?: unknown;
    description?: unknown;
}

interface NormalizedGame {
    venueName: string;
    venueAddress: string;
    startsAt: Date;
    durationMinutes: number;
    participantLimit: number;
    organizerParticipates: boolean;
    desiredLevel: string | null;
    description: string | null;
}

type UpdateGameBody = Partial<CreateGameBody>;
type OrganizerGame = Prisma.GameGetPayload<{ include: { participants: { select: typeof participantSelection } } }>;

const participantSelection = {
    userId: true,
    joinedAt: true,
    user: { select: { displayName: true } },
} as const;

@Controller('games')
@UseGuards(SessionAuthGuard)
export class GamesController {
    constructor(private readonly prisma: PrismaService) {}

    @Post()
    async create(@Body() body: CreateGameBody, @Req() request: AuthenticatedRequest): Promise<Record<string, unknown>> {
        const requestId = request.header('x-request-id') ?? '';
        const key = request.header('idempotency-key');
        if (!key || key.length < 16 || key.length > 128) {
            this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'A valid Idempotency-Key is required', requestId);
        }
        const input = this.validate(body, requestId);
        const requestHash = createHash('sha256')
            .update(
                JSON.stringify({
                    ...input,
                    startsAt: input.startsAt.toISOString(),
                })
            )
            .digest('hex');

        const existing = await this.prisma.idempotencyRecord.findUnique({
            where: { userId_key: { userId: request.userId, key } },
        });
        if (existing) return this.replay(existing.requestHash, requestHash, existing.response, requestId);

        try {
            return await this.prisma.$transaction(async (tx) => {
                const game = await tx.game.create({
                    data: {
                        organizerId: request.userId,
                        venueName: input.venueName,
                        address: input.venueAddress,
                        startsAt: input.startsAt,
                        durationMinutes: input.durationMinutes,
                        participantLimit: input.participantLimit,
                        level: input.desiredLevel,
                        description: input.description,
                        ...(input.organizerParticipates
                            ? { participants: { create: { userId: request.userId } } }
                            : {}),
                    },
                    include: {
                        participants: {
                            include: { user: { select: { displayName: true } } },
                            orderBy: { joinedAt: 'asc' },
                        },
                    },
                });
                await this.rescheduleReminder(tx, game.id, game.startsAt, game.eventVersion);
                const response = this.toDetail(game);
                await tx.idempotencyRecord.create({
                    data: { userId: request.userId, key, requestHash, response: response as Prisma.InputJsonValue },
                });
                return response;
            });
        } catch (error) {
            if (this.isUniqueError(error)) {
                const raced = await this.prisma.idempotencyRecord.findUnique({
                    where: { userId_key: { userId: request.userId, key } },
                });
                if (raced) return this.replay(raced.requestHash, requestHash, raced.response, requestId);
            }
            throw error;
        }
    }

    @Get()
    async list(
        @Query('cursor') cursor?: string,
        @Query('limit') limitValue?: string
    ): Promise<Record<string, unknown>> {
        const limit = limitValue === undefined ? 20 : Number(limitValue);
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
            this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'limit must be an integer between 1 and 50');
        }
        let after: { startsAt: Date; id: string } | undefined;
        if (cursor !== undefined) {
            try {
                const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
                    startsAt: string;
                    id: string;
                };
                if (!isUuid(decoded.id) || !isDateTime(decoded.startsAt)) throw new Error('bad cursor');
                after = { startsAt: new Date(decoded.startsAt), id: decoded.id };
            } catch {
                this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'cursor is invalid');
            }
        }
        const games = await this.prisma.game.findMany({
            where: {
                status: 'OPEN',
                startsAt: { gt: new Date() },
                ...(after
                    ? { OR: [{ startsAt: { gt: after.startsAt } }, { startsAt: after.startsAt, id: { gt: after.id } }] }
                    : {}),
            },
            include: {
                _count: { select: { participants: true } },
                participants: { select: { userId: true } },
            },
            orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
            take: limit + 1,
        });
        const hasMore = games.length > limit;
        const items = games.slice(0, limit);
        const last = items.at(-1);
        return {
            items: items.map((game) => ({
                ...this.toSummary(game, game._count.participants),
                organizerParticipates: game.participants.some((participant) => participant.userId === game.organizerId),
            })),
            ...(hasMore && last
                ? {
                      nextCursor: Buffer.from(
                          JSON.stringify({ startsAt: last.startsAt.toISOString(), id: last.id })
                      ).toString('base64url'),
                  }
                : {}),
        };
    }

    @Get(':gameId')
    async get(@Param('gameId') gameId: string, @Req() request: Request): Promise<Record<string, unknown>> {
        if (!isUuid(gameId))
            this.fail(
                HttpStatus.BAD_REQUEST,
                'VALIDATION_ERROR',
                'gameId must be a UUID',
                request.header('x-request-id') ?? ''
            );
        const game = await this.prisma.game.findUnique({
            where: { id: gameId },
            include: { participants: { select: participantSelection, orderBy: { joinedAt: 'asc' } } },
        });
        if (!game)
            this.fail(HttpStatus.NOT_FOUND, 'GAME_NOT_FOUND', 'Game not found', request.header('x-request-id') ?? '');
        return this.toDetail(game);
    }

    @Put(':gameId/participation')
    async join(
        @Param('gameId') gameId: string,
        @Req() request: AuthenticatedRequest
    ): Promise<Record<string, unknown>> {
        return this.changeParticipation(gameId, request, 'PUT', true);
    }

    @Delete(':gameId/participation')
    async leave(
        @Param('gameId') gameId: string,
        @Req() request: AuthenticatedRequest
    ): Promise<Record<string, unknown>> {
        return this.changeParticipation(gameId, request, 'DELETE', false);
    }

    @Patch(':gameId')
    async update(
        @Param('gameId') gameId: string,
        @Body() body: UpdateGameBody,
        @Req() request: AuthenticatedRequest
    ): Promise<Record<string, unknown>> {
        const requestId = request.header('x-request-id') ?? '';
        const changes = this.validateUpdate(body, requestId);
        return this.organizerAction(gameId, request, 'PATCH', changes, async (tx, game) => {
            if (game.status === 'CANCELLED')
                this.fail(HttpStatus.GONE, 'GAME_CANCELLED', 'Game was cancelled', requestId);
            if (game.startsAt.getTime() <= Date.now())
                this.fail(HttpStatus.CONFLICT, 'GAME_CONFLICT', 'Game has already started', requestId);
            const organizerParticipates = game.participants.some((item) => item.userId === game.organizerId);
            const targetLimit = changes.participantLimit ?? game.participantLimit;
            const targetCount =
                game.participants.length +
                (changes.organizerParticipates === true && !organizerParticipates ? 1 : 0) -
                (changes.organizerParticipates === false && organizerParticipates ? 1 : 0);
            if (targetLimit < targetCount)
                this.fail(HttpStatus.CONFLICT, 'GAME_CONFLICT', 'Participant limit is below roster size', requestId);
            const startsAt = changes.startsAt ?? game.startsAt;
            if (startsAt.getTime() <= Date.now())
                this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'startsAt must be in the future', requestId);
            const fields = {
                venueName: changes.venueName ?? game.venueName,
                address: changes.venueAddress ?? game.address,
                startsAt,
                durationMinutes: changes.durationMinutes ?? game.durationMinutes,
                participantLimit: targetLimit,
                level: changes.desiredLevel === undefined ? game.level : changes.desiredLevel,
                description: changes.description === undefined ? game.description : changes.description,
            };
            const changed = Object.entries(fields).some(([key, value]) => {
                const previous = game[key as keyof typeof fields];
                return value instanceof Date ? value.getTime() !== (previous as Date).getTime() : value !== previous;
            });
            const participationChanged =
                changes.organizerParticipates !== undefined && changes.organizerParticipates !== organizerParticipates;
            if (!changed && !participationChanged) return;
            if (participationChanged) {
                if (changes.organizerParticipates) {
                    await tx.gameParticipant.create({ data: { gameId: game.id, userId: game.organizerId } });
                } else {
                    await tx.gameParticipant.delete({
                        where: { gameId_userId: { gameId: game.id, userId: game.organizerId } },
                    });
                }
            }
            const nextVersion = game.eventVersion + 1;
            await tx.game.update({ where: { id: game.id }, data: { ...fields, eventVersion: nextVersion } });
            if (changed) {
                await tx.job.create({
                    data: {
                        gameId: game.id,
                        type: 'GAME_UPDATED',
                        eventVersion: nextVersion,
                        deduplicationKey: `${game.id}:${nextVersion}:GAME_UPDATED`,
                        payload: {
                            recipientUserIds: [
                                ...new Set([...game.participants.map((p) => p.userId), game.organizerId]),
                            ],
                            game: { ...fields, startsAt: fields.startsAt.toISOString() },
                        },
                    },
                });
            }
            if (startsAt.getTime() !== game.startsAt.getTime())
                await this.rescheduleReminder(tx, game.id, startsAt, nextVersion);
        });
    }

    @Delete(':gameId/participants/:userId')
    async removeParticipant(
        @Param('gameId') gameId: string,
        @Param('userId') userId: string,
        @Req() request: AuthenticatedRequest
    ): Promise<Record<string, unknown>> {
        const requestId = request.header('x-request-id') ?? '';
        if (!isUuid(userId)) this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'userId must be a UUID', requestId);
        return this.organizerAction(gameId, request, 'DELETE', { userId }, async (tx, game) => {
            if (game.status === 'CANCELLED')
                this.fail(HttpStatus.GONE, 'GAME_CANCELLED', 'Game was cancelled', requestId);
            if (game.startsAt.getTime() <= Date.now())
                this.fail(HttpStatus.CONFLICT, 'GAME_CONFLICT', 'Game has already started', requestId);
            if (!game.participants.some((item) => item.userId === userId))
                this.fail(HttpStatus.NOT_FOUND, 'PARTICIPANT_NOT_FOUND', 'Participant not found', requestId);
            await tx.gameParticipant.delete({ where: { gameId_userId: { gameId, userId } } });
            const nextVersion = game.eventVersion + 1;
            await tx.game.update({ where: { id: gameId }, data: { eventVersion: nextVersion } });
            await tx.job.create({
                data: {
                    gameId,
                    type: 'PARTICIPANT_REMOVED',
                    eventVersion: nextVersion,
                    deduplicationKey: `${gameId}:${nextVersion}:PARTICIPANT_REMOVED`,
                    payload: {
                        recipientUserId: userId,
                        game: this.notificationGame(game),
                    },
                },
            });
        });
    }

    @Post(':gameId/cancellation')
    async cancel(
        @Param('gameId') gameId: string,
        @Req() request: AuthenticatedRequest
    ): Promise<Record<string, unknown>> {
        return this.organizerAction(gameId, request, 'POST', null, async (tx, game) => {
            if (game.status === 'CANCELLED') return;
            const nextVersion = game.eventVersion + 1;
            await tx.game.update({ where: { id: gameId }, data: { status: 'CANCELLED', eventVersion: nextVersion } });
            await tx.job.updateMany({
                where: { gameId, type: 'GAME_REMINDER', status: { in: ['PENDING', 'PROCESSING'] } },
                data: { status: 'DEAD', lastErrorCode: 'REMINDER_STALE', lockedAt: null, lockedBy: null },
            });
            await tx.job.create({
                data: {
                    gameId,
                    type: 'GAME_CANCELLED',
                    eventVersion: nextVersion,
                    deduplicationKey: `${gameId}:${nextVersion}:GAME_CANCELLED`,
                    payload: {
                        recipientUserIds: [...new Set([...game.participants.map((p) => p.userId), game.organizerId])],
                        game: this.notificationGame(game),
                    },
                },
            });
        });
    }

    private notificationGame(game: OrganizerGame) {
        return {
            venueName: game.venueName,
            address: game.address,
            startsAt: game.startsAt.toISOString(),
            durationMinutes: game.durationMinutes,
            participantLimit: game.participantLimit,
            level: game.level,
            description: game.description,
        };
    }

    private async organizerAction(
        gameId: string,
        request: AuthenticatedRequest,
        method: 'PATCH' | 'DELETE' | 'POST',
        body: unknown,
        action: (tx: Prisma.TransactionClient, game: OrganizerGame) => Promise<void>
    ): Promise<Record<string, unknown>> {
        const requestId = request.header('x-request-id') ?? '';
        if (!isUuid(gameId)) this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'gameId must be a UUID', requestId);
        const key = request.header('idempotency-key');
        if (!key || key.length < 16 || key.length > 128)
            this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'A valid Idempotency-Key is required', requestId);
        const path =
            method === 'DELETE'
                ? `/games/${gameId}/participants/${(body as { userId: string }).userId}`
                : method === 'POST'
                  ? `/games/${gameId}/cancellation`
                  : `/games/${gameId}`;
        const requestHash = createHash('sha256').update(JSON.stringify({ method, path, body })).digest('hex');
        const where = { userId_key: { userId: request.userId, key } };
        const existing = await this.prisma.idempotencyRecord.findUnique({ where });
        if (existing) return this.replay(existing.requestHash, requestHash, existing.response, requestId);
        try {
            return await this.prisma.$transaction(async (tx) => {
                const locked = await tx.$queryRaw<Array<{ id: string }>>`
                    SELECT id FROM games WHERE id = ${gameId}::uuid FOR UPDATE
                `;
                if (!locked.length) this.fail(HttpStatus.NOT_FOUND, 'GAME_NOT_FOUND', 'Game not found', requestId);
                const raced = await tx.idempotencyRecord.findUnique({ where });
                if (raced) return this.replay(raced.requestHash, requestHash, raced.response, requestId);
                const game = await tx.game.findUniqueOrThrow({
                    where: { id: gameId },
                    include: {
                        participants: { select: participantSelection, orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }] },
                    },
                });
                if (game.organizerId !== request.userId)
                    this.fail(HttpStatus.FORBIDDEN, 'FORBIDDEN', 'Only the organizer can manage this game', requestId);
                await action(tx, game);
                const current = await tx.game.findUniqueOrThrow({
                    where: { id: gameId },
                    include: {
                        participants: { select: participantSelection, orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }] },
                    },
                });
                const response = this.toDetail(current);
                await tx.idempotencyRecord.create({
                    data: {
                        userId: request.userId,
                        key,
                        requestHash,
                        response: response as Prisma.InputJsonValue,
                    },
                });
                return response;
            });
        } catch (error) {
            if (this.isUniqueError(error)) {
                const raced = await this.prisma.idempotencyRecord.findUnique({ where });
                if (raced) return this.replay(raced.requestHash, requestHash, raced.response, requestId);
            }
            throw error;
        }
    }

    private async rescheduleReminder(tx: Prisma.TransactionClient, gameId: string, startsAt: Date, version: number) {
        await tx.job.updateMany({
            where: { gameId, type: 'GAME_REMINDER', status: { in: ['PENDING', 'PROCESSING'] } },
            data: { status: 'DEAD', lastErrorCode: 'REMINDER_STALE', lockedAt: null, lockedBy: null },
        });
        const availableAt = new Date(startsAt.getTime() - 2 * 60 * 60 * 1000);
        if (availableAt.getTime() > Date.now())
            await tx.job.create({
                data: {
                    gameId,
                    type: 'GAME_REMINDER',
                    eventVersion: version,
                    deduplicationKey: `${gameId}:${version}:GAME_REMINDER`,
                    availableAt,
                },
            });
    }

    private validateUpdate(body: UpdateGameBody, requestId: string): Partial<NormalizedGame> {
        if (!body || typeof body !== 'object' || Array.isArray(body))
            this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Request body must be an object', requestId);
        const result: Record<string, unknown> = {};
        const allowed = new Set([
            'venueName',
            'venueAddress',
            'startsAt',
            'durationMinutes',
            'participantLimit',
            'organizerParticipates',
            'desiredLevel',
            'description',
        ]);
        if (Object.keys(body).some((key) => !allowed.has(key)))
            this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Unknown field', requestId);
        for (const [key, value] of Object.entries(body)) {
            if (key === 'venueName' || key === 'venueAddress' || key === 'desiredLevel' || key === 'description') {
                if (value === null && (key === 'desiredLevel' || key === 'description')) result[key] = null;
                else {
                    const normalized = text(
                        value,
                        key === 'description' ? 0 : 1,
                        key === 'venueName' ? 120 : key === 'venueAddress' ? 300 : key === 'desiredLevel' ? 80 : 2000,
                        key === 'description'
                    );
                    if (normalized === null)
                        this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', `${key} is invalid`, requestId);
                    result[key] = normalized;
                }
            } else if (key === 'startsAt') {
                if (typeof value !== 'string' || !isDateTime(value) || Date.parse(value) <= Date.now())
                    this.fail(
                        HttpStatus.BAD_REQUEST,
                        'VALIDATION_ERROR',
                        'startsAt must be a future ISO date-time',
                        requestId
                    );
                result[key] = new Date(value);
            } else if (key === 'durationMinutes' || key === 'participantLimit') {
                const min = key === 'durationMinutes' ? 30 : 2;
                const max = key === 'durationMinutes' ? 480 : 96;
                if (!Number.isInteger(value) || Number(value) < min || Number(value) > max)
                    this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', `${key} is invalid`, requestId);
                result[key] = value;
            } else if (key === 'organizerParticipates') {
                if (typeof value !== 'boolean')
                    this.fail(
                        HttpStatus.BAD_REQUEST,
                        'VALIDATION_ERROR',
                        'organizerParticipates must be boolean',
                        requestId
                    );
                result[key] = value;
            }
        }
        return Object.fromEntries(
            Object.entries(result).sort(([a], [b]) => a.localeCompare(b))
        ) as Partial<NormalizedGame>;
    }

    private async changeParticipation(
        gameId: string,
        request: AuthenticatedRequest,
        method: 'PUT' | 'DELETE',
        joining: boolean
    ): Promise<Record<string, unknown>> {
        const requestId = request.header('x-request-id') ?? '';
        if (!isUuid(gameId)) this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'gameId must be a UUID', requestId);
        const key = request.header('idempotency-key');
        if (!key || key.length < 16 || key.length > 128) {
            this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'A valid Idempotency-Key is required', requestId);
        }
        const requestHash = createHash('sha256').update(`${method} /games/${gameId}/participation`).digest('hex');
        const where = { userId_key: { userId: request.userId, key } };
        const existing = await this.prisma.idempotencyRecord.findUnique({ where });
        if (existing) return this.replay(existing.requestHash, requestHash, existing.response, requestId);

        try {
            return await this.prisma.$transaction(async (tx) => {
                // Every roster mutation, including organizer actions, must lock the game before reading its roster.
                const locked = await tx.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM games WHERE id = ${gameId}::uuid FOR UPDATE
            `;
                if (!locked.length) this.fail(HttpStatus.NOT_FOUND, 'GAME_NOT_FOUND', 'Game not found', requestId);
                const raced = await tx.idempotencyRecord.findUnique({ where });
                if (raced) return this.replay(raced.requestHash, requestHash, raced.response, requestId);

                const game = await tx.game.findUniqueOrThrow({
                    where: { id: gameId },
                    include: {
                        participants: { select: participantSelection, orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }] },
                    },
                });
                if (game.status === 'CANCELLED') {
                    this.fail(HttpStatus.GONE, 'GAME_CANCELLED', 'Game was cancelled', requestId);
                }
                if (game.startsAt.getTime() <= Date.now()) {
                    this.fail(HttpStatus.CONFLICT, 'GAME_CONFLICT', 'Game has already started', requestId);
                }
                const participant = game.participants.some((item) => item.userId === request.userId);
                if (joining && !participant) {
                    if (game.participants.length >= game.participantLimit) {
                        this.fail(HttpStatus.CONFLICT, 'GAME_FULL', 'Game is full', requestId);
                    }
                    try {
                        await tx.gameParticipant.create({ data: { gameId, userId: request.userId } });
                    } catch (error) {
                        if (this.isUniqueError(error)) {
                            this.fail(
                                HttpStatus.CONFLICT,
                                'GAME_CONFLICT',
                                'Participation changed concurrently',
                                requestId
                            );
                        }
                        throw error;
                    }
                } else if (!joining && participant) {
                    await tx.gameParticipant.delete({ where: { gameId_userId: { gameId, userId: request.userId } } });
                }

                const current = await tx.game.findUniqueOrThrow({
                    where: { id: gameId },
                    include: {
                        participants: { select: participantSelection, orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }] },
                    },
                });
                const response = this.toDetail(current);
                await tx.idempotencyRecord.create({
                    data: { userId: request.userId, key, requestHash, response: response as Prisma.InputJsonValue },
                });
                return response;
            });
        } catch (error) {
            if (this.isUniqueError(error)) {
                const raced = await this.prisma.idempotencyRecord.findUnique({ where });
                if (raced) return this.replay(raced.requestHash, requestHash, raced.response, requestId);
            }
            throw error;
        }
    }

    private validate(body: CreateGameBody, requestId: string): NormalizedGame {
        const errors: string[] = [];
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Request body must be an object', requestId);
        }
        const allowed = new Set([
            'venueName',
            'venueAddress',
            'startsAt',
            'durationMinutes',
            'participantLimit',
            'organizerParticipates',
            'desiredLevel',
            'description',
        ]);
        if (Object.keys(body).some((key) => !allowed.has(key))) errors.push('Unknown field');
        const venueName = text(body.venueName, 1, 120);
        const venueAddress = text(body.venueAddress, 1, 300);
        if (!venueName) errors.push('venueName must be a non-empty string up to 120 characters');
        if (!venueAddress) errors.push('venueAddress must be a non-empty string up to 300 characters');
        if (
            typeof body.startsAt !== 'string' ||
            !isDateTime(body.startsAt) ||
            Date.parse(body.startsAt) <= Date.now()
        ) {
            errors.push('startsAt must be a future ISO date-time with timezone');
        }
        if (
            !Number.isInteger(body.durationMinutes) ||
            Number(body.durationMinutes) < 30 ||
            Number(body.durationMinutes) > 480
        ) {
            errors.push('durationMinutes must be an integer between 30 and 480');
        }
        if (
            !Number.isInteger(body.participantLimit) ||
            Number(body.participantLimit) < 2 ||
            Number(body.participantLimit) > 96
        ) {
            errors.push('participantLimit must be an integer between 2 and 96');
        }
        if (body.organizerParticipates !== undefined && typeof body.organizerParticipates !== 'boolean') {
            errors.push('organizerParticipates must be a boolean');
        }
        const desiredLevel = body.desiredLevel === undefined ? null : text(body.desiredLevel, 1, 80);
        if (body.desiredLevel !== undefined && !desiredLevel)
            errors.push('desiredLevel must be a non-empty string up to 80 characters');
        const description = body.description === undefined ? null : text(body.description, 0, 2000, true);
        if (body.description !== undefined && description === null)
            errors.push('description must be a string up to 2000 characters');
        if (errors.length) this.fail(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', errors.join('; '), requestId);
        return {
            venueName: venueName!,
            venueAddress: venueAddress!,
            startsAt: new Date(body.startsAt as string),
            durationMinutes: Number(body.durationMinutes),
            participantLimit: Number(body.participantLimit),
            organizerParticipates: body.organizerParticipates !== false,
            desiredLevel,
            description,
        };
    }

    private toSummary(
        game: {
            id: string;
            organizerId: string;
            venueName: string;
            address: string;
            startsAt: Date;
            durationMinutes: number;
            participantLimit: number;
            level: string | null;
            description: string | null;
            status: string;
            createdAt: Date;
            updatedAt: Date;
        },
        participantCount: number
    ): Record<string, unknown> {
        return {
            id: game.id,
            organizerId: game.organizerId,
            organizerParticipates: false,
            venueName: game.venueName,
            venueAddress: game.address,
            startsAt: game.startsAt.toISOString(),
            durationMinutes: game.durationMinutes,
            participantLimit: game.participantLimit,
            participantCount,
            status:
                game.status === 'CANCELLED'
                    ? 'CANCELLED'
                    : participantCount >= game.participantLimit
                      ? 'FULL'
                      : 'SCHEDULED',
            ...(game.level ? { desiredLevel: game.level } : {}),
            ...(game.description ? { description: game.description } : {}),
            createdAt: game.createdAt.toISOString(),
            updatedAt: game.updatedAt.toISOString(),
        };
    }

    private toDetail(game: {
        id: string;
        organizerId: string;
        venueName: string;
        address: string;
        startsAt: Date;
        durationMinutes: number;
        participantLimit: number;
        level: string | null;
        description: string | null;
        status: string;
        createdAt: Date;
        updatedAt: Date;
        participants: Array<{ userId: string; joinedAt: Date; user: { displayName: string } }>;
    }): Record<string, unknown> {
        const summary = this.toSummary(game, game.participants.length);
        const organizerParticipates = game.participants.some((participant) => participant.userId === game.organizerId);
        return {
            ...summary,
            organizerParticipates,
            participants: game.participants.map((participant) => ({
                userId: participant.userId,
                displayName: participant.user.displayName,
                joinedAt: participant.joinedAt.toISOString(),
                isOrganizer: participant.userId === game.organizerId,
            })),
        };
    }

    private replay(
        storedHash: string,
        requestHash: string,
        response: Prisma.JsonValue,
        requestId: string
    ): Record<string, unknown> {
        if (storedHash !== requestHash)
            this.fail(
                HttpStatus.CONFLICT,
                'IDEMPOTENCY_KEY_REUSED',
                'Idempotency key was already used with another request',
                requestId
            );
        return response as Record<string, unknown>;
    }

    private isUniqueError(error: unknown): boolean {
        return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
    }

    private fail(status: number, code: string, message: string, requestId = ''): never {
        throw new HttpException({ code, message, requestId }, status);
    }
}

function text(value: unknown, min: number, max: number, allowEmpty = false): string | null {
    if (typeof value !== 'string') return null;
    const normalized = value.trim();
    return normalized.length >= min && normalized.length <= max && (allowEmpty || normalized.length > 0)
        ? normalized
        : null;
}

function isDateTime(value: string): boolean {
    return (
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
        Number.isFinite(Date.parse(value))
    );
}

function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
