import type { Config } from 'jest';

const config: Config = {
  displayName: 'e2e',
  rootDir: '.',
  testMatch: ['<rootDir>/e2e/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@lons/common$': '<rootDir>/../packages/common/src',
    '^@lons/common/(.*)$': '<rootDir>/../packages/common/src/$1',
    '^@lons/database$': '<rootDir>/../packages/database/src',
    '^@lons/event-contracts$': '<rootDir>/../packages/event-contracts/src',
    '^@lons/entity-service$': '<rootDir>/../services/entity-service/src',
    '^@lons/entity-service/(.*)$': '<rootDir>/../services/entity-service/src/$1',
    '^@lons/process-engine$': '<rootDir>/../services/process-engine/src',
    '^@lons/process-engine/(.*)$': '<rootDir>/../services/process-engine/src/$1',
  },
  testEnvironment: 'node',
  clearMocks: true,
  restoreMocks: true,
};

export default config;
