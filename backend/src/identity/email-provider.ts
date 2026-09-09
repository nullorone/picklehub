import { Inject, Injectable } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';

export interface MagicEmail {
    address: string;
    link: string;
    purpose: 'LOGIN' | 'PROOF';
}

export abstract class EmailProvider {
    abstract sendMagicLink(message: MagicEmail): Promise<void>;
}

@Injectable()
export class ConfiguredEmailProvider extends EmailProvider {
    constructor(@Inject(ENVIRONMENT) private readonly environment: Environment) {
        super();
    }

    async sendMagicLink(message: MagicEmail): Promise<void> {
        if (
            this.environment.EMAIL_PROVIDER_ENDPOINT === undefined ||
            this.environment.EMAIL_PROVIDER_TOKEN === undefined
        ) {
            return;
        }
        const response = await fetch(this.environment.EMAIL_PROVIDER_ENDPOINT, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.environment.EMAIL_PROVIDER_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                to: message.address,
                magicLink: message.link,
                purpose: message.purpose,
                disableClickTracking: true,
                disableUrlRewriting: true,
            }),
            signal: AbortSignal.timeout(5000),
        });
        if (!response.ok) {
            throw new Error('EMAIL_DELIVERY_FAILED');
        }
    }
}
