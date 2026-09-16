import type { ConfigContext, ExpoConfig } from 'expo/config';

const productionLinkHost = 'picklehub.ru';

export default ({ config }: ConfigContext): ExpoConfig => {
    const environment = process.env.APP_ENV === 'production' ? 'production' : 'development';
    const isProduction = environment === 'production';
    const apiUrl = process.env.EXPO_PUBLIC_API_URL;
    const miniGameOrigin = process.env.EXPO_PUBLIC_MINI_GAME_ORIGIN;
    if (isProduction && apiUrl === undefined) {
        throw new Error('EXPO_PUBLIC_API_URL is required for a production mobile export.');
    }
    if (isProduction && miniGameOrigin === undefined) {
        throw new Error('EXPO_PUBLIC_MINI_GAME_ORIGIN is required for a production mobile export.');
    }
    const resolvedApiUrl = apiUrl ?? 'http://10.0.2.2:3000/v1';
    const resolvedMiniGameOrigin = miniGameOrigin ?? 'https://game.picklehub.local';
    const appBoundDomains = isProduction
        ? [new URL(resolvedApiUrl).hostname, new URL(resolvedMiniGameOrigin).hostname]
        : [];

    return {
        ...config,
        name: isProduction ? 'PickleHub' : 'PickleHub Dev',
        slug: 'picklehub-mobile',
        version: '0.1.0',
        orientation: 'portrait',
        userInterfaceStyle: 'automatic',
        ios: {
            associatedDomains: [`applinks:${productionLinkHost}`],
            bundleIdentifier: isProduction ? 'ru.picklehub.mobile' : 'ru.picklehub.mobile.dev',
            infoPlist: {
                NSLocationWhenInUseUsageDescription:
                    'Геопозиция нужна только по вашему запросу, чтобы показать ближайшие площадки.',
                WKAppBoundDomains: appBoundDomains,
            },
            supportsTablet: true,
        },
        android: {
            intentFilters: [
                {
                    action: 'VIEW',
                    autoVerify: true,
                    category: ['BROWSABLE', 'DEFAULT'],
                    data: [{ host: productionLinkHost, pathPrefix: '/', scheme: 'https' }],
                },
            ],
            package: isProduction ? 'ru.picklehub.mobile' : 'ru.picklehub.mobile.dev',
            permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'],
        },
        plugins: [
            ['expo-build-properties', { android: { minSdkVersion: 29 }, ios: { deploymentTarget: '16.0' } }],
            ['expo-secure-store', { configureAndroidBackup: true, faceIDPermission: false }],
            ['expo-notifications', { defaultChannel: 'matches' }],
            ['expo-location', { locationWhenInUsePermission: 'Показать ближайшие площадки.' }],
        ],
        extra: {
            apiUrl: resolvedApiUrl,
            appEnvironment: environment,
            ...(isProduction ? {} : { developmentScheme: 'picklehub-dev' }),
            linkHost: productionLinkHost,
            miniGameOrigin: resolvedMiniGameOrigin,
            pushEnabled: false,
        },
        ...(isProduction ? {} : { scheme: 'picklehub-dev' }),
    };
};
