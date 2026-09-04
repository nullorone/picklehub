import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            includeAssets: ['icon.svg'],
            manifest: {
                background_color: '#f7f8f3',
                description: 'Организация матчей в пиклбол',
                display: 'standalone',
                icons: [
                    { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
                    { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
                ],
                lang: 'ru-RU',
                name: 'PickleHub',
                short_name: 'PickleHub',
                start_url: '/',
                theme_color: '#f7f8f3',
            },
            registerType: 'prompt',
            workbox: {
                cleanupOutdatedCaches: true,
                navigateFallback: '/index.html',
                runtimeCaching: [],
            },
        }),
    ],
});
