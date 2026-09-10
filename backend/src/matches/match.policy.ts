import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { Clock } from '../identity/clock';

export interface MatchPolicySnapshot {
    version: string;
    publishMinimumLeadMs: number;
    publishHorizonMs: number;
    offerMs: number;
    startEarlyMs: number;
    startLateMs: number;
    resultMs: number;
    confirmationMs: number;
}

@Injectable()
export class MatchPolicyService {
    readonly current: MatchPolicySnapshot;

    constructor(
        private readonly clock: Clock,
        @Inject(ENVIRONMENT) environment: Environment
    ) {
        this.current = Object.freeze({
            version: environment.MATCH_POLICY_VERSION,
            publishMinimumLeadMs: environment.MATCH_PUBLISH_MINIMUM_LEAD_MINUTES * 60_000,
            publishHorizonMs: environment.MATCH_PUBLISH_HORIZON_DAYS * 86_400_000,
            offerMs: environment.MATCH_WAITLIST_OFFER_MINUTES * 60_000,
            startEarlyMs: environment.MATCH_START_EARLY_MINUTES * 60_000,
            startLateMs: environment.MATCH_START_LATE_HOURS * 3_600_000,
            resultMs: environment.MATCH_RESULT_DEADLINE_HOURS * 3_600_000,
            confirmationMs: environment.MATCH_CONFIRMATION_DEADLINE_HOURS * 3_600_000,
        });
    }

    now(): Date {
        return this.clock.now();
    }

    offerDeadline(startsAt: Date): Date {
        return new Date(Math.min(startsAt.getTime(), this.now().getTime() + this.current.offerMs));
    }
}
