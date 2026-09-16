import * as Crypto from 'expo-crypto';

function base64Url(bytes: Uint8Array): string {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    let result = '';
    for (let index = 0; index < bytes.length; index += 3) {
        const a = bytes[index] ?? 0;
        const b = bytes[index + 1] ?? 0;
        const c = bytes[index + 2] ?? 0;
        const value = (a << 16) | (b << 8) | c;
        result += alphabet[(value >>> 18) & 63] ?? '';
        result += alphabet[(value >>> 12) & 63] ?? '';
        if (index + 1 < bytes.length) result += alphabet[(value >>> 6) & 63] ?? '';
        if (index + 2 < bytes.length) result += alphabet[value & 63] ?? '';
    }
    return result;
}

export async function createNativeLoginProof(): Promise<{ readonly challenge: string; readonly verifier: string }> {
    const verifier = base64Url(await Crypto.getRandomBytesAsync(32));
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
        encoding: Crypto.CryptoEncoding.BASE64,
    });
    return { challenge: digest.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, ''), verifier };
}
