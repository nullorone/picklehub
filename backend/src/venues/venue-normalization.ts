const SPACE = /\s+/gu;
const CONTROL = /[\p{Cc}\p{Cf}]/gu;

export function normalizeVenueText(value: string): string {
    return value.normalize('NFKC').replace(CONTROL, '').replace(SPACE, ' ').trim();
}

export function normalizeVenueAddress(value: string): string {
    return normalizeVenueText(value)
        .replace(/\s*,\s*/gu, ', ')
        .replace(/,+/gu, ',')
        .replace(/[.;]+$/u, '');
}

export function normalizeDedupeKey(name: string, address: string): string {
    return `${normalizeVenueText(name).toLocaleLowerCase('ru-RU')}|${normalizeVenueAddress(address).toLocaleLowerCase(
        'ru-RU'
    )}`;
}

export function coordinateHasAllowedPrecision(value: number): boolean {
    return Number.isFinite(value) && Math.abs(value * 1_000_000 - Math.round(value * 1_000_000)) < 1e-7;
}
