import { HttpException } from '@nestjs/common';

export class MatchException extends HttpException {
    constructor(
        readonly code: string,
        message: string,
        status: number
    ) {
        super({ code, message }, status);
    }
}

export function matchError(code: string, status: number): MatchException {
    const messages: Record<string, string> = {
        ALREADY_INVOLVED: 'Вы уже участвуете в этом матче.',
        IDEMPOTENCY_KEY_REUSED: 'Ключ повторного запроса уже использован.',
        INVALID_CURSOR: 'Курсор недействителен или истёк.',
        INVITE_INVALID: 'Пригласительная ссылка недействительна.',
        JOIN_REQUEST_NOT_PENDING: 'Заявка уже обработана.',
        LEVEL_NOT_ELIGIBLE: 'Уровень не подходит для этого матча.',
        MATCH_CAPACITY_REACHED: 'В команде нет свободных мест.',
        MATCH_NOT_FOUND: 'Матч не найден.',
        MATCH_NOT_JOINABLE: 'К матчу сейчас нельзя присоединиться.',
        MATCH_TRANSITION_NOT_ALLOWED: 'Переход матча недоступен.',
        MATCH_VERSION_CONFLICT: 'Матч был изменён. Обновите данные.',
        OFFER_EXPIRED: 'Предложение истекло.',
        ONBOARDING_REQUIRED: 'Завершите первичную настройку.',
        REQUEST_NOT_ALLOWED: 'Запрос не разрешён.',
        RESULT_CONFIRMATION_FORBIDDEN: 'Этот игрок не может подтвердить результат.',
        RESULT_VERSION_CONFLICT: 'Версия результа устарела.',
        TEAM_NOT_AVAILABLE: 'Выбранная команда недоступна.',
        VALIDATION_FAILED: 'Проверьте заполнение полей.',
        WAITLIST_ORDER_CONFLICT: 'Очередь уже изменилась.',
    };
    return new MatchException(code, messages[code] ?? 'Запрос не может быть выполнен.', status);
}
