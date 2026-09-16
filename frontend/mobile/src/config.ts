import Constants from 'expo-constants';

interface RuntimeExtra {
    readonly apiUrl: string;
    readonly appEnvironment: 'development' | 'production';
    readonly linkHost: string;
    readonly pushEnabled: boolean;
}

const extra = Constants.expoConfig?.extra as Partial<RuntimeExtra> | undefined;

export const runtimeConfig: RuntimeExtra = {
    apiUrl: extra?.apiUrl ?? 'http://10.0.2.2:3000/v1',
    appEnvironment: extra?.appEnvironment === 'production' ? 'production' : 'development',
    linkHost: extra?.linkHost ?? 'picklehub.ru',
    pushEnabled: extra?.pushEnabled === true,
};
