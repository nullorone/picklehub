import { HttpException } from '@nestjs/common';

export class AdvertisingException extends HttpException {
    constructor(
        readonly code: string,
        status: number
    ) {
        const messages: Record<string, string> = {
            AD_POLICY_UNAVAILABLE: 'Рекламная политика временно недоступна.',
            AD_RESOURCE_NOT_FOUND: 'Рекламный ресурс не найден.',
            AD_WRITE_UNAVAILABLE: 'Изменение рекламы временно недоступно.',
            APPROVAL_REQUIRED: 'Кампания должна пройти независимую проверку.',
            BUDGET_CONFLICT: 'Бюджет кампании уже исчерпан или изменился.',
            CONFLICT_OF_INTEREST: 'Утверждение требует независимого проверяющего.',
            DELIVERY_TOKEN_EXPIRED: 'Срок действия рекламного токена истёк.',
            IDEMPOTENCY_KEY_REUSED: 'Ключ повторного запроса уже использован.',
            INVALID_STATE_TRANSITION: 'Переход кампании в это состояние недоступен.',
            INVALID_TIME_RANGE: 'Указан недействительный период.',
            LEGAL_EVIDENCE_REQUIRED: 'Для включения необходим полный комплект проверенных правовых материалов.',
            REVISION_CONFLICT: 'Рекламный ресурс уже изменился. Обновите страницу.',
            TARGETING_REJECTED: 'Параметры таргетинга не разрешены.',
            TOKEN_REPLAYED: 'Рекламный токен уже использован.',
            VALIDATION_FAILED: 'Проверьте заполнение полей.',
        };
        super({ code, message: messages[code] ?? 'Запрос не может быть выполнен.' }, status);
    }
}

export function advertisingError(code: string, status: number): AdvertisingException {
    return new AdvertisingException(code, status);
}
