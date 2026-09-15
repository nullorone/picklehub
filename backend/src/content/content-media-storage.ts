import { Inject, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { contentError } from './content.errors';

const MEDIA_TYPES = new Set(['image/avif', 'image/jpeg', 'image/png', 'image/webp']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const POLICY_VERSION = /^[1-9][0-9]*\.[0-9]+\.[0-9]+$/u;

export interface VerifiedContentMedia {
    bytes: Uint8Array;
    mediaType: string;
    width: number;
    height: number;
    altText: string;
    rightsPolicyVersion: string;
    rightsEvidenceId: string;
}

export abstract class ContentMediaStoragePort {
    abstract putImmutable(objectKey: string, bytes: Uint8Array, mediaType: string): Promise<void>;
    abstract purge(objectKey: string): Promise<void>;
}

@Injectable()
export class DisabledContentMediaStorage extends ContentMediaStoragePort {
    putImmutable(): Promise<void> {
        return Promise.reject(contentError('RIGHTS_HOLD', 409));
    }

    async purge(): Promise<void> {
        return Promise.resolve();
    }
}

@Injectable()
export class ContentMediaService {
    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly storage: ContentMediaStoragePort
    ) {}

    async store(articleId: string, mediaId: string, input: VerifiedContentMedia): Promise<object> {
        if (
            this.environment.CONTENT_MEDIA_BASE_URL === undefined ||
            !UUID.test(articleId) ||
            !UUID.test(mediaId) ||
            !MEDIA_TYPES.has(input.mediaType) ||
            input.bytes.byteLength < 1 ||
            input.bytes.byteLength > 10 * 1024 * 1024 ||
            input.width < 1 ||
            input.height < 1 ||
            input.width * input.height > 40_000_000 ||
            input.altText.trim().length < 1 ||
            input.altText.length > 500 ||
            !POLICY_VERSION.test(input.rightsPolicyVersion) ||
            !UUID.test(input.rightsEvidenceId)
        )
            throw contentError('CONTENT_FORMAT_REJECTED', 422);
        const extension = input.mediaType === 'image/jpeg' ? 'jpg' : input.mediaType.slice('image/'.length);
        const objectKey = `content/${articleId}/${mediaId}/original.${extension}`;
        await this.storage.putImmutable(objectKey, input.bytes, input.mediaType);
        return {
            objectKey,
            url: `${this.environment.CONTENT_MEDIA_BASE_URL.replace(/\/$/u, '')}/${objectKey}`,
            sha256: createHash('sha256').update(input.bytes).digest('hex'),
            byteLength: input.bytes.byteLength,
        };
    }
}
