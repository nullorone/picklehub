import {
    bindMiniAppCssVars,
    bindThemeParamsCssVars,
    bindViewportCssVars,
    expandViewport,
    init,
    miniAppReady,
    mountMiniAppSync,
    mountThemeParamsSync,
    mountViewport,
} from '@telegram-apps/sdk-react';

export interface TelegramLifecycle {
    readonly ready: () => void;
}

export async function initializeTelegram(): Promise<TelegramLifecycle> {
    if (import.meta.env.DEV) {
        const { mockTelegramEnv } = await import('@telegram-apps/sdk-react');
        mockTelegramEnv({
            launchParams: {
                tgWebAppPlatform: 'tdesktop',
                tgWebAppThemeParams: {
                    bg_color: '#070b14',
                    button_color: '#2463eb',
                    button_text_color: '#ffffff',
                    hint_color: '#9ca8bb',
                    link_color: '#60a5fa',
                    secondary_bg_color: '#1c2738',
                    text_color: '#f8fafc',
                },
                tgWebAppVersion: '7.0',
            },
        });
        document.documentElement.dataset.telegramDevelopmentMock = 'PICKLEHUB_TELEGRAM_DEVELOPMENT_MOCK';
    }

    init();
    if (mountThemeParamsSync.isAvailable()) mountThemeParamsSync();
    if (bindThemeParamsCssVars.isAvailable()) bindThemeParamsCssVars();
    if (mountMiniAppSync.isAvailable()) mountMiniAppSync();
    if (bindMiniAppCssVars.isAvailable()) bindMiniAppCssVars();
    if (mountViewport.isAvailable()) await mountViewport();
    if (bindViewportCssVars.isAvailable()) bindViewportCssVars();
    if (expandViewport.isAvailable()) expandViewport();

    return {
        ready: () => {
            if (miniAppReady.isAvailable()) miniAppReady();
        },
    };
}
