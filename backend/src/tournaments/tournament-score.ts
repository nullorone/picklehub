import type { StrategyResult, StrategyScore } from './tournament.types';
import { tournamentInvariant } from './tournament.errors';

export type TournamentScoringProfile =
    | 'ONE_GAME_11_WIN_BY_2_CAP_15'
    | 'BEST_OF_3_11_WIN_BY_2_CAP_15'
    | 'TIMED_GOLDEN_POINT';

export function validateTournamentScore(
    profile: TournamentScoringProfile,
    scores: readonly StrategyScore[],
    winnerEntrantId: string,
    sideOneEntrantId: string,
    sideTwoEntrantId: string
): void {
    tournamentInvariant(
        winnerEntrantId === sideOneEntrantId || winnerEntrantId === sideTwoEntrantId,
        'INVALID_RESULT',
        'Winner must occupy a match slot'
    );
    const targetWins = profile === 'BEST_OF_3_11_WIN_BY_2_CAP_15' ? 2 : 1;
    tournamentInvariant(
        scores.length >= targetWins && scores.length <= targetWins * 2 - 1,
        'INVALID_RESULT',
        'Wrong game count'
    );
    let sideOneWins = 0;
    let sideTwoWins = 0;
    for (const [index, score] of scores.entries()) {
        tournamentInvariant(score.game === index + 1, 'INVALID_RESULT', 'Games must be consecutive');
        tournamentInvariant(
            score.sideOne >= 0 && score.sideTwo >= 0 && score.sideOne !== score.sideTwo,
            'INVALID_RESULT',
            'Draw is forbidden'
        );
        if (profile !== 'TIMED_GOLDEN_POINT') {
            const high = Math.max(score.sideOne, score.sideTwo);
            const low = Math.min(score.sideOne, score.sideTwo);
            tournamentInvariant(high >= 11 && high <= 15, 'INVALID_RESULT', 'Game must end from 11 to 15');
            tournamentInvariant(
                high === 15 ? low === 14 : high - low >= 2,
                'INVALID_RESULT',
                'Invalid win-by-two score'
            );
        }
        if (score.sideOne > score.sideTwo) sideOneWins += 1;
        else sideTwoWins += 1;
    }
    tournamentInvariant(Math.max(sideOneWins, sideTwoWins) === targetWins, 'INVALID_RESULT', 'Series is incomplete');
    const computed = sideOneWins > sideTwoWins ? sideOneEntrantId : sideTwoEntrantId;
    tournamentInvariant(computed === winnerEntrantId, 'INVALID_RESULT', 'Winner contradicts score');
}

export function latestResults(results: readonly StrategyResult[]): ReadonlyMap<string, StrategyResult> {
    const latest = new Map<string, StrategyResult>();
    for (const result of results) {
        const previous = latest.get(result.matchKey);
        if (previous === undefined || result.revision > previous.revision) latest.set(result.matchKey, result);
    }
    return latest;
}
