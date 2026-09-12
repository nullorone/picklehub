export class TournamentDomainError extends Error {
    constructor(
        readonly code:
            | 'INVALID_PRESET'
            | 'INVALID_ENTRANTS'
            | 'INVALID_RESULT'
            | 'PROJECTION_MISMATCH'
            | 'DEPENDENCY_STARTED'
            | 'TRANSITION_NOT_ALLOWED'
            | 'VERSION_CONFLICT'
            | 'RESOURCE_REVISION_CONFLICT'
            | 'IDEMPOTENCY_KEY_REUSED',
        message: string
    ) {
        super(message);
        this.name = 'TournamentDomainError';
    }
}

export function tournamentInvariant(
    condition: boolean,
    code: TournamentDomainError['code'],
    message: string
): asserts condition {
    if (!condition) throw new TournamentDomainError(code, message);
}
