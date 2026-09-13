import { HttpException } from '@nestjs/common';

export class GamificationException extends HttpException {
    constructor(
        readonly code: string,
        status: number
    ) {
        const messages: Record<string, string> = {
            GAMIFICATION_ACTION_FORBIDDEN: 'Действие с прогрессом недоступно.',
            GAMIFICATION_SCOPE_NOT_FOUND: 'Раздел прогресса не найден.',
            IDEMPOTENCY_KEY_REUSED: 'Ключ повторного запроса уже использован.',
            INVALID_CURSOR: 'Указан недействительный курсор.',
            ONBOARDING_REQUIRED: 'Завершите первичную настройку.',
            REVISION_CONFLICT: 'Данные уже изменились. Обновите страницу.',
            SEASON_CLOSED: 'Сезон уже закрыт.',
            SEASON_NOT_FOUND: 'Сезон не найден.',
            SESSION_INVALID: 'Сессия недействительна.',
            VALIDATION_FAILED: 'Проверьте заполнение полей.',
        };
        super({ code, message: messages[code] ?? 'Запрос не может быть выполнен.' }, status);
    }
}

export function gamificationError(code: string, status: number): GamificationException {
    return new GamificationException(code, status);
}
