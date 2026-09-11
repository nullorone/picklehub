import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { profileError } from './profile.errors';

export interface AvatarUploadPolicyInput {
    objectKey: string;
    contentType: string;
    contentLength: number;
    sha256: string;
    expiresAt: Date;
}

export abstract class ProfileAvatarStorage {
    abstract createUploadPolicy(input: AvatarUploadPolicyInput): Promise<{ uploadUrl: string }>;
    abstract createReadUrl(objectKey: string): Promise<string>;
}

@Injectable()
export class ConfiguredProfileAvatarStorage extends ProfileAvatarStorage {
    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly crypto: IdentityCryptoService
    ) {
        super();
    }

    createUploadPolicy(input: AvatarUploadPolicyInput): Promise<{ uploadUrl: string }> {
        const base = this.environment.PROFILE_AVATAR_STORAGE_BASE_URL;
        if (base === undefined) throw profileError('AVATAR_UPLOAD_NOT_ALLOWED', 400);
        const signature = this.crypto.hash(
            `AVATAR_PUT:${input.objectKey}:${input.contentType}:${String(input.contentLength)}:${input.sha256}:${input.expiresAt.toISOString()}`
        );
        return Promise.resolve({
            uploadUrl: `${base}/${input.objectKey}?expires=${String(input.expiresAt.getTime())}&signature=${signature}`,
        });
    }

    createReadUrl(objectKey: string): Promise<string> {
        const base = this.environment.PROFILE_AVATAR_STORAGE_BASE_URL;
        if (base === undefined) throw profileError('AVATAR_UPLOAD_NOT_ALLOWED', 400);
        return Promise.resolve(`${base}/${objectKey}?signature=${this.crypto.hash(`AVATAR_GET:${objectKey}`)}`);
    }
}
