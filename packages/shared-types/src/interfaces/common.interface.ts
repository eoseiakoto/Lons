export interface IMoney {
  amount: string;
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
