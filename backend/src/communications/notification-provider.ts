import { Inject, Injectable, Optional } from '@nestjs/common';

import { ENVIRONMENT } from '../common/config/config.module';
import type { Environment } from '../common/config/environment';
import { IdentityCryptoService } from '../identity/identity-crypto.service';
import { CircuitBreaker } from '../common/resilience/circuit-breaker';
import { OperationalMetricsService } from '../operations/operational-metrics.service';

export interface ProviderNotification {
    readonly recipient: Uint8Array;
    readonly notificationType: string;
    readonly locale: string;
    readonly idempotencyKey: string;
}

export interface ProviderResult {
    readonly providerCode: string;
    readonly providerMessageKey?: string;
}

export interface PushProviderNotification {
    readonly recipient: Uint8Array;
    readonly payload: {
        readonly schemaVersion: 1;
        readonly notificationId: string;
        readonly action: 'OPEN_NOTIFICATION';
    };
    readonly environment: 'SANDBOX' | 'PRODUCTION';
    readonly idempotencyKey: string;
}

export interface PushProviderResult extends ProviderResult {
    readonly invalidToken?: boolean;
}

export abstract class TelegramNotificationProvider {
    abstract readonly enabled: boolean;
    abstract send(message: ProviderNotification): Promise<ProviderResult>;
}

export abstract class EmailNotificationProvider {
    abstract readonly enabled: boolean;
    abstract send(message: ProviderNotification): Promise<ProviderResult>;
}

export abstract class PushNotificationProvider {
    abstract readonly enabled: boolean;
    abstract send(message: PushProviderNotification): Promise<PushProviderResult>;
}

@Injectable()
export class DisabledPushNotificationProvider extends PushNotificationProvider {
    readonly enabled = false;

    send(_message: PushProviderNotification): Promise<PushProviderResult> {
        void _message;
        return Promise.reject(new Error('PROVIDER_DISABLED'));
    }
}

function template(type: string, locale: string): string {
    const russian = locale.toLowerCase().startsWith('ru');
    const messages: Record<string, [string, string]> = {
        MATCH_CANCELLED: [
            'Матч отменён. Откройте PickleHub, чтобы узнать подробности.',
            'Match cancelled. Open PickleHub for details.',
        ],
        MATCH_CHANGED: ['Параметры матча изменились. Проверьте PickleHub.', 'Match details changed. Check PickleHub.'],
        MATCH_REMINDER: [
            'Скоро матч. Проверьте актуальные детали в PickleHub.',
            'Your match starts soon. Check PickleHub.',
        ],
        RESULT_ACTION_REQUIRED: [
            'Результат матча ожидает вашего действия в PickleHub.',
            'A match result needs your action in PickleHub.',
        ],
        RESULT_CONFIRMED: ['Результат матча подтверждён.', 'The match result was confirmed.'],
        RESULT_DISPUTED: ['По результату матча открыт спор.', 'The match result is disputed.'],
        CHAT_MESSAGE: ['В чате матча новое сообщение.', 'There is a new match chat message.'],
    };
    const pair = messages[type] ?? ['Есть обновление матча в PickleHub.', 'There is a match update in PickleHub.'];
    return pair[russian ? 0 : 1];
}

@Injectable()
export class ConfiguredTelegramNotificationProvider extends TelegramNotificationProvider {
    readonly enabled: boolean;
    private readonly breaker: CircuitBreaker;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly crypto: IdentityCryptoService,
        @Optional() metrics?: OperationalMetricsService
    ) {
        super();
        this.enabled =
            environment.NOTIFICATION_TELEGRAM_ENABLED === 'true' &&
            environment.EMERGENCY_DISABLE_OUTBOUND_NOTIFICATIONS !== 'true';
        this.breaker = new CircuitBreaker({
            failureThreshold: environment.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            resetAfterMs: environment.CIRCUIT_BREAKER_RESET_MS,
            onResult: (outcome, state) => metrics?.observeProvider('telegram_notification', outcome, state),
        });
    }

    async send(message: ProviderNotification): Promise<ProviderResult> {
        if (!this.enabled) throw new Error('PROVIDER_DISABLED');
        return this.breaker.execute(async () => {
            const response = await fetch(
                `https://api.telegram.org/bot${this.environment.TELEGRAM_BOT_TOKEN}/sendMessage`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': message.idempotencyKey },
                    body: JSON.stringify({
                        chat_id: this.crypto.decrypt(message.recipient),
                        text: template(message.notificationType, message.locale),
                        disable_web_page_preview: true,
                    }),
                    signal: AbortSignal.timeout(this.environment.COMMUNICATION_PROVIDER_TIMEOUT_MS),
                }
            );
            if (!response.ok) throw new Error(`TELEGRAM_${String(response.status)}`);
            const result = (await response.json()) as { result?: { message_id?: unknown } };
            const providerId = result.result?.message_id;
            return {
                providerCode: 'telegram',
                ...(typeof providerId === 'number'
                    ? { providerMessageKey: this.crypto.hash(`telegram:${String(providerId)}`) }
                    : {}),
            };
        });
    }
}

@Injectable()
export class ConfiguredEmailNotificationProvider extends EmailNotificationProvider {
    readonly enabled: boolean;
    private readonly breaker: CircuitBreaker;

    constructor(
        @Inject(ENVIRONMENT) private readonly environment: Environment,
        private readonly crypto: IdentityCryptoService,
        @Optional() metrics?: OperationalMetricsService
    ) {
        super();
        this.enabled =
            environment.NOTIFICATION_EMAIL_ENABLED === 'true' &&
            environment.EMERGENCY_DISABLE_OUTBOUND_NOTIFICATIONS !== 'true';
        this.breaker = new CircuitBreaker({
            failureThreshold: environment.CIRCUIT_BREAKER_FAILURE_THRESHOLD,
            resetAfterMs: environment.CIRCUIT_BREAKER_RESET_MS,
            onResult: (outcome, state) => metrics?.observeProvider('email_notification', outcome, state),
        });
    }

    async send(message: ProviderNotification): Promise<ProviderResult> {
        const endpoint = this.environment.NOTIFICATION_EMAIL_PROVIDER_ENDPOINT;
        const token = this.environment.NOTIFICATION_EMAIL_PROVIDER_TOKEN;
        if (!this.enabled || endpoint === undefined || token === undefined) throw new Error('PROVIDER_DISABLED');
        return this.breaker.execute(async () => {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'X-Idempotency-Key': message.idempotencyKey,
                },
                body: JSON.stringify({
                    to: this.crypto.decrypt(message.recipient),
                    template: 'picklehub-notification-v1',
                    locale: message.locale,
                    variables: { text: template(message.notificationType, message.locale) },
                    disableClickTracking: true,
                    disableOpenTracking: true,
                    disableUrlRewriting: true,
                }),
                signal: AbortSignal.timeout(this.environment.COMMUNICATION_PROVIDER_TIMEOUT_MS),
            });
            if (!response.ok) throw new Error(`EMAIL_${String(response.status)}`);
            const key = response.headers.get('x-provider-message-id');
            return {
                providerCode: 'email',
                ...(key === null ? {} : { providerMessageKey: this.crypto.hash(`email:${key}`) }),
            };
        });
    }
}
