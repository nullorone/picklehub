import { Body, Controller, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from './prisma.service.js';
import { createSessionToken, hashSessionToken, validateTelegramInitData } from './telegram-auth.js';

interface SessionRequestBody {
    initData?: unknown;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = 60 * 1000;
const LOGIN_LIMIT = 10;
const attempts = new Map<string, { count: number; resetAt: number }>();

@Controller('sessions/telegram')
export class TelegramSessionsController {
    constructor(private readonly prisma: PrismaService) {}

    @Post()
    async create(
        @Body() body: SessionRequestBody,
        @Req() request: Request
    ): Promise<{
        accessToken: string;
        tokenType: 'Bearer';
        expiresAt: string;
        user: { id: string; displayName: string };
    }> {
        const now = Date.now();
        const key = request.ip || 'unknown';
        const current = attempts.get(key);
        if (attempts.size > 10000) {
            for (const [attemptKey, attempt] of attempts) {
                if (attempt.resetAt <= now) attempts.delete(attemptKey);
            }
        }
        if (current && current.resetAt > now && current.count >= LOGIN_LIMIT) {
            throw new HttpException(
                {
                    code: 'RATE_LIMITED',
                    message: 'Too many login attempts',
                    requestId: request.header('x-request-id') ?? '',
                },
                HttpStatus.TOO_MANY_REQUESTS
            );
        }
        if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
        else current.count += 1;

        let telegramUser;
        try {
            telegramUser = validateTelegramInitData(
                typeof body?.initData === 'string' ? body.initData : '',
                process.env.TELEGRAM_BOT_TOKEN ?? ''
            );
        } catch {
            throw new HttpException(
                {
                    code: 'TELEGRAM_AUTH_INVALID',
                    message: 'Telegram authorization data is invalid',
                    requestId: request.header('x-request-id') ?? '',
                },
                HttpStatus.BAD_REQUEST
            );
        }

        const telegramUserId = BigInt(telegramUser.id);
        const existing = await this.prisma.telegramIdentity.findUnique({
            where: { telegramUserId },
            select: { user: { select: { id: true } } },
        });
        const user =
            existing?.user ??
            (await this.prisma.user
                .create({
                    data: {
                        telegramIdentity: { create: { telegramUserId } },
                    },
                    select: { id: true },
                })
                .catch(async (error: unknown) => {
                    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
                        const raced = await this.prisma.telegramIdentity.findUnique({
                            where: { telegramUserId },
                            select: { user: { select: { id: true } } },
                        });
                        if (raced) return raced.user;
                    }
                    throw error;
                }));

        const accessToken = createSessionToken();
        const expiresAt = new Date(now + SESSION_TTL_MS);
        await this.prisma.session.create({
            data: { userId: user.id, tokenHash: hashSessionToken(accessToken), expiresAt },
        });
        attempts.delete(key);
        return {
            accessToken,
            tokenType: 'Bearer',
            expiresAt: expiresAt.toISOString(),
            user: { id: user.id, displayName: telegramUser.first_name },
        };
    }
}
