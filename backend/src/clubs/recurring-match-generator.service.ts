import { Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ClubState, Prisma, RecurringMatchRuleState } from '@prisma/client';

import { PrismaService } from '../common/database/prisma.service';
import { uuidV7 } from '../common/identifiers/uuid-v7';
import { ApplicationLogger } from '../common/logging/application-logger.service';
import { MatchService } from '../matches/match.service';
import { OutboxService } from '../outbox/outbox.service';
import type { RecurringMatchTemplateDto } from './club.dto';
import {
    addCalendarDays,
    calendarDayDistance,
    isoWeekday,
    localDateInZone,
    resolveLocalInstant,
} from './club-timezone';

const RUN_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class RecurringMatchGeneratorService implements OnApplicationBootstrap, OnModuleDestroy {
    private timer: NodeJS.Timeout | undefined;
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly matches: MatchService,
        private readonly outbox: OutboxService,
        private readonly logger: ApplicationLogger
    ) {}

    onApplicationBootstrap(): void {
        if (process.env.APP_ROLE !== 'worker') return;
        void this.runOnce().catch((error: unknown) => {
            this.logger.error(error, undefined, RecurringMatchGeneratorService.name);
        });
        this.timer = setInterval(() => {
            void this.runOnce().catch((error: unknown) => {
                this.logger.error(error, undefined, RecurringMatchGeneratorService.name);
            });
        }, RUN_INTERVAL_MS);
        this.timer.unref();
    }

    onModuleDestroy(): void {
        if (this.timer !== undefined) clearInterval(this.timer);
    }

    async runOnce(now = new Date()): Promise<number> {
        if (this.running) return 0;
        this.running = true;
        try {
            const ruleIds = await this.prisma.recurringMatchRule.findMany({
                where: { state: { not: RecurringMatchRuleState.ENDED } },
                select: { id: true },
                orderBy: { id: 'asc' },
                take: 500,
            });
            let created = 0;
            for (const { id } of ruleIds) created += await this.generateRule(id, now);
            return created;
        } finally {
            this.running = false;
        }
    }

    private async generateRule(ruleId: string, now: Date): Promise<number> {
        for (let attempt = 0; ; attempt += 1) {
            try {
                return await this.prisma.$transaction(
                    async (tx) => {
                        await tx.$queryRaw`SELECT id FROM recurring_match_rules WHERE id = ${ruleId}::uuid FOR UPDATE`;
                        const rule = await tx.recurringMatchRule.findUnique({
                            where: { id: ruleId },
                            include: { club: true },
                        });
                        if (rule === null || rule.state === RecurringMatchRuleState.ENDED) return 0;
                        const today = localDateInZone(now, rule.timeZone);
                        const horizon = addCalendarDays(today, rule.generationHorizonDays);
                        const startsOn = rule.startsOn.toISOString().slice(0, 10);
                        const endsOn = rule.endsOn?.toISOString().slice(0, 10) ?? horizon;
                        let date = rule.generatedThrough?.toISOString().slice(0, 10) ?? addCalendarDays(startsOn, -1);
                        date = addCalendarDays(
                            date < addCalendarDays(today, -1) ? addCalendarDays(today, -1) : date,
                            1
                        );
                        const finalDate = endsOn < horizon ? endsOn : horizon;
                        if (date > finalDate) return 0;
                        let created = 0;
                        for (; date <= finalDate; date = addCalendarDays(date, 1)) {
                            const distance = calendarDayDistance(startsOn, date);
                            if (
                                distance < 0 ||
                                Math.floor(distance / 7) % rule.intervalWeeks !== 0 ||
                                !rule.weekdays.includes(isoWeekday(date))
                            )
                                continue;
                            const localTime = rule.localStartTime.toISOString().slice(11, 16);
                            const calendarKey = `${date}T${localTime}`;
                            const existing = await tx.recurringMatchOccurrence.findUnique({
                                where: { ruleId_calendarKey: { ruleId, calendarKey } },
                            });
                            if (existing !== null) continue;
                            const template = rule.matchTemplate as unknown as RecurringMatchTemplateDto;
                            const [manager, venueLink] = await Promise.all([
                                tx.clubMembership.findFirst({
                                    where: {
                                        clubId: rule.clubId,
                                        userId: rule.organizerId,
                                        state: 'ACTIVE',
                                        role: { in: ['OWNER', 'ADMIN'] },
                                    },
                                }),
                                tx.clubVenue.findUnique({
                                    where: { clubId_venueId: { clubId: rule.clubId, venueId: template.venueId } },
                                    include: { venue: true },
                                }),
                            ]);
                            const paused =
                                rule.state === RecurringMatchRuleState.PAUSED ||
                                rule.club.state === ClubState.ARCHIVED ||
                                manager === null ||
                                venueLink?.venue.publicationState !== 'PUBLISHED' ||
                                venueLink.venue.canonicalVenueId !== null;
                            const resolved = paused
                                ? null
                                : resolveLocalInstant(date, localTime, rule.timeZone, rule.dstOverlapPolicy);
                            if (paused || resolved === null || !this.matches.isWithinPublishWindow(resolved.instant)) {
                                const occurrence = await tx.recurringMatchOccurrence.create({
                                    data: {
                                        id: uuidV7(),
                                        clubId: rule.clubId,
                                        ruleId,
                                        templateVersion: rule.templateVersion,
                                        calendarKey,
                                        localDate: new Date(`${date}T00:00:00.000Z`),
                                        localStartTime: rule.localStartTime,
                                        state: paused || resolved !== null ? 'SKIPPED_PAUSE' : 'SKIPPED_DST_GAP',
                                    },
                                });
                                await this.occurrenceEvent(tx, rule.club.version, occurrence);
                                created += 1;
                                continue;
                            }
                            const occurrenceId = uuidV7();
                            const matchId = uuidV7();
                            const occurrence = await tx.recurringMatchOccurrence.create({
                                data: {
                                    id: occurrenceId,
                                    clubId: rule.clubId,
                                    ruleId,
                                    templateVersion: rule.templateVersion,
                                    calendarKey,
                                    localDate: new Date(`${date}T00:00:00.000Z`),
                                    localStartTime: rule.localStartTime,
                                    state: 'MATERIALIZED',
                                    startsAt: resolved.instant,
                                    utcOffsetMinutes: resolved.offsetMinutes,
                                    matchId,
                                },
                            });
                            await this.matches.create(
                                rule.organizerId,
                                {
                                    format: template.format,
                                    visibility: template.visibility,
                                    joinMode: template.joinMode,
                                    venueId: template.venueId,
                                    skillMin: template.skillMin,
                                    skillMax: template.skillMax,
                                    description: template.description,
                                    bookingState: template.bookingState,
                                    ...(template.bookingNote === undefined
                                        ? {}
                                        : { bookingNote: template.bookingNote }),
                                    startsAt: resolved.instant.toISOString(),
                                    timeZone: rule.timeZone,
                                },
                                tx,
                                {
                                    clubId: rule.clubId,
                                    origin: 'RECURRING_RULE',
                                    recurringRuleId: rule.id,
                                    recurringOccurrenceId: occurrenceId,
                                    matchId,
                                }
                            );
                            await this.matches.publish(rule.organizerId, matchId, 0, tx);
                            await this.occurrenceEvent(tx, rule.club.version, occurrence);
                            created += 1;
                        }
                        await tx.recurringMatchRule.update({
                            where: { id: ruleId },
                            data: {
                                generatedThrough: new Date(`${finalDate}T00:00:00.000Z`),
                                revision: { increment: 1 },
                                updatedAt: now,
                            },
                        });
                        return created;
                    },
                    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 }
                );
            } catch (error) {
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2)
                    continue;
                throw error;
            }
        }
    }

    private async occurrenceEvent(
        tx: Prisma.TransactionClient,
        clubVersion: number,
        occurrence: {
            id: string;
            clubId: string;
            ruleId: string;
            calendarKey: string;
            state: string;
            matchId: string | null;
        }
    ): Promise<void> {
        const occurredAt = new Date();
        const correlationId = uuidV7();
        const type = 'club.recurring.occurrence.recorded.v1';
        await this.outbox.enqueue(tx, {
            type,
            schemaVersion: 1,
            payload: {
                messageId: uuidV7(),
                type,
                occurredAt: occurredAt.toISOString(),
                correlationId,
                causationId: null,
                data: {
                    clubId: occurrence.clubId,
                    clubVersion,
                    ruleId: occurrence.ruleId,
                    occurrenceId: occurrence.id,
                    calendarKey: occurrence.calendarKey,
                    state: occurrence.state,
                    matchId: occurrence.matchId,
                },
            },
            correlationId,
            occurredAt,
        });
    }
}
