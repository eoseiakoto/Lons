import { SetMetadata } from '@nestjs/common';

export const RATE_CATEGORY_KEY = 'rate_category';

/**
 * Supported rate-limit categories.
 *
 * - read    : high-throughput read operations (e.g. GET /contracts)
 * - write   : state-mutating operations (e.g. POST /loan-requests)
 * - scoring : calls that invoke the credit-scoring service
 */
export type RateCategory = 'read' | 'write' | 'scoring';

/**
 * Attach a rate-limit category to a controller or route handler.
 *
 * @example
 *   @RateCategoryDecorator('write')
 *   @Post('loan-requests')
 *   createLoanRequest(...) {}
 */
export const RateCategoryDecorator = (category: RateCategory) =>
  SetMetadata(RATE_CATEGORY_KEY, category);
