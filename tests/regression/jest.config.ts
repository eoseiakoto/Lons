export default {
  testMatch: ['<rootDir>/**/*.spec.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  testTimeout: 60000,
  reporters: ['default', ['jest-junit', { outputDirectory: 'test-results', outputName: 'regression.xml' }]],
};
