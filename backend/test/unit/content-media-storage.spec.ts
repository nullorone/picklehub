import type { Environment } from '../../src/common/config/environment';
import {
    ContentMediaService,
    ContentMediaStoragePort,
    DisabledContentMediaStorage,
    type VerifiedContentMedia,
} from '../../src/content/content-media-storage';

const ARTICLE_ID = '01800000-0000-7000-8000-000000000001';
const MEDIA_ID = '01800000-0000-7000-8000-000000000002';
const EVIDENCE_ID = '01800000-0000-7000-8000-000000000003';
const INPUT: VerifiedContentMedia = {
    bytes: new Uint8Array([1, 2, 3]),
    mediaType: 'image/webp',
    width: 1200,
    height: 800,
    altText: 'Игроки на площадке',
    rightsPolicyVersion: '1.0.0',
    rightsEvidenceId: EVIDENCE_ID,
};

class MemoryStorage extends ContentMediaStoragePort {
    stored: { key: string; bytes: Uint8Array; mediaType: string } | undefined;

    putImmutable(objectKey: string, bytes: Uint8Array, mediaType: string): Promise<void> {
        this.stored = { key: objectKey, bytes, mediaType };
        return Promise.resolve();
    }

    purge(): Promise<void> {
        return Promise.resolve();
    }
}

describe('content media storage boundary', () => {
    it('fails closed when no approved object storage is configured', async () => {
        const service = new ContentMediaService({} as Environment, new DisabledContentMediaStorage());
        await expect(service.store(ARTICLE_ID, MEDIA_ID, INPUT)).rejects.toMatchObject({
            code: 'CONTENT_FORMAT_REJECTED',
        });
    });

    it('uses only a server-generated immutable key for a verified object', async () => {
        const storage = new MemoryStorage();
        const service = new ContentMediaService(
            { CONTENT_MEDIA_BASE_URL: 'https://media.example.test' } as Environment,
            storage
        );
        await expect(service.store(ARTICLE_ID, MEDIA_ID, INPUT)).resolves.toMatchObject({
            objectKey: `content/${ARTICLE_ID}/${MEDIA_ID}/original.webp`,
            url: `https://media.example.test/content/${ARTICLE_ID}/${MEDIA_ID}/original.webp`,
            byteLength: 3,
        });
        expect(storage.stored?.key).toBe(`content/${ARTICLE_ID}/${MEDIA_ID}/original.webp`);
    });

    it('rejects unverified rights metadata and unsafe object identifiers before storage', async () => {
        const storage = new MemoryStorage();
        const service = new ContentMediaService(
            { CONTENT_MEDIA_BASE_URL: 'https://media.example.test' } as Environment,
            storage
        );
        await expect(
            service.store('../article', MEDIA_ID, { ...INPUT, rightsPolicyVersion: 'draft' })
        ).rejects.toMatchObject({ code: 'CONTENT_FORMAT_REJECTED' });
        expect(storage.stored).toBeUndefined();
    });
});
