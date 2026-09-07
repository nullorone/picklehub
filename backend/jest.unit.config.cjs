module.exports = {
    rootDir: '.',
    testEnvironment: 'node',
    testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
    transform: {
        '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
    },
    collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/worker.ts'],
    collectCoverage: true,
    coverageDirectory: 'coverage/unit',
    clearMocks: true,
};
