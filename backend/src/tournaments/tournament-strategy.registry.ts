import { Injectable } from '@nestjs/common';

import { TournamentDomainError } from './tournament.errors';
import type { BuiltInFormatCode, TournamentFormatStrategy } from './tournament.types';
import { AmericanoStrategy } from './strategies/americano.strategy';
import { DoubleEliminationStrategy } from './strategies/double-elimination.strategy';
import { KingOfCourtStrategy } from './strategies/king-of-court.strategy';
import { LadderStrategy } from './strategies/ladder.strategy';
import { PoolPlayStrategy } from './strategies/pool-play.strategy';
import { RoundRobinStrategy } from './strategies/round-robin.strategy';
import { SingleEliminationStrategy } from './strategies/single-elimination.strategy';
import { SwissStrategy } from './strategies/swiss.strategy';

@Injectable()
export class TournamentStrategyRegistry {
    private readonly strategies: ReadonlyMap<string, TournamentFormatStrategy>;

    constructor() {
        const strategies: TournamentFormatStrategy[] = [
            new AmericanoStrategy(),
            new RoundRobinStrategy(),
            new SingleEliminationStrategy(),
            new DoubleEliminationStrategy(),
            new PoolPlayStrategy(),
            new SwissStrategy(),
            new LadderStrategy(),
            new KingOfCourtStrategy(),
        ];
        this.strategies = new Map(
            strategies.map((strategy) => [this.key(strategy.formatCode, strategy.strategyVersion), strategy])
        );
    }

    get(formatCode: BuiltInFormatCode | 'CUSTOM_DSL', strategyVersion: string): TournamentFormatStrategy {
        if (formatCode === 'CUSTOM_DSL') throw new TournamentDomainError('INVALID_PRESET', 'CUSTOM_DSL is disabled');
        const strategy = this.strategies.get(this.key(formatCode, strategyVersion));
        if (strategy === undefined)
            throw new TournamentDomainError('INVALID_PRESET', 'Strategy version is not allowlisted');
        return strategy;
    }

    private key(formatCode: BuiltInFormatCode, version: string): string {
        return `${formatCode}@${version}`;
    }
}
