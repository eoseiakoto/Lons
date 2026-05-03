import type { Config } from 'jest';
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts', '!src/**/*.module.ts'],
  coverageDirectory: 'coverage',
  // CLAUDE.md target is 80% coverage on business logic. P1-008 enforces this
  // for reconciliation specifically because it's a critical financial batch
  // op with no production protection beyond the test suite.
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
export default config;
