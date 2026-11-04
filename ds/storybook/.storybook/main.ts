import type { StorybookConfig } from '@storybook/react-vite';
import tailwindcss from '@tailwindcss/vite';

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.tsx'],
    addons: ['@storybook/addon-docs', '@storybook/addon-a11y', '@storybook/addon-vitest'],
    framework: '@storybook/react-vite',
    core: { disableTelemetry: true },
    async viteFinal(config) {
        const { mergeConfig } = await import('vite');
        return mergeConfig(config, {
            plugins: [tailwindcss()],
            // Avoid individual icon requests that privacy filters can block (e.g. fingerprint.js).
            optimizeDeps: { include: ['lucide-react'] },
        });
    },
};
export default config;
