/**
 * Apollo Server plugin for GraphQL query depth and complexity analysis.
 *
 * Implemented as a plain class (no @Plugin() decorator) so it can live in
 * @lons/common without requiring @nestjs/apollo as a dependency. Register it
 * in the graphql-server via `plugins: [new QueryComplexityPlugin()]` inside
 * the GraphQLModule.forRoot() options.
 */

export interface QueryComplexityPluginOptions {
  maxDepth?: number;
  maxCost?: number;
}

export class QueryComplexityPlugin {
  private readonly maxDepth: number;
  private readonly maxCost: number;

  constructor(options?: QueryComplexityPluginOptions) {
    this.maxDepth = options?.maxDepth ?? 10;
    this.maxCost = options?.maxCost ?? 1000;
  }

  async requestDidStart() {
    const maxDepth = this.maxDepth;
    const maxCost = this.maxCost;

    return {
      async didResolveOperation({ document }: any) {
        const depth = calculateDepth(document);
        if (depth > maxDepth) {
          throw new Error(
            `Query depth of ${depth} exceeds maximum allowed depth of ${maxDepth}`,
          );
        }

        const cost = calculateCost(document);
        if (cost > maxCost) {
          throw new Error(
            `Query cost of ${cost} exceeds maximum allowed cost of ${maxCost}`,
          );
        }
      },
    };
  }
}

/** Recursively compute the maximum selection-set depth of a GraphQL document. */
export function calculateDepth(node: any, currentDepth = 0): number {
  if (!node) return currentDepth;

  if (node.kind === 'Document') {
    let max = currentDepth;
    for (const def of node.definitions ?? []) {
      max = Math.max(max, calculateDepth(def, currentDepth));
    }
    return max;
  }

  if (node.selectionSet) {
    let max = currentDepth;
    for (const selection of node.selectionSet.selections ?? []) {
      // Each field inside a selection set adds one level of depth
      max = Math.max(max, calculateDepth(selection, currentDepth + 1));
    }
    return max;
  }

  return currentDepth;
}

/**
 * Simple field-count cost heuristic: every selected field costs 1 point.
 * List fields cost an extra 9 points (assumed multiplier of 10).
 */
export function calculateCost(node: any, currentCost = 0): number {
  if (!node) return currentCost;

  if (node.kind === 'Document') {
    let total = currentCost;
    for (const def of node.definitions ?? []) {
      total += calculateCost(def, 0);
    }
    return total;
  }

  if (node.selectionSet) {
    let total = currentCost;
    for (const selection of node.selectionSet.selections ?? []) {
      // Base cost of 1 per field
      total += 1 + calculateCost(selection, 0);
    }
    return total;
  }

  return currentCost;
}
