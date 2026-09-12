import { ClubMembershipPolicy, ClubState, VenuePublicationState } from '@prisma/client';

import { ClubService } from '../../src/clubs/club.service';
import type { PrismaService } from '../../src/common/database/prisma.service';

describe('club canonical venue projection', () => {
    it('deduplicates merged links onto the public survivor and hides retracted links', async () => {
        const linkedAt = new Date('2026-09-12T10:00:00.000Z');
        const findUnique = jest.fn().mockResolvedValue({
            id: '11111111-1111-4111-8111-111111111111',
            version: 3,
            state: ClubState.ACTIVE,
            name: 'Клуб',
            description: 'Описание',
            locality: 'Москва',
            membershipPolicy: ClubMembershipPolicy.OPEN,
            createdAt: linkedAt,
            updatedAt: linkedAt,
            memberships: [],
            venues: [
                {
                    clubId: 'club-id',
                    venueId: 'merged-id',
                    linkedAt,
                    venue: {
                        publicationState: VenuePublicationState.MERGED,
                        canonicalVenue: { id: 'survivor-id', publicationState: VenuePublicationState.PUBLISHED },
                    },
                },
                {
                    clubId: 'club-id',
                    venueId: 'survivor-id',
                    linkedAt,
                    venue: { publicationState: VenuePublicationState.PUBLISHED, canonicalVenue: null },
                },
                {
                    clubId: 'club-id',
                    venueId: 'hidden-id',
                    linkedAt,
                    venue: { publicationState: VenuePublicationState.CLOSED, canonicalVenue: null },
                },
            ],
        });
        const prisma = { club: { findUnique } } as unknown as PrismaService;
        const clubs = new ClubService(
            prisma,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never,
            undefined as never
        );

        await expect(clubs.detail('club-id')).resolves.toMatchObject({
            venues: [{ clubId: 'club-id', venueId: 'survivor-id', linkedAt: linkedAt.toISOString() }],
        });
    });
});
