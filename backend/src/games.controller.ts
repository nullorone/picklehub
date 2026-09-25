import { createHash } from 'node:crypto';
import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
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
            Number(body.participantLimit) > 32
        ) {
            errors.push('participantLimit must be an integer between 2 and 32');
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
