import * as SecureStore from 'expo-secure-store';

const refreshKey = 'picklehub.mobile.refresh.v1';
const verifierKey = 'picklehub.mobile.verifier.v1';
const cacheKey = 'picklehub.mobile.cache-key.v1';

const options: SecureStore.SecureStoreOptions = {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface SecureSessionStore {
    clear(): Promise<void>;
    getCacheKey(): Promise<string | null>;
    getRefreshToken(): Promise<string | null>;
    getVerifier(): Promise<string | null>;
    replaceRefreshToken(token: string): Promise<void>;
    setCacheKey(key: string): Promise<void>;
    setVerifier(verifier: string): Promise<void>;
}

export const secureSessionStore: SecureSessionStore = {
    async clear() {
        await Promise.all([
            SecureStore.deleteItemAsync(refreshKey, options),
            SecureStore.deleteItemAsync(verifierKey, options),
            SecureStore.deleteItemAsync(cacheKey, options),
        ]);
    },
    getCacheKey: () => SecureStore.getItemAsync(cacheKey, options),
    getRefreshToken: () => SecureStore.getItemAsync(refreshKey, options),
    getVerifier: () => SecureStore.getItemAsync(verifierKey, options),
    replaceRefreshToken: (token) => SecureStore.setItemAsync(refreshKey, token, options),
    setCacheKey: (key) => SecureStore.setItemAsync(cacheKey, key, options),
    setVerifier: (verifier) => SecureStore.setItemAsync(verifierKey, verifier, options),
};
