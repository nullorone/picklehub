import type { components } from '@picklehub/api-client';

type Destination = components['schemas']['MobileDeepLinkTarget'];

export type ResolvedLink =
    | { readonly kind: 'DESTINATION'; readonly destination: Destination }
    | { readonly kind: 'MAGIC_LINK'; readonly token: string }
    | { readonly kind: 'MATCH_INVITE'; readonly token: string }
    | { readonly kind: 'NOTIFICATION'; readonly notificationId: string }
    | { readonly kind: 'UNSUPPORTED' };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const secret = /^[A-Za-z0-9_-]{16,512}$/u;

export function resolveUniversalLink(rawUrl: string, canonicalHost: string, developmentScheme?: string): ResolvedLink {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        return { kind: 'UNSUPPORTED' };
    }
    const isCanonical = url.protocol === 'https:' && url.hostname === canonicalHost;
    const isDevelopment = developmentScheme !== undefined && url.protocol === `${developmentScheme}:`;
    if (!isCanonical && !isDevelopment) return { kind: 'UNSUPPORTED' };

    const segments = url.pathname.split('/').filter(Boolean);
    if (segments[0] === 'auth' && segments[1] === 'email') {
        const token = url.searchParams.get('token');
        return token !== null && secret.test(token) ? { kind: 'MAGIC_LINK', token } : { kind: 'UNSUPPORTED' };
    }
    if (segments[0] === 'match-invites' && segments.length === 2 && secret.test(segments[1] ?? '')) {
        return { kind: 'MATCH_INVITE', token: segments[1] ?? '' };
    }
    if (segments[0] === 'notifications' && segments.length === 2 && uuid.test(segments[1] ?? '')) {
        return { kind: 'NOTIFICATION', notificationId: segments[1] ?? '' };
    }
    if (segments.length === 1 && segments[0] === 'matches')
        return { kind: 'DESTINATION', destination: { kind: 'MATCHES' } };
    if (segments[0] === 'matches' && segments.length === 2 && uuid.test(segments[1] ?? '')) {
        return { kind: 'DESTINATION', destination: { kind: 'MATCH', matchId: segments[1] ?? '' } };
    }
    if (segments[0] === 'matches' && segments[2] === 'chat' && segments.length === 3 && uuid.test(segments[1] ?? '')) {
        return { kind: 'DESTINATION', destination: { kind: 'MATCH_CHAT', matchId: segments[1] ?? '' } };
    }
    if (segments.length === 1 && segments[0] === 'venues')
        return { kind: 'DESTINATION', destination: { kind: 'VENUES' } };
    if (segments[0] === 'venues' && segments.length === 2 && uuid.test(segments[1] ?? '')) {
        return { kind: 'DESTINATION', destination: { kind: 'VENUE', venueId: segments[1] ?? '' } };
    }
    if (segments.length === 1 && segments[0] === 'notifications') {
        return { kind: 'DESTINATION', destination: { kind: 'NOTIFICATIONS' } };
    }
    if (segments.length === 1 && segments[0] === 'profile')
        return { kind: 'DESTINATION', destination: { kind: 'PROFILE' } };
    if (segments[0] === 'players' && segments.length === 2 && uuid.test(segments[1] ?? '')) {
        return { kind: 'DESTINATION', destination: { kind: 'PLAYER', playerId: segments[1] ?? '' } };
    }
    if (segments.length === 1 && segments[0] === 'account')
        return { kind: 'DESTINATION', destination: { kind: 'ACCOUNT' } };
    if (segments.length === 1 && segments[0] === 'safety')
        return { kind: 'DESTINATION', destination: { kind: 'SAFETY' } };
    if (
        segments[0] === 'safety' &&
        segments[1] === 'reports' &&
        segments.length === 3 &&
        uuid.test(segments[2] ?? '')
    ) {
        return { kind: 'DESTINATION', destination: { kind: 'SAFETY_RECEIPT', receiptId: segments[2] ?? '' } };
    }
    return { kind: 'UNSUPPORTED' };
}

export function resolvePushPayload(value: unknown): ResolvedLink {
    if (typeof value !== 'object' || value === null) return { kind: 'UNSUPPORTED' };
    const payload = value as Record<string, unknown>;
    if (
        payload.schemaVersion !== 1 ||
        payload.action !== 'OPEN_NOTIFICATION' ||
        typeof payload.notificationId !== 'string' ||
        !uuid.test(payload.notificationId)
    ) {
        return { kind: 'UNSUPPORTED' };
    }
    return { kind: 'NOTIFICATION', notificationId: payload.notificationId };
}
