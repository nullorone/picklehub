import { createHash } from 'node:crypto';

export function materializeTieBreakLots(
    entrantIds: readonly string[],
    initializedRandomness: string
): Map<string, bigint> {
    const lots = new Map<string, bigint>();
    const used = new Set<bigint>();
    for (const entrantId of [...entrantIds].sort()) {
        let counter = 0;
        let lot: bigint;
        do {
            const digest = createHash('sha256')
                .update(`TOURNAMENT_LOT_V1:${initializedRandomness}:${entrantId}:${String(counter)}`)
                .digest('hex');
            lot = BigInt(`0x${digest.slice(0, 15)}`);
            counter += 1;
        } while (used.has(lot));
        used.add(lot);
        lots.set(entrantId, lot);
    }
    return lots;
}
