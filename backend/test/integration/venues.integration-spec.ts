import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { VenueEnvironment, VenueReportReason, VenueVerificationState } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import type { AuthenticatedIdentity } from '../../src/identity/identity.service';
import { CreateVenueReportDto, VenueEnvironmentDto, VenueReportReasonDto } from '../../src/venues/venue.dto';
import { VenueImportService } from '../../src/venues/venue-import.service';
import { type ImportedVenue, VenueCatalogImportPort } from '../../src/venues/venue-provider';
import { VenueService } from '../../src/venues/venue.service';

class FakeImportProvider extends VenueCatalogImportPort {
    fail = false;
    readonly externalId = `node/${uuidV7()}`;
    sourceVersion = uuidV7();
    items: ImportedVenue[] = [this.item()];

    fetch(scope: string): Promise<{ sourceVersion: string; items: ImportedVenue[] }> {
        void scope;
        if (this.fail) return Promise.reject(new Error('provider unavailable'));
        return Promise.resolve({
            sourceVersion: this.sourceVersion,
            items: this.items,
        });
    }

    item(overrides: Partial<ImportedVenue> = {}): ImportedVenue {
        return {
            externalSourceId: this.externalId,
            externalSourceVersion: '1',
            name: '  Тестовый корт  ',
            normalizedAddress: 'Москва , Тестовая улица, 1',
            locality: 'Москва',
            timeZone: 'Europe/Moscow',
            longitude: 37.6173,
            latitude: 55.7558,
            explicitlyPrivate: false,
            ambiguous: false,
            provenance: {
                providerKey: 'openstreetmap',
                externalSourceId: this.externalId,
                externalSourceVersion: '1',
                observedAt: new Date(Date.now() - 1000),
                license: 'ODbL-1.0',
                policyVersion: 'test-v1',
                storageAllowed: true,
                allowedFields: ['name', 'normalizedAddress', 'locality', 'timeZone', 'longitude', 'latitude'],
                attributionText: '© OpenStreetMap contributors',
                attributionLink: 'https://www.openstreetmap.org/copyright',
            },
            ...overrides,
        };
    }
}

describe('venues backend', () => {
    let application: INestApplication;
    let prisma: PrismaService;
    let importer: VenueImportService;
    let venues: VenueService;
    let provider: FakeImportProvider;

    beforeAll(async () => {
        provider = new FakeImportProvider();
        const module = await Test.createTestingModule({ imports: [AppModule] })
            .overrideProvider(VenueCatalogImportPort)
            .useValue(provider)
            .compile();
        application = module.createNestApplication();
        configureApplication(application);
        await application.init();
        prisma = application.get(PrismaService);
        importer = application.get(VenueImportService);
        venues = application.get(VenueService);
    });

    afterAll(async () => {
        await application.close();
    });

    it('imports the same source version idempotently and exposes attribution in PostGIS search', async () => {
        const scope = JSON.stringify({
            south: 55.7,
            west: 37.5,
            north: 55.8,
            east: 37.7,
            locality: 'Москва',
            timeZone: 'Europe/Moscow',
        });
        const first = await importer.import(scope);
        const second = await importer.import(scope);
        expect(second).toEqual(first);
        expect(first).toMatchObject({ createdCount: 1, deduplicatedCount: 0, status: 'COMPLETED' });
        await expect(
            prisma.venueSource.count({ where: { providerKey: 'openstreetmap', externalSourceId: provider.externalId } })
        ).resolves.toBe(1);

        const page = (await venues.searchList({
            longitude: 37.6173,
            latitude: 55.7558,
            radiusMeters: 1000,
            limit: 20,
        })) as {
            items: { name: string; normalizedAddress: string; attribution: { text: string }[] }[];
        };
        const imported = page.items.find((item) => item.name === 'Тестовый корт');
        expect(imported?.normalizedAddress).toBe('Москва, Тестовая улица, 1');
        expect(imported?.attribution.some((item) => item.text === '© OpenStreetMap contributors')).toBe(true);
    });

    it('does not remove the catalogue after a provider failure', async () => {
        const before = await prisma.venue.count();
        provider.fail = true;
        await expect(importer.import('{"scope":"failure"}')).rejects.toThrow('provider unavailable');
        provider.fail = false;
        await expect(prisma.venue.count()).resolves.toBe(before);
    });

    it('does not overwrite immutable catalogue data when an upstream element changes or disappears', async () => {
        const source = await prisma.venueSource.findFirstOrThrow({
            where: { providerKey: 'openstreetmap', externalSourceId: provider.externalId },
            include: { venue: true },
        });
        const originalName = source.venue?.name;
        const before = await prisma.venue.count();
        provider.sourceVersion = uuidV7();
        provider.items = [provider.item({ name: 'Изменённое upstream название', externalSourceVersion: '2' })];

        await expect(importer.import('{"scope":"changed"}')).resolves.toMatchObject({
            createdCount: 0,
            deduplicatedCount: 1,
        });
        await expect(prisma.venue.findUniqueOrThrow({ where: { id: source.venueId ?? '' } })).resolves.toMatchObject({
            name: originalName,
        });

        provider.sourceVersion = uuidV7();
        provider.items = [];
        await expect(importer.import('{"scope":"removed"}')).resolves.toMatchObject({ scannedCount: 0 });
        await expect(prisma.venue.count()).resolves.toBe(before);
        provider.items = [provider.item()];
    });

    it('quarantines malformed geometry without damaging an existing catalogue', async () => {
        const before = await prisma.venue.count();
        provider.sourceVersion = uuidV7();
        provider.items = [
            provider.item({
                externalSourceId: `node/${uuidV7()}`,
                longitude: 181,
                provenance: {
                    ...provider.item().provenance,
                    externalSourceId: `node/${uuidV7()}`,
                },
            }),
        ];
        const malformed = provider.items[0];
        if (malformed !== undefined) malformed.provenance.externalSourceId = malformed.externalSourceId;

        await expect(importer.import('{"scope":"malformed"}')).resolves.toMatchObject({
            createdCount: 0,
            quarantinedCount: 1,
        });
        await expect(prisma.venue.count()).resolves.toBe(before);
        provider.items = [provider.item()];
    });

    it('qualifies a nearby candidate once without auto-merging or publishing it', async () => {
        const source = await prisma.venueSource.findFirstOrThrow({
            where: { providerKey: 'openstreetmap', externalSourceId: provider.externalId },
        });
        const userId = uuidV7();
        const matchId = uuidV7();
        const candidateId = uuidV7();
        await prisma.user.create({ data: { id: userId, completedAt: new Date() } });
        await prisma.venueCandidate.create({
            data: {
                id: candidateId,
                sourceMatchId: matchId,
                contributorId: userId,
                name: 'Соседний самостоятельный корт',
                normalizedAddress: 'Москва, Тестовая улица, 2',
                locality: 'Москва',
                timeZone: 'Europe/Moscow',
                longitude: 37.6174,
                latitude: 55.7559,
            },
        });

        const outcomes = await Promise.all([
            venues.qualifyFromConfirmedMatch(matchId, new Date(), uuidV7()),
            venues.qualifyFromConfirmedMatch(matchId, new Date(), uuidV7()),
        ]);
        expect(outcomes.filter(Boolean)).toHaveLength(1);
        await expect(prisma.venueCandidate.findUniqueOrThrow({ where: { id: candidateId } })).resolves.toMatchObject({
            state: 'PENDING_REVIEW',
            canonicalVenueId: null,
        });
        await expect(prisma.venue.count({ where: { id: candidateId } })).resolves.toBe(0);
        await expect(prisma.venue.count({ where: { id: source.venueId ?? '' } })).resolves.toBe(1);
    });

    it('keeps map and radius filters equivalent and paginates without duplicate rows', async () => {
        const ids: [string, string, string] = [uuidV7(), uuidV7(), uuidV7()];
        await prisma.venue.createMany({
            data: [
                {
                    id: ids[0],
                    name: 'Паритет А',
                    normalizedAddress: 'Красноярск, Проверочная, 1',
                    locality: 'Красноярск',
                    timeZone: 'Asia/Krasnoyarsk',
                    longitude: 92.87,
                    latitude: 56.01,
                    environment: VenueEnvironment.OUTDOOR,
                    verificationState: VenueVerificationState.MODERATOR_VERIFIED,
                    lastVerifiedAt: new Date(),
                },
                {
                    id: ids[1],
                    name: 'Паритет Б',
                    normalizedAddress: 'Красноярск, Проверочная, 2',
                    locality: 'Красноярск',
                    timeZone: 'Asia/Krasnoyarsk',
                    longitude: 92.88,
                    latitude: 56.02,
                    environment: VenueEnvironment.OUTDOOR,
                    verificationState: VenueVerificationState.MODERATOR_VERIFIED,
                    lastVerifiedAt: new Date(),
                },
                {
                    id: ids[2],
                    name: 'Скрыто фильтром',
                    normalizedAddress: 'Красноярск, Проверочная, 3',
                    locality: 'Красноярск',
                    timeZone: 'Asia/Krasnoyarsk',
                    longitude: 92.89,
                    latitude: 56.03,
                    environment: VenueEnvironment.INDOOR,
                    verificationState: VenueVerificationState.MODERATOR_VERIFIED,
                    lastVerifiedAt: new Date(),
                },
            ],
        });

        const first = (await venues.searchList({
            longitude: 92.875,
            latitude: 56.015,
            radiusMeters: 10_000,
            environment: VenueEnvironmentDto.OUTDOOR,
            limit: 1,
        })) as { items: { id: string }[]; pageInfo: { nextCursor: string | null } };
        if (first.pageInfo.nextCursor === null) throw new Error('Expected a second page');
        const second = (await venues.searchList({
            longitude: 92.875,
            latitude: 56.015,
            radiusMeters: 10_000,
            environment: VenueEnvironmentDto.OUTDOOR,
            limit: 1,
            cursor: first.pageInfo.nextCursor,
        })) as { items: { id: string }[] };
        const map = (await venues.searchMap({
            west: 92.8,
            south: 55.95,
            east: 92.95,
            north: 56.08,
            environment: VenueEnvironmentDto.OUTDOOR,
            limit: 20,
        })) as { items: { id: string }[] };
        const radiusIds = [...first.items, ...second.items].map((item) => item.id);
        expect(new Set(radiusIds).size).toBe(2);
        expect(new Set(radiusIds)).toEqual(new Set(ids.slice(0, 2)));
        expect(new Set(map.items.map((item) => item.id))).toEqual(new Set(ids.slice(0, 2)));
    });

    it('rejects an antimeridian-crossing map box for the target-region contract', async () => {
        await expect(
            venues.searchMap({ west: 179, south: 50, east: -179, north: 51, limit: 20 })
        ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    });

    it('hides a published venue atomically when a private-residence report is committed', async () => {
        const source = await prisma.venueSource.findFirstOrThrow({
            where: { providerKey: 'openstreetmap', externalSourceId: provider.externalId },
        });
        if (source.venueId === null) throw new Error('Imported source has no venue');
        const venueId = source.venueId;
        const userId = uuidV7();
        const now = new Date();
        await prisma.user.create({ data: { id: userId, completedAt: now } });
        const auth = { session: { userId, user: { completedAt: now } } } as unknown as AuthenticatedIdentity;
        const body = Object.assign(new CreateVenueReportDto(), { reason: VenueReportReasonDto.PRIVATE_RESIDENCE });
        await prisma.$transaction((transaction) => venues.report(auth, venueId, body, transaction));
        await expect(prisma.venue.findUniqueOrThrow({ where: { id: venueId } })).resolves.toMatchObject({
            publicationState: 'PRIVACY_REVIEW',
        });
        await expect(
            prisma.venueReport.findFirstOrThrow({ where: { venueId, reporterId: userId } })
        ).resolves.toMatchObject({
            reason: VenueReportReason.PRIVATE_RESIDENCE,
        });
        await expect(venues.detail(venueId)).rejects.toMatchObject({ code: 'VENUE_NOT_FOUND' });
    });
});
