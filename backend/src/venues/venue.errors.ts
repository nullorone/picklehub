import { HttpException } from '@nestjs/common';

export class VenueException extends HttpException {
    constructor(
        readonly code: string,
        message: string,
        status: number
    ) {
        super({ code, message }, status);
    }
}

export function venueError(code: string, status: number): VenueException {
    const messages: Record<string, string> = {
        GEOCODER_TEMPORARILY_UNAVAILABLE: 'Поиск адреса временно недоступен.',
        IDEMPOTENCY_KEY_REUSED: 'Ключ повторного запроса уже использован.',
        INVALID_CURSOR: 'Курсор недействителен или истёк.',
        MATCH_NOT_FOUND: 'Матч не найден.',
        ONBOARDING_REQUIRED: 'Завершите первичную настройку.',
        REQUEST_NOT_ALLOWED: 'Запрос не разрешён.',
        SEARCH_AREA_TOO_LARGE: 'Область поиска слишком велика.',
        SESSION_INVALID: 'Сессия недействительна.',
        VALIDATION_FAILED: 'Проверьте заполнение полей.',
        VENUE_ALREADY_REPORTED: 'Такая жалоба уже рассматривается.',
        VENUE_NOT_FOUND: 'Площадка не найдена.',
        VENUE_VERSION_CONFLICT: 'Площадка была изменена. Обновите данные.',
    };
    return new VenueException(code, messages[code] ?? 'Запрос не может быть выполнен.', status);
}
