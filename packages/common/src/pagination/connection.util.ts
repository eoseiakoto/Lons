import { IConnection, IEdge, IPageInfo, ICursorPaginationArgs } from '@lons/shared-types';

import { encodeCursor } from './cursor.util';

export function buildConnection<T extends { id: string }>(
  items: T[],
  totalCount: number,
  args: ICursorPaginationArgs,
): IConnection<T> {
  const limit = args.first || args.last || 20;
  const hasMore = items.length > limit;
  const sliced = hasMore ? items.slice(0, limit) : items;

  const edges: IEdge<T>[] = sliced.map((item) => ({
    node: item,
    cursor: encodeCursor(item.id),
  }));

  const pageInfo: IPageInfo = {
    hasNextPage: args.first ? hasMore : false,
    hasPreviousPage: args.last ? hasMore : !!args.after,
    startCursor: edges.length > 0 ? edges[0].cursor : undefined,
    endCursor: edges.length > 0 ? edges[edges.length - 1].cursor : undefined,
  };

  return { edges, pageInfo, totalCount };
}
