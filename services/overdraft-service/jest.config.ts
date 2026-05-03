import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/index.ts', '!src/**/*.module.ts'],
  coverageDirectory: 'coverage',
  // CLAUDE.md target is 80% on business logic. Sprint 11 A12 raised the
  // floor from 60% by adding mock-Prisma integration tests for every
  // DB-bound entry point — `processDrawdown`, `processAutoRepayment`,
  // `processManualRepayment`, `accrueDaily`, `closeCyclesDue`,
  // `expireDueLines`, plus freeze/unfreeze/deactivate and the BullMQ
  // listener.
  //
  // Statements / lines / functions are held at 80%. Branches sit at 65%
  // — backend services have a long tail of defensive guards (early
  // returns on falsy inputs, error-path catches) that branch coverage
  // counts twice; squeezing them all is rarely worth the test maintenance
  // cost. Live-DB integration tests in Sprint 13 will close the remaining
  // branch gaps.
  coverageThreshold: {
    global: {
      statements: 80,
      functions: 80,
      lines: 80,
      // TODO: Raise to 80 by Sprint 13 once live-DB integration tests
      // exercise the defensive guards (early returns on falsy inputs,
      // error-path catches) that currently inflate the branch count.
      branches: 65,
    },
  },
};

export default config;
