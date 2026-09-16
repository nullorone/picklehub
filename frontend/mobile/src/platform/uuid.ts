import * as Crypto from 'expo-crypto';

export function uuidV4(): string {
    return Crypto.randomUUID();
}
