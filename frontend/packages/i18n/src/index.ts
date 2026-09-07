import { createInstance, type i18n } from 'i18next';

export const defaultLocale = 'ru-RU' as const;

export const resources = {
    'ru-RU': {
        translation: {
            appName: 'PickleHub',
            error: {
                action: 'Попробовать снова',
                description: 'Не удалось показать экран. Обновите страницу или повторите попытку.',
                title: 'Что-то пошло не так',
            },
            navigation: { home: 'Главная' },
            offline: 'Нет подключения к интернету. Доступны только уже загруженные данные.',
            shell: {
                description: 'Платформа для организации матчей в пиклбол.',
                title: 'Основа приложения готова',
            },
        },
    },
} as const;

export async function createAppI18n(): Promise<i18n> {
    const instance = createInstance();
    await instance.init({
        fallbackLng: defaultLocale,
        interpolation: { escapeValue: false },
        lng: defaultLocale,
        resources,
        supportedLngs: [defaultLocale],
    });
    return instance;
}
