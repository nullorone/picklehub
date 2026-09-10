import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { venueError } from './venue.errors';
import { coordinateHasAllowedPrecision } from './venue-normalization';
import { GeocoderPort, type GeocodingResult, type StoredGeocodingSelection } from './venue-provider';

interface ProviderItem {
    id?: unknown;
    label?: unknown;
    name?: unknown;
    normalizedAddress?: unknown;
    locality?: unknown;
    timeZone?: unknown;
    longitude?: unknown;
    latitude?: unknown;
}

@Injectable()
export class ConfiguredGeocoderAdapter extends GeocoderPort {
    private readonly selections = new Map<string, { expiresAt: number; value: StoredGeocodingSelection }>();

    constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {
        super();
    }

    async suggest(query: string, limit: number): Promise<GeocodingResult[]> {
        const now = Date.now();
        for (const [key, selection] of this.selections) {
            if (selection.expiresAt <= now) this.selections.delete(key);
        }
        const endpoint = this.environment.VENUE_GEOCODER_ENDPOINT;
        if (endpoint === undefined) throw venueError('GEOCODER_TEMPORARILY_UNAVAILABLE', 503);
        try {
            const url = new URL(endpoint);
            url.searchParams.set('q', query);
            url.searchParams.set('limit', String(limit));
            const response = await fetch(url, {
                headers: this.environment.VENUE_GEOCODER_TOKEN
                    ? { Authorization: `Bearer ${this.environment.VENUE_GEOCODER_TOKEN}` }
                    : {},
                signal: AbortSignal.timeout(this.environment.DEPENDENCY_TIMEOUT_MS),
            });
            if (!response.ok) throw new Error('provider rejected request');
            const payload = (await response.json()) as { items?: ProviderItem[] };
            return (payload.items ?? []).slice(0, limit).flatMap((item) => this.mapItem(item));
        } catch {
            throw venueError('GEOCODER_TEMPORARILY_UNAVAILABLE', 503);
        }
    }

    resolve(id: string): Promise<StoredGeocodingSelection> {
        const selection = this.selections.get(id);
        this.selections.delete(id);
        if (selection === undefined || selection.expiresAt <= Date.now()) {
            throw venueError('VALIDATION_FAILED', 400);
        }
        if (!selection.value.provenance.storageAllowed) {
            throw venueError('REQUEST_NOT_ALLOWED', 403);
        }
        return Promise.resolve(selection.value);
    }

    private mapItem(item: ProviderItem): GeocodingResult[] {
        if (
            typeof item.id !== 'string' ||
            typeof item.label !== 'string' ||
            typeof item.name !== 'string' ||
            typeof item.normalizedAddress !== 'string' ||
            typeof item.locality !== 'string' ||
            typeof item.timeZone !== 'string' ||
            typeof item.longitude !== 'number' ||
            typeof item.latitude !== 'number'
        ) {
            return [];
        }
        if (
            !coordinateHasAllowedPrecision(item.longitude) ||
            !coordinateHasAllowedPrecision(item.latitude) ||
            item.longitude < -180 ||
            item.longitude > 180 ||
            item.latitude < -90 ||
            item.latitude > 90
        ) {
            return [];
        }
        const token = randomBytes(24).toString('base64url');
        const provenance = {
            providerKey: 'configured-geocoder',
            externalSourceId: item.id,
            observedAt: new Date(),
            license: this.environment.VENUE_GEOCODER_LICENSE ?? 'TRANSIENT_ONLY',
            policyVersion: this.environment.VENUE_PROVIDER_POLICY_VERSION ?? 'unapproved',
            storageAllowed: this.environment.VENUE_GEOCODER_STORAGE_ALLOWED === 'true',
            allowedFields:
                this.environment.VENUE_GEOCODER_STORAGE_ALLOWED === 'true'
                    ? ['name', 'normalizedAddress', 'locality', 'timeZone', 'longitude', 'latitude']
                    : [],
            attributionText: this.environment.VENUE_GEOCODER_ATTRIBUTION_TEXT ?? 'Внешний геокодер',
            ...(this.environment.VENUE_GEOCODER_ATTRIBUTION_LINK === undefined
                ? {}
                : { attributionLink: this.environment.VENUE_GEOCODER_ATTRIBUTION_LINK }),
        };
        this.selections.set(token, {
            expiresAt: Date.now() + 600_000,
            value: {
                name: item.name,
                normalizedAddress: item.normalizedAddress,
                locality: item.locality,
                timeZone: item.timeZone,
                longitude: item.longitude,
                latitude: item.latitude,
                provenance,
            },
        });
        return [
            { id: token, label: item.label, longitude: item.longitude, latitude: item.latitude, storage: provenance },
        ];
    }
}
