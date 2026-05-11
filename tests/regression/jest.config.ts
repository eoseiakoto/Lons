export default {
  testMatch: ['<rootDir>/**/*.spec.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testTimeout: 60000,
  // Security Hardening (SEC-5): set HASH_PEPPER deterministically.
  setupFiles: ['<rootDir>/../jest.setup.ts'],
  reporters: ['default', ['jest-junit', { outputDirectory: 'test-results', outputName: 'regression.xml' }]],
};
