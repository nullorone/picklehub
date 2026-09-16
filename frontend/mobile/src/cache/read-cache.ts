import AsyncStorage from '@react-native-async-storage/async-storage';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { utf8ToBytes } from '@noble/ciphers/utils.js';
import * as Crypto from 'expo-crypto';

import type { SecureSessionStore } from '../security/secure-session';

export type CacheSensitivity = 'PUBLIC_READ' | 'USER_READ' | 'CHAT_READ';
export type ResourceKind = 'VENUES' | 'MATCHES' | 'MATCH' | 'NOTIFICATIONS' | 'PROFILE' | 'STATISTICS' | 'CHAT';

export interface CacheEnvelope<T> {
    readonly expiresAt: string;
    readonly fetchedAt: string;
    readonly resourceKind: ResourceKind;
    readonly resourceVersion: number;
    readonly schemaVersion: 1;
    readonly sensitivity: CacheSensitivity;
    readonly userPartition: string;
    readonly value: T;
}

const ttlMilliseconds: Readonly<Record<CacheSensitivity, number>> = {
    CHAT_READ: 30 * 60 * 1000,
    PUBLIC_READ: 24 * 60 * 60 * 1000,
    USER_READ: 60 * 60 * 1000,
};

function fromHex(value: string): Uint8Array {
    if (value.length % 2 !== 0) throw new Error('Invalid encrypted cache value.');
    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    return bytes;
}

function toHex(value: Uint8Array): string {
    return [...value].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function keyFor(partition: string, resourceKind: ResourceKind, resourceId: string): string {
    return `picklehub.cache.v1:${partition}:${resourceKind}:${resourceId}`;
}

export function createReadCache(secureStore: SecureSessionStore) {
    async function encryptionKey(): Promise<Uint8Array> {
        const current = await secureStore.getCacheKey();
        if (current !== null) return fromHex(current);
        const created = await Crypto.getRandomBytesAsync(32);
        await secureStore.setCacheKey(toHex(created));
        return created;
    }

    return {
        async clearPartition(partition: string): Promise<void> {
            const prefix = `picklehub.cache.v1:${partition}:`;
            const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix));
            if (keys.length > 0) await AsyncStorage.multiRemove(keys);
        },
        async get<T>(
            partition: string,
            resourceKind: ResourceKind,
            resourceId = 'index'
        ): Promise<CacheEnvelope<T> | null> {
            const stored = await AsyncStorage.getItem(keyFor(partition, resourceKind, resourceId));
            if (stored === null) return null;
            try {
                const [nonceHex, ciphertextHex] = stored.split('.');
                if (nonceHex === undefined || ciphertextHex === undefined) return null;
                const plaintext = xchacha20poly1305(await encryptionKey(), fromHex(nonceHex)).decrypt(
                    fromHex(ciphertextHex)
                );
                const envelope = JSON.parse(new TextDecoder().decode(plaintext)) as Partial<CacheEnvelope<unknown>>;
                if (envelope.schemaVersion !== 1 || envelope.userPartition !== partition) return null;
                return envelope as CacheEnvelope<T>;
            } catch {
                await AsyncStorage.removeItem(keyFor(partition, resourceKind, resourceId));
                return null;
            }
        },
        async set(
            partition: string,
            resourceKind: ResourceKind,
            sensitivity: CacheSensitivity,
            value: unknown,
            resourceId = 'index',
            resourceVersion = 1
        ): Promise<void> {
            const now = Date.now();
            const envelope: CacheEnvelope<unknown> = {
                expiresAt: new Date(now + ttlMilliseconds[sensitivity]).toISOString(),
                fetchedAt: new Date(now).toISOString(),
                resourceKind,
                resourceVersion,
                schemaVersion: 1,
                sensitivity,
                userPartition: partition,
                value,
            };
            const nonce = await Crypto.getRandomBytesAsync(24);
            const ciphertext = xchacha20poly1305(await encryptionKey(), nonce).encrypt(
                utf8ToBytes(JSON.stringify(envelope))
            );
            await AsyncStorage.setItem(
                keyFor(partition, resourceKind, resourceId),
                `${toHex(nonce)}.${toHex(ciphertext)}`
            );
        },
    } as const;
}

export type ReadCache = ReturnType<typeof createReadCache>;
