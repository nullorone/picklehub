import { HttpException } from '@nestjs/common';

export class ContentException extends HttpException {
    constructor(
        readonly code: string,
        status: number
    ) {
        const messages: Record<string, string> = {
            ARTICLE_NOT_AVAILABLE: 'Материал недоступен.',
            CHECKLIST_REQUIRED: 'Подтвердите редакционный чек-лист.',
            CONTENT_ACTION_FORBIDDEN: 'Действие с материалом недоступно.',
            CONTENT_FORMAT_REJECTED: 'Формат материала не прошёл безопасную проверку.',
            CONTENT_RESOURCE_NOT_FOUND: 'Материал не найден.',
            CONTENT_SEARCH_UNAVAILABLE: 'Поиск временно недоступен.',
            IDEMPOTENCY_KEY_REUSED: 'Ключ повторного запроса уже использован.',
            INVALID_CURSOR: 'Указан недействительный курсор.',
            INVALID_STATE_TRANSITION: 'Переход в это состояние недоступен.',
            ORIGIN_REQUIRED: 'Для производного материала обязателен источник.',
            REAUTHENTICATION_REQUIRED: 'Требуется повторное подтверждение личности.',
            REVISION_CONFLICT: 'Материал уже изменился. Обновите страницу.',
            RIGHTS_HOLD: 'Права на материал не подтверждены.',
            SLUG_CONFLICT: 'Этот адрес материала уже занят.',
            VALIDATION_FAILED: 'Проверьте заполнение полей.',
        };
        super({ code, message: messages[code] ?? 'Запрос не может быть выполнен.' }, status);
    }
}

export function contentError(code: string, status: number): ContentException {
    return new ContentException(code, status);
}
