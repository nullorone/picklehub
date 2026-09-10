import { Injectable } from '@nestjs/common';

import { PrismaService } from '../common/database/prisma.service';

export abstract class VenueMatchPort {
    abstract canAttachCandidate(matchId: string, userId: string): Promise<boolean>;
}

@Injectable()
export class PersistedVenueMatchAdapter extends VenueMatchPort {
    constructor(private readonly prisma: PrismaService) {
        super();
    }

    async canAttachCandidate(matchId: string, userId: string): Promise<boolean> {
        return (
            (await this.prisma.match.count({
                where: { id: matchId, organizerId: userId, state: 'DRAFT', venueId: null, venueCandidateId: null },
            })) === 1
        );
    }
}
