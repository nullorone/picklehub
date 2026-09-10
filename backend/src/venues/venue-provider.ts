export const STORED_VENUE_FIELDS = [
    'name',
    'normalizedAddress',
    'locality',
    'timeZone',
    'longitude',
    'latitude',
] as const;

export interface ProviderProvenance {
    providerKey: string;
    externalSourceId: string;
    externalSourceVersion?: string;
    observedAt: Date;
    license: string;
    policyVersion: string;
    storageAllowed: boolean;
    allowedFields: string[];
    attributionText: string;
    attributionLink?: string;
}

export interface GeocodingResult {
    id: string;
    label: string;
    longitude?: number;
    latitude?: number;
    storage: ProviderProvenance;
}

export interface StoredGeocodingSelection {
    name: string;
    normalizedAddress: string;
    locality: string;
    timeZone: string;
    longitude: number;
    latitude: number;
    provenance: ProviderProvenance;
}

export abstract class GeocoderPort {
    abstract suggest(query: string, limit: number): Promise<GeocodingResult[]>;
    abstract resolve(id: string): Promise<StoredGeocodingSelection>;
}

export interface ImportedVenue {
    externalSourceId: string;
    externalSourceVersion?: string;
    name: string;
    normalizedAddress: string;
    locality: string;
    timeZone: string;
    longitude: number;
    latitude: number;
    explicitlyPrivate: boolean;
    ambiguous: boolean;
    provenance: ProviderProvenance;
}

export abstract class VenueCatalogImportPort {
    abstract fetch(scope: string): Promise<{ sourceVersion: string; items: ImportedVenue[] }>;
}
