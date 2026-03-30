import { QueryComplexityPlugin, calculateDepth, calculateCost } from '../query-complexity.plugin';

// ---------------------------------------------------------------------------
// Helpers to build minimal GraphQL-like AST nodes
// ---------------------------------------------------------------------------

function field(name: string, children: any[] = []): any {
  return {
    kind: 'Field',
    name: { value: name },
    selectionSet: children.length > 0 ? { selections: children } : undefined,
  };
}

function document(...definitions: any[]): any {
  return { kind: 'Document', definitions };
}

function operationDef(...selections: any[]): any {
  return {
    kind: 'OperationDefinition',
    selectionSet: { selections },
  };
}

// ---------------------------------------------------------------------------
// calculateDepth
// ---------------------------------------------------------------------------

describe('calculateDepth', () => {
  it('returns 0 for an empty document', () => {
    expect(calculateDepth(document())).toBe(0);
  });

  it('returns 1 for a single top-level field', () => {
    const doc = document(operationDef(field('user')));
    expect(calculateDepth(doc)).toBe(1);
  });

  it('calculates depth of a shallow query correctly', () => {
    // { user { id name } } → depth 2
    const doc = document(operationDef(field('user', [field('id'), field('name')])));
    expect(calculateDepth(doc)).toBe(2);
  });

  it('calculates depth of a moderately nested query', () => {
    // { user { posts { comments { body } } } } → depth 4
    const doc = document(
      operationDef(field('user', [field('posts', [field('comments', [field('body')])])])),
    );
    expect(calculateDepth(doc)).toBe(4);
  });

  it('returns the maximum depth across parallel branches', () => {
    // { user { id } posts { comments { body } } } → max depth 3
    const doc = document(
      operationDef(
        field('user', [field('id')]),
        field('posts', [field('comments', [field('body')])]),
      ),
    );
    expect(calculateDepth(doc)).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// QueryComplexityPlugin
// ---------------------------------------------------------------------------

describe('QueryComplexityPlugin', () => {
  const shallowDoc = document(operationDef(field('user', [field('id'), field('name')])));

  // Depth 11: root → a → b → c → d → e → f → g → h → i → j → k
  function deepDoc(levels: number): any {
    let node: any = field('leaf');
    for (let i = levels - 1; i >= 0; i--) {
      node = field(`level${i}`, [node]);
    }
    return document(operationDef(node));
  }

  it('creates with default options (maxDepth=10, maxCost=1000)', () => {
    const plugin = new QueryComplexityPlugin();
    expect(plugin).toBeDefined();
  });

  it('creates with custom options', () => {
    const plugin = new QueryComplexityPlugin({ maxDepth: 5, maxCost: 200 });
    expect(plugin).toBeDefined();
  });

  it('allows a shallow query (depth <= maxDepth)', async () => {
    const plugin = new QueryComplexityPlugin({ maxDepth: 10 });
    const hooks = await plugin.requestDidStart();
    await expect(hooks.didResolveOperation({ document: shallowDoc })).resolves.toBeUndefined();
  });

  it('rejects a query that exceeds maxDepth', async () => {
    const plugin = new QueryComplexityPlugin({ maxDepth: 10 });
    const hooks = await plugin.requestDidStart();
    const tooDeepDoc = deepDoc(11); // depth = 12 (11 wrapper fields + leaf at 12)
    await expect(hooks.didResolveOperation({ document: tooDeepDoc })).rejects.toThrow(
      /exceeds maximum allowed depth/,
    );
  });

  it('rejects a query with cost exceeding maxCost', async () => {
    const plugin = new QueryComplexityPlugin({ maxDepth: 100, maxCost: 3 });
    const hooks = await plugin.requestDidStart();
    // { user { id name email } } → cost = 1 + (1+1+1+1) = 5
    const expensiveDoc = document(
      operationDef(field('user', [field('id'), field('name'), field('email'), field('phone')])),
    );
    await expect(hooks.didResolveOperation({ document: expensiveDoc })).rejects.toThrow(
      /exceeds maximum allowed cost/,
    );
  });

  it('passes a query within both depth and cost limits', async () => {
    const plugin = new QueryComplexityPlugin({ maxDepth: 10, maxCost: 1000 });
    const hooks = await plugin.requestDidStart();
    await expect(hooks.didResolveOperation({ document: shallowDoc })).resolves.toBeUndefined();
  });
});
