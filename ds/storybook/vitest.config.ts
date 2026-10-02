import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
    plugins: [storybookTest({ configDir: fileURLToPath(new URL('./.storybook', import.meta.url)) })],
    optimizeDeps: { include: ['react/jsx-dev-runtime', 'react/jsx-runtime'] },
    test: {
        browser: { enabled: true, headless: true, provider: playwright(), instances: [{ browser: 'chromium' }] },
    },
});
