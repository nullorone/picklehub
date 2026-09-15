import { Injectable } from '@nestjs/common';

import type { DecisionContext } from './advertising.types';

export interface ExternalAdDecision {
    source: 'EXTERNAL_FALLBACK';
}

export abstract class AdvertisingProviderPort {
    abstract decide(context: DecisionContext): Promise<ExternalAdDecision | null>;
}

@Injectable()
export class DisabledAdvertisingProvider extends AdvertisingProviderPort {
    decide(context: DecisionContext): Promise<null> {
        void context;
        return Promise.resolve(null);
    }
}
