import { Body, Controller, HttpException, HttpStatus, Post, Headers } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { miniAppUrl, parseStartMessage, safeSecretEquals } from './telegram-bot.js';

@Controller('telegram/webhook')
export class TelegramBotController {
    constructor(private readonly prisma: PrismaService) {}

    @Post()
    async receive(
        @Body() update: unknown,
        @Headers('x-telegram-bot-api-secret-token') secret: string | undefined
    ): Promise<{ ok: true }> {
        if (!safeSecretEquals(secret, process.env.TELEGRAM_WEBHOOK_SECRET ?? '')) {
            throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
        }
        const start = parseStartMessage(update);
        if (!start) return { ok: true };

        const game = start.gameId
            ? await this.prisma.game.findUnique({ where: { id: start.gameId }, select: { id: true } })
            : null;
        const appUrl = process.env.TELEGRAM_APP_URL ?? '';
        const botToken = process.env.TELEGRAM_BOT_TOKEN ?? '';
        if (!appUrl || !botToken) throw new HttpException('Bot configuration missing', HttpStatus.SERVICE_UNAVAILABLE);

        const identity = await this.prisma.telegramIdentity.upsert({
            where: { telegramUserId: start.telegramUserId },
            create: {
                telegramUserId: start.telegramUserId,
                privateChatId: start.chatId,
                canMessage: true,
                botStartedAt: new Date(),
                user: { create: {} },
            },
            update: { privateChatId: start.chatId, canMessage: true, botStartedAt: new Date() },
            select: { id: true },
        });
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: start.chatId.toString(),
                text: start.gameId && !game ? 'Игра не найдена. Откройте список игр.' : 'Откройте PickleHub:',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: game ? 'Открыть игру' : 'Открыть приложение',
                                web_app: { url: miniAppUrl(appUrl, game?.id ?? null) },
                            },
                        ],
                    ],
                },
            }),
            signal: AbortSignal.timeout(10000),
        });
        if (response.status === 403) {
            await this.prisma.telegramIdentity.update({ where: { id: identity.id }, data: { canMessage: false } });
            return { ok: true };
        }
        if (!response.ok) throw new HttpException('Telegram delivery failed', HttpStatus.BAD_GATEWAY);
        return { ok: true };
    }
}
