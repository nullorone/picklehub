import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { VenueReportReason } from '@prisma/client';

import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { PrismaService } from '../../src/common/database/prisma.service';
import { uuidV7 } from '../../src/common/identifiers/uuid-v7';
import type { AuthenticatedIdentity } from '../../src/identity/identity.service';
import { CreateVenueReportDto, VenueReportReasonDto } from '../../src/venues/venue.dto';
import { VenueImportService } from '../../src/venues/venue-import.service';
import { type ImportedVenue, VenueCatalogImportPort } from '../../src/venues/venue-provider';
import { VenueService } from '../../src/venues/venue.service';

class FakeImportProvider extends VenueCatalogImportPort {
    fail = false;
    readonly externalId = `node/${uuidV7()}`;
    readonly sourceVersion = uuidV7();

    fetch(scope: string): Promise<{ sourceVersion: string; items: ImportedVenue[] }> {
        void scope;
        if (this.fail) return Promise.reject(new Error('provider unavailable'));
        return Promise.resolve({
            sourceVersion: this.sourceVersion,
            items: [
                {
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
                        observedAt: new Date(),
                        license: 'ODbL-1.0',
                        policyVersion: 'test-v1',
                        storageAllowed: true,
                        allowedFields: ['name', 'normalizedAddress', 'locality', 'timeZone', 'longitude', 'latitude'],
                        attributionText: '© OpenStreetMap contributors',
                        attributionLink: 'https://www.openstreetmap.org/copyright',
                    },
                },
            ],
        });
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
