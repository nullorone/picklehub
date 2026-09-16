import { HttpException } from '@nestjs/common';

const MESSAGES: Readonly<Record<string, string>> = {
    GAME_CHALLENGE_EXPIRED: 'Срок игровой сессии истёк.',
    GAME_CHALLENGE_INVALID: 'Игровая сессия недействительна.',
    GAME_RESULT_IMPOSSIBLE: 'Результат не прошёл проверку.',
    GAME_REWARDS_UNAVAILABLE: 'Награды временно недоступны. Можно продолжить тренировку без наград.',
    GAME_SEASON_NOT_FOUND: 'Активный игровой сезон не найден.',
    GAME_SESSION_TERMINAL: 'Результат этой игровой сессии уже обработан.',
    IDEMPOTENCY_KEY_REUSED: 'Ключ повторного запроса уже использован.',
    ONBOARDING_REQUIRED: 'Сначала завершите настройку профиля.',
    RATE_LIMITED: 'Слишком много игровых запросов. Попробуйте позже.',
    RESULT_NONCE_REUSED: 'Этот идентификатор результата уже использован.',
    REWARD_CLAIM_EXPIRED: 'Срок получения награды истёк.',
    SESSION_INVALID: 'Сессия недействительна.',
    VALIDATION_FAILED: 'Проверьте параметры запроса.',
};

export class MiniGameException extends HttpException {
    constructor(
        readonly code: string,
        status: number
    ) {
        super({ code, message: MESSAGES[code] ?? 'Игровой запрос не может быть выполнен.' }, status);
    }
}

export function miniGameError(code: string, status: number): MiniGameException {
    return new MiniGameException(code, status);
}
