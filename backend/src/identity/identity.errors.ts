import { HttpException } from '@nestjs/common';

export class IdentityException extends HttpException {
    constructor(
        readonly code: string,
        message: string,
        status: number,
        readonly details?: { code: string; field?: string; message: string }[]
    ) {
        super({ code, message, details }, status);
    }
}

export function identityError(code: string, status: number): IdentityException {
    const messages: Record<string, string> = {
        AUTH_TEMPORARILY_UNAVAILABLE: 'Сервис входа временно недоступен.',
        CONSENT_REQUIRED: 'Примите обязательные документы.',
        CONSENT_VERSION_CHANGED: 'Версия документа изменилась.',
        DOCUMENT_NOT_FOUND: 'Документ не найден.',
        DRAFT_VERSION_CONFLICT: 'Черновик был изменён. Обновите данные.',
        IDEMPOTENCY_KEY_REUSED: 'Ключ повторного запроса уже использован.',
        IDENTITY_LINK_FAILED: 'Не удалось изменить способ входа.',
        LAST_IDENTITY_REQUIRED: 'Нельзя удалить единственный способ входа.',
        MAGIC_LINK_INVALID: 'Ссылка недействительна или истекла.',
        ONBOARDING_REQUIRED: 'Завершите первичную настройку.',
        RATE_LIMITED: 'Слишком много запросов. Повторите попытку позже.',
        REQUEST_NOT_ALLOWED: 'Запрос не разрешён.',
        REAUTHENTICATION_REQUIRED: 'Подтвердите способ входа ещё раз.',
        SESSION_INVALID: 'Сессия недействительна.',
        TELEGRAM_AUTH_INVALID: 'Не удалось подтвердить данные Telegram.',
        VALIDATION_FAILED: 'Проверьте заполнение полей.',
    };
    return new IdentityException(code, messages[code] ?? 'Запрос не может быть выполнен.', status);
}
