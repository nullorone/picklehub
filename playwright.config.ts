import { existsSync } from 'node:fs';

import { defineConfig, devices } from '@playwright/test';

const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath =
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? (existsSync(localChrome) ? localChrome : undefined);

export default defineConfig({
    testDir: './test/e2e',
    fullyParallel: true,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 2 : 0,
    reporter: 'list',
    use: {
        baseURL: 'http://web.picklehub.test',
        locale: 'ru-RU',
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
        ...devices['Desktop Chrome'],
        launchOptions: executablePath === undefined ? {} : { executablePath },
    },
});
