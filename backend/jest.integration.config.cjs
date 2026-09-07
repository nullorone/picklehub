module.exports = {
    rootDir: '.',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/test/integration/**/*.integration-spec.ts'],
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
    },
    setupFiles: ['<rootDir>/test/integration/setup-environment.ts'],
    clearMocks: true,
    testTimeout: 15000,
};
