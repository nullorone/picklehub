import { randomBytes } from 'node:crypto';

export function uuidV7(now = Date.now()): string {
    const bytes = randomBytes(16);
    let timestamp = BigInt(now);

    for (let index = 5; index >= 0; index -= 1) {
        bytes[index] = Number(timestamp & 0xffn);
        timestamp >>= 8n;
    }

    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

    const hexadecimal = bytes.toString('hex');
    return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
}
