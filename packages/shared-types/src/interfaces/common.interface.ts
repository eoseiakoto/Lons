/**
 * A monetary amount serialized as a string to preserve Decimal precision
 * across service boundaries. Never use `number` for money — float arithmetic
 * loses precision and CLAUDE.md prohibits it. Pass these as-is into Prisma's
 * Decimal columns; Prisma accepts strings directly.
 *
 * Format: a base-10 numeric string with optional decimal point (e.g. "1234.5678").
 */
export type MoneyString = string;

export interface IMoney {
  amount: MoneyString;
  currency: string;
}

export interface IPageInfo {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  startCursor?: string;
  endCursor?: string;
}

export interface IEdge<T> {
  node: T;
  cursor: string;
}

export interface IConnection<T> {
  edges: IEdge<T>[];
  pageInfo: IPageInfo;
  totalCount: number;
}

export interface ICursorPaginationArgs {
  first?: number;
  after?: string;
  last?: number;
  before?: string;
}

export interface IBaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISoftDeletable {
  deletedAt?: Date | null;
}

export interface ITenantScoped {
  tenantId: string;
}
