import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/*.staging-spec.ts'],
  setupFilesAfterSetup: ['./setup.ts'],
  testTimeout: 30000,
  verbose: true,
};

export default config;
