import { randomUUID } from 'node:crypto';
import { Job, Prisma, PrismaClient } from '@prisma/client';
import { miniAppUrl } from './telegram-bot.js';

const supportedTypes = ['GAME_UPDATED', 'GAME_CANCELLED', 'PARTICIPANT_REMOVED', 'GAME_REMINDER', 'TELEGRAM_DELIVERY'];
export const REMINDER_LATE_WINDOW_MS = 15 * 60 * 1000;
const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;
type DeliveryResult = { kind: 'sent' | 'retry' | 'permanent'; code: string; retryAfterMs?: number };
type GameSnapshot = { venueName: string; address: string; startsAt: string };

function payloadObject(value: Prisma.JsonValue): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_PAYLOAD');
    return value as Record<string, unknown>;
}

export function messageFor(job: Job, appUrl: string): { recipients: string[]; text: string } {
    const payload = payloadObject(job.payload);
    const game = payload.game;
    if (!game || typeof game !== 'object' || Array.isArray(game)) throw new Error('INVALID_PAYLOAD');
    const snapshot = game as Partial<GameSnapshot>;
    if (
        typeof snapshot.venueName !== 'string' ||
        typeof snapshot.address !== 'string' ||
        typeof snapshot.startsAt !== 'string' ||
        !Number.isFinite(Date.parse(snapshot.startsAt)) ||
        !job.gameId
    )
        throw new Error('INVALID_PAYLOAD');
    const date = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        dateStyle: 'long',
        timeStyle: 'short',
    }).format(new Date(snapshot.startsAt));
    const action =
        job.type === 'GAME_UPDATED'
            ? 'Игра изменена'
            : job.type === 'GAME_CANCELLED'
              ? 'Игра отменена'
              : 'Вы удалены из участников игры';
    const recipients = job.type === 'PARTICIPANT_REMOVED' ? [payload.recipientUserId] : payload.recipientUserIds;
    if (!Array.isArray(recipients) || recipients.some((id) => typeof id !== 'string'))
        throw new Error('INVALID_PAYLOAD');
    const url = miniAppUrl(appUrl, job.gameId);
    return {
        recipients: [...new Set(recipients as string[])],
        text: `${action}.\n${date} (Москва)\n${snapshot.venueName}, ${snapshot.address}\n${url}`,
    };
}

export function reminderIsCurrent(startsAt: Date, dueAt: Date, now: Date): boolean {
    return (
        dueAt.getTime() === startsAt.getTime() - REMINDER_LEAD_MS &&
        now.getTime() >= dueAt.getTime() &&
        now.getTime() <= dueAt.getTime() + REMINDER_LATE_WINDOW_MS &&
        now.getTime() < startsAt.getTime()
    );
}

function reminderText(
    game: { id: string; venueName: string; address: string; startsAt: Date },
    appUrl: string
): string {
    const date = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Europe/Moscow',
        dateStyle: 'long',
        timeStyle: 'short',
    }).format(game.startsAt);
    return `Напоминание об игре.\n${date} (Москва)\n${game.venueName}, ${game.address}\n${miniAppUrl(appUrl, game.id)}`;
}

export async function sendTelegramMessage(token: string, chatId: bigint, message: string): Promise<DeliveryResult> {
    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId.toString(), text: message, disable_web_page_preview: true }),
            signal: AbortSignal.timeout(10_000),
        });
        if (response.ok) return { kind: 'sent', code: 'SENT' };
        if (response.status === 429) {
            let retryAfter = Number(response.headers.get('retry-after'));
            if (!Number.isFinite(retryAfter) || retryAfter <= 0) {
                try {
                    const body: unknown = await response.json();
                    if (
                        body &&
                        typeof body === 'object' &&
                        'parameters' in body &&
                        body.parameters &&
                        typeof body.parameters === 'object' &&
                        'retry_after' in body.parameters
                    ) {
                        retryAfter = Number(body.parameters.retry_after);
                    }
                } catch {
                    /* Fall back to exponential retry. */
                }
            }
            return {
                kind: 'retry',
                code: 'TELEGRAM_RATE_LIMIT',
                ...(Number.isFinite(retryAfter) && retryAfter > 0
                    ? { retryAfterMs: Math.min(retryAfter * 1000, 3_600_000) }
                    : {}),
            };
        }
        if (response.status === 403 || response.status === 400) {
            return { kind: 'permanent', code: response.status === 403 ? 'TELEGRAM_FORBIDDEN' : 'TELEGRAM_BAD_REQUEST' };
        }
        return { kind: 'retry', code: 'TELEGRAM_UNAVAILABLE' };
    } catch {
        // Telegram may have accepted a request whose response was lost. Retrying can deliver it twice.
        return { kind: 'retry', code: 'TELEGRAM_RESULT_UNKNOWN' };
    }
}

export class NotificationWorker {
    private readonly workerId = randomUUID();

    constructor(
        private readonly prisma: PrismaClient,
        private readonly token: string,
        private readonly appUrl: string,
        private readonly sender: typeof sendTelegramMessage = sendTelegramMessage,
        private readonly now: () => Date = () => new Date()
    ) {}

    async runOne(): Promise<boolean> {
        const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>`
            UPDATE jobs SET status = 'PROCESSING', attempts = attempts + 1,
                locked_at = ${this.now()}, locked_by = ${this.workerId}
            WHERE id = (
                SELECT id FROM jobs
                WHERE type IN ('GAME_UPDATED', 'GAME_CANCELLED', 'PARTICIPANT_REMOVED', 'GAME_REMINDER', 'TELEGRAM_DELIVERY')
                  AND attempts < max_attempts
                  AND ((status = 'PENDING' AND available_at <= ${this.now()})
                    OR (status = 'PROCESSING' AND locked_at < ${new Date(this.now().getTime() - 60_000)}))
                ORDER BY available_at, created_at FOR UPDATE SKIP LOCKED LIMIT 1
            ) RETURNING id
        `;
        const id = claimed[0]?.id;
        if (!id) {
            await this.prisma.$executeRaw`
                UPDATE jobs SET status = 'DEAD', locked_at = NULL, locked_by = NULL,
                    last_error_code = 'ATTEMPTS_EXHAUSTED'
                WHERE type IN ('GAME_UPDATED', 'GAME_CANCELLED', 'PARTICIPANT_REMOVED', 'GAME_REMINDER', 'TELEGRAM_DELIVERY')
                  AND status = 'PROCESSING' AND attempts >= max_attempts
                  AND locked_at < ${new Date(this.now().getTime() - 60_000)}
            `;
            return false;
        }
        const job = await this.prisma.job.findUniqueOrThrow({ where: { id } });
        try {
            if (job.type === 'TELEGRAM_DELIVERY') await this.deliver(job);
            else if (job.type === 'GAME_REMINDER') await this.expandReminder(job);
            else if (supportedTypes.includes(job.type)) await this.expand(job);
        } catch {
            await this.finish(job, { kind: 'retry', code: 'WORKER_ERROR' });
        }
        return true;
    }

    private async expandReminder(job: Job): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            if (!job.gameId) {
                await tx.job.updateMany({
                    where: { id: job.id, lockedBy: this.workerId },
                    data: { status: 'DEAD', lastErrorCode: 'INVALID_PAYLOAD', lockedAt: null, lockedBy: null },
                });
                return;
            }
            await tx.$queryRaw`SELECT id FROM games WHERE id = ${job.gameId}::uuid FOR UPDATE`;
            const lease = await tx.job.findUnique({ where: { id: job.id }, select: { status: true, lockedBy: true } });
            if (lease?.status !== 'PROCESSING' || lease.lockedBy !== this.workerId) return;
            const game = await tx.game.findUnique({
                where: { id: job.gameId },
                include: { participants: { select: { userId: true, joinedAt: true } } },
            });
            if (game?.status === 'OPEN' && reminderIsCurrent(game.startsAt, job.availableAt, this.now())) {
                const text = reminderText(game, this.appUrl);
                for (const participant of game.participants.filter((person) => person.joinedAt <= job.availableAt)) {
                    await tx.job.createMany({
                        data: [
                            {
                                gameId: game.id,
                                type: 'TELEGRAM_DELIVERY',
                                eventVersion: job.eventVersion,
                                deduplicationKey: `${job.deduplicationKey}:${participant.userId}`,
                                payload: {
                                    recipientUserId: participant.userId,
                                    text,
                                    reminderStartsAt: game.startsAt.toISOString(),
                                    reminderDueAt: job.availableAt.toISOString(),
                                },
                            },
                        ],
                        skipDuplicates: true,
                    });
                }
            }
            await tx.job.updateMany({
                where: { id: job.id, status: 'PROCESSING', lockedBy: this.workerId, attempts: job.attempts },
                data: { status: 'COMPLETED', completedAt: this.now(), lockedAt: null, lockedBy: null },
            });
        });
    }

    private async expand(job: Job): Promise<void> {
        let message;
        try {
            message = messageFor(job, this.appUrl);
        } catch {
            await this.finish(job, { kind: 'permanent', code: 'INVALID_PAYLOAD' });
            return;
        }
        await this.prisma.$transaction(async (tx) => {
            for (const recipientUserId of message.recipients) {
                await tx.job.createMany({
                    data: [
                        {
                            gameId: job.gameId,
                            type: 'TELEGRAM_DELIVERY',
                            eventVersion: job.eventVersion,
                            deduplicationKey: `${job.deduplicationKey}:${recipientUserId}`,
                            payload: { recipientUserId, text: message.text },
                        },
                    ],
                    skipDuplicates: true,
                });
            }
            await tx.job.updateMany({
                where: { id: job.id, status: 'PROCESSING', lockedBy: this.workerId, attempts: job.attempts },
                data: { status: 'COMPLETED', completedAt: new Date(), lockedAt: null, lockedBy: null },
            });
        });
    }

    private async deliver(job: Job): Promise<void> {
        let payload;
        try {
            payload = payloadObject(job.payload);
        } catch {
            await this.finish(job, { kind: 'permanent', code: 'INVALID_PAYLOAD' });
            return;
        }
        if (typeof payload.recipientUserId !== 'string' || typeof payload.text !== 'string') {
            await this.finish(job, { kind: 'permanent', code: 'INVALID_PAYLOAD' });
            return;
        }
        if ('reminderStartsAt' in payload || 'reminderDueAt' in payload) {
            const startsAt = payload.reminderStartsAt;
            const dueAt = payload.reminderDueAt;
            if (
                typeof startsAt !== 'string' ||
                typeof dueAt !== 'string' ||
                !job.gameId ||
                !Number.isFinite(Date.parse(startsAt)) ||
                !Number.isFinite(Date.parse(dueAt))
            ) {
                await this.finish(job, { kind: 'permanent', code: 'INVALID_PAYLOAD' });
                return;
            }
            const game = await this.prisma.game.findUnique({
                where: { id: job.gameId },
                select: {
                    status: true,
                    startsAt: true,
                    participants: { where: { userId: payload.recipientUserId }, select: { joinedAt: true } },
                },
            });
            if (
                game?.status !== 'OPEN' ||
                game.startsAt.toISOString() !== startsAt ||
                !reminderIsCurrent(game.startsAt, new Date(dueAt), this.now()) ||
                !game.participants[0] ||
                game.participants[0].joinedAt.getTime() > Date.parse(dueAt)
            ) {
                await this.finish(job, { kind: 'permanent', code: 'REMINDER_STALE' });
                return;
            }
        }
        const identity = await this.prisma.telegramIdentity.findUnique({
            where: { userId: payload.recipientUserId },
            select: { id: true, privateChatId: true, canMessage: true },
        });
        if (!identity?.canMessage || identity.privateChatId === null) {
            await this.finish(job, { kind: 'permanent', code: 'RECIPIENT_UNAVAILABLE' });
            return;
        }
        const result = await this.sender(this.token, identity.privateChatId, payload.text);
        if (result.code === 'TELEGRAM_FORBIDDEN') {
            await this.prisma.telegramIdentity.updateMany({ where: { id: identity.id }, data: { canMessage: false } });
        }
        await this.finish(job, result);
    }

    private async finish(job: Job, result: DeliveryResult): Promise<void> {
        const exhausted = job.attempts >= job.maxAttempts;
        const status =
            result.kind === 'sent' ? 'COMPLETED' : result.kind === 'permanent' || exhausted ? 'DEAD' : 'PENDING';
        const backoff = Math.min(30_000 * 2 ** Math.min(job.attempts - 1, 7), 3_600_000);
        await this.prisma.job.updateMany({
            where: { id: job.id, status: 'PROCESSING', lockedBy: this.workerId, attempts: job.attempts },
            data: {
                status,
                lockedAt: null,
                lockedBy: null,
                lastErrorCode: result.kind === 'sent' ? null : result.code,
                completedAt: status === 'COMPLETED' ? this.now() : null,
                ...(status === 'PENDING'
                    ? { availableAt: new Date(this.now().getTime() + Math.max(backoff, result.retryAfterMs ?? 0)) }
                    : {}),
            },
        });
        if (status === 'DEAD')
            process.stdout.write(
                `${JSON.stringify({ level: 'warn', message: 'notification_dead', jobId: job.id, code: result.code })}\n`
            );
    }
}
