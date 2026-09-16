import { Inject, Injectable, Optional } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { CircuitBreaker } from '../common/resilience/circuit-breaker';
import { OperationalMetricsService } from '../operations/operational-metrics.service';
import { normalizeVenueAddress, normalizeVenueText } from './venue-normalization';
import { type ImportedVenue, VenueCatalogImportPort } from './venue-provider';

interface OverpassElement {
    type?: string;
    id?: number;
    lat?: number;
    lon?: number;
    center?: { lat?: number; lon?: number };
    timestamp?: string;
    version?: number;
    tags?: Record<string, string>;
}

interface ImportScope {
    south: number;
    west: number;
    north: number;
    east: number;
    locality: string;
    timeZone: string;
}

@Injectable()
export class OverpassAdapter extends VenueCatalogImportPort {
    private lastRequestAt = 0;
    private readonly breaker: CircuitBreaker;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        @Optional() metrics?: OperationalMetricsService
    ) {
        super();
        this.breaker = new CircuitBreaker({
            failureThreshold: environment.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            resetAfterMs: environment.CIRCUIT_BREAKER_RESET_MS,
            onResult: (outcome, state) => metrics?.observeProvider('overpass', outcome, state),
        });
    }

    async fetch(scopeInput: string): Promise<{ sourceVersion: string; items: ImportedVenue[] }> {
        const endpoint = this.environment.VENUE_OVERPASS_ENDPOINT;
        if (
            endpoint === undefined ||
            this.environment.VENUE_OVERPASS_STORAGE_ALLOWED !== 'true' ||
            this.environment.EMERGENCY_DISABLE_VENUE_PROVIDERS === 'true'
        ) {
            throw new Error('VENUE_IMPORT_PROVIDER_NOT_APPROVED');
        }
        const scope = this.parseScope(scopeInput);
        await this.throttle();
        const bounds = [scope.south, scope.west, scope.north, scope.east].map(String).join(',');
        const query = `[out:json][timeout:25];(nwr["sport"="pickleball"](${bounds});nwr["pickleball"](${bounds}););out center tags meta;`;
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const payload = await this.breaker.execute(async () => {
                    const response = await fetch(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'User-Agent': this.environment.VENUE_OVERPASS_USER_AGENT ?? '',
                        },
                        body: new URLSearchParams({ data: query }),
                        signal: AbortSignal.timeout(Math.max(this.environment.DEPENDENCY_TIMEOUT_MS, 5000)),
                    });
                    if (!response.ok) throw new Error(`OVERPASS_HTTP_${String(response.status)}`);
                    return (await response.json()) as {
                        osm3s?: { timestamp_osm_base?: string };
                        elements?: OverpassElement[];
                    };
                });
                const observedAt = new Date();
                const sourceVersion = payload.osm3s?.timestamp_osm_base ?? observedAt.toISOString();
                return {
                    sourceVersion,
                    items: (payload.elements ?? []).flatMap((element) =>
                        this.mapElement(element, scope, observedAt, sourceVersion)
                    ),
                };
            } catch (error) {
                lastError = error;
                if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
            }
        }
        throw new Error('VENUE_IMPORT_PROVIDER_UNAVAILABLE', { cause: lastError });
    }

    private parseScope(input: string): ImportScope {
        const value = JSON.parse(input) as Partial<ImportScope>;
        if (
            ![value.south, value.west, value.north, value.east].every((item) => typeof item === 'number') ||
            typeof value.locality !== 'string' ||
            typeof value.timeZone !== 'string' ||
            (value.south ?? 0) >= (value.north ?? 0) ||
            (value.west ?? 0) >= (value.east ?? 0)
        ) {
            throw new Error('VENUE_IMPORT_SCOPE_INVALID');
        }
        return value as ImportScope;
    }

    private mapElement(
        element: OverpassElement,
        scope: ImportScope,
        observedAt: Date,
        sourceVersion: string
    ): ImportedVenue[] {
        const longitude = element.lon ?? element.center?.lon;
        const latitude = element.lat ?? element.center?.lat;
        const tags = element.tags ?? {};
        const isPickleball = tags.sport?.split(';').includes('pickleball') === true || tags.pickleball === 'yes';
        if (element.id === undefined || longitude === undefined || latitude === undefined || !isPickleball) return [];
        const access = tags.access?.toLowerCase();
        const explicitlyPrivate =
            access === 'private' ||
            access === 'no' ||
            (tags['addr:housenumber'] !== undefined && tags.leisure === undefined);
        const name = normalizeVenueText(tags.name ?? tags['name:ru'] ?? 'Площадка для пиклбола');
        const address = normalizeVenueAddress(
            tags['addr:full'] ??
                ([tags['addr:street'], tags['addr:housenumber']].filter((value) => value !== undefined).join(', ') ||
                    scope.locality)
        );
        return [
            {
                externalSourceId: `${element.type ?? 'node'}/${String(element.id)}`,
                externalSourceVersion: element.version === undefined ? sourceVersion : String(element.version),
                name,
                normalizedAddress: address,
                locality: normalizeVenueText(tags['addr:city'] ?? scope.locality),
                timeZone: scope.timeZone,
                longitude,
                latitude,
                explicitlyPrivate,
                ambiguous: tags.leisure !== 'sports_centre' && tags.leisure !== 'pitch',
                provenance: {
                    providerKey: 'openstreetmap',
                    externalSourceId: `${element.type ?? 'node'}/${String(element.id)}`,
                    externalSourceVersion: element.version === undefined ? sourceVersion : String(element.version),
                    observedAt: element.timestamp === undefined ? observedAt : new Date(element.timestamp),
                    license: this.environment.VENUE_OVERPASS_LICENSE ?? '',
                    policyVersion: this.environment.VENUE_PROVIDER_POLICY_VERSION ?? '',
                    storageAllowed: true,
                    allowedFields: ['name', 'normalizedAddress', 'locality', 'timeZone', 'longitude', 'latitude'],
                    attributionText: this.environment.VENUE_OVERPASS_ATTRIBUTION_TEXT ?? '',
                    ...(this.environment.VENUE_OVERPASS_ATTRIBUTION_LINK === undefined
                        ? {}
                        : { attributionLink: this.environment.VENUE_OVERPASS_ATTRIBUTION_LINK }),
                },
            },
        ];
    }

    private async throttle(): Promise<void> {
        const delay = this.lastRequestAt + this.environment.VENUE_OVERPASS_MIN_INTERVAL_MS - Date.now();
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        this.lastRequestAt = Date.now();
    }
}
