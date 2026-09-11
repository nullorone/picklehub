import { HttpException } from '@nestjs/common';

export class ProfileException extends HttpException {
    constructor(
        readonly code: string,
        message: string,
        status: number
    ) {
        super({ code, message }, status);
    }
}

export function profileError(code: string, status: number): ProfileException {
    const messages: Record<string, string> = {
        AVATAR_UPLOAD_NOT_ALLOWED: 'Загрузка аватара сейчас недоступна.',
        CONSENT_REQUIRED: 'Примите обязательные документы.',
        CURSOR_EXPIRED: 'Срок действия страницы истёк.',
        DUPR_LINK_NOT_ALLOWED: 'Ссылка DUPR не разрешена политикой сервиса.',
        IDEMPOTENCY_KEY_REUSED: 'Ключ повторного запроса уже использован.',
        INVALID_CURSOR: 'Указан недействительный курсор.',
        ONBOARDING_REQUIRED: 'Завершите первичную настройку.',
        PROFILE_NOT_AVAILABLE: 'Профиль недоступен.',
        PROFILE_VERSION_CONFLICT: 'Профиль уже изменён. Обновите данные.',
        VALIDATION_FAILED: 'Проверьте заполнение полей.',
    };
    return new ProfileException(code, messages[code] ?? 'Запрос не может быть выполнен.', status);
}
