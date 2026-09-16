import Constants from 'expo-constants';

interface RuntimeExtra {
    readonly apiUrl: string;
    readonly appEnvironment: 'development' | 'production';
    readonly developmentScheme?: string;
    readonly linkHost: string;
    readonly pushEnabled: boolean;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<RuntimeExtra>;

export const runtimeConfig: RuntimeExtra = {
    apiUrl:
        extra.apiUrl ??
        (() => {
            throw new Error('Mobile API URL is missing from Expo config.');
        })(),
    appEnvironment: extra.appEnvironment === 'production' ? 'production' : 'development',
    ...(extra.developmentScheme === undefined ? {} : { developmentScheme: extra.developmentScheme }),
    linkHost: extra.linkHost ?? 'picklehub.ru',
    pushEnabled: extra.pushEnabled === true,
};
