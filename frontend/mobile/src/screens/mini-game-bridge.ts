export type SafeGameRoute = 'MATCH_CREATE' | 'MATCH_LIST' | 'PROFILE_SELF';

export interface GameBridgeEnvelope {
    readonly messageId: string;
    readonly payload: Readonly<Record<string, unknown>>;
    readonly type: 'READY_V1' | 'CLOSE_V1' | 'OPEN_SAFE_ROUTE_V1' | 'HEALTH_V1';
    readonly version: 1;
}

const messageIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const safeRoutes = new Set<SafeGameRoute>(['MATCH_CREATE', 'MATCH_LIST', 'PROFILE_SELF']);
const healthBuckets = new Set(['GOOD', 'DEGRADED', 'FAILED']);

export function isExpectedGameOrigin(url: string, expectedOrigin: string): boolean {
    try {
        return new URL(url).origin === expectedOrigin;
    } catch {
        return false;
    }
}

export function isAllowedGameNavigation(url: string, expectedOrigin: string): boolean {
    return url === 'about:blank' || isExpectedGameOrigin(url, expectedOrigin);
}

function exactKeys(value: object, expected: readonly string[]): boolean {
    const actual = Object.keys(value).sort();
    const sortedExpected = [...expected].sort();
    return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

export function parseBridgeMessage(raw: string): GameBridgeEnvelope | undefined {
    if (new TextEncoder().encode(raw).byteLength > 2048) return undefined;
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        return undefined;
    }
    if (typeof value !== 'object' || value === null || !exactKeys(value, ['messageId', 'payload', 'type', 'version'])) {
        return undefined;
    }
    const envelope = value as Partial<GameBridgeEnvelope>;
    if (
        envelope.version !== 1 ||
        typeof envelope.messageId !== 'string' ||
        !messageIdPattern.test(envelope.messageId) ||
        !['READY_V1', 'CLOSE_V1', 'OPEN_SAFE_ROUTE_V1', 'HEALTH_V1'].includes(envelope.type ?? '') ||
        typeof envelope.payload !== 'object'
    ) {
        return undefined;
    }
    const payload = envelope.payload;
    if ((envelope.type === 'READY_V1' || envelope.type === 'CLOSE_V1') && !exactKeys(payload, [])) return undefined;
    if (
        envelope.type === 'OPEN_SAFE_ROUTE_V1' &&
        (!exactKeys(payload, ['route']) ||
            typeof payload.route !== 'string' ||
            !safeRoutes.has(payload.route as SafeGameRoute))
    ) {
        return undefined;
    }
    if (
        envelope.type === 'HEALTH_V1' &&
        (!exactKeys(payload, ['bucket']) || typeof payload.bucket !== 'string' || !healthBuckets.has(payload.bucket))
    ) {
        return undefined;
    }
    return envelope as GameBridgeEnvelope;
}

export function acceptUniqueBridgeMessage(raw: string, seenMessages: Set<string>): GameBridgeEnvelope | undefined {
    const envelope = parseBridgeMessage(raw);
    if (!envelope || seenMessages.has(envelope.messageId)) return undefined;
    seenMessages.add(envelope.messageId);
    return envelope;
}
