export abstract class VenueMatchPort {
    abstract canAttachCandidate(matchId: string, userId: string): Promise<boolean>;
}

export class MatchModuleUnavailableAdapter extends VenueMatchPort {
    canAttachCandidate(matchId: string, userId: string): Promise<boolean> {
        void matchId;
        void userId;
        return Promise.resolve(false);
    }
}
