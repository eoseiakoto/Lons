/**
 * Sprint 13B (S13B-1) — Audit coverage guardrail.
 *
 * Static-analysis test that walks every resolver file under
 * `apps/graphql-server/src/graphql/resolvers/` and asserts that each
 * `@Mutation` method has either:
 *   - an `@AuditAction(action, resource)` decorator, OR
 *   - a `// @audit-exempt: <reason>` comment in the surrounding decorator block
 *
 * This prevents new mutations from silently skipping audit logging — the
 * BA review of Sprint 13 found 3 unaudited mutations across the platform
 * that would otherwise have shipped to production.
 *
 * Lightweight regex-based scanner (vs. ts-morph) so the test runs without
 * requiring TypeScript compilation. The pattern is deliberately strict to
 * keep the false-positive rate near zero.
 */

import * as fs from 'fs';
import * as path from 'path';

const RESOLVERS_DIR = path.resolve(
  __dirname,
  '..',
  '..',
  'apps',
  'graphql-server',
  'src',
  'graphql',
  'resolvers',
);

interface ResolverGap {
  file: string;
  line: number;
  method: string;
}

function findMutationGaps(filePath: string): ResolverGap[] {
  const src = fs.readFileSync(filePath, 'utf8');
  const lines = src.split('\n');
  const gaps: ResolverGap[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!/@Mutation\b/.test(lines[i])) continue;

    // Walk up through the contiguous decorator block (decorators, comments,
    // and decorator continuation lines). Stop at an empty line or at the
    // previous statement end.
    const window: string[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const stripped = lines[j].trim();
      if (stripped === '') break;
      window.unshift(stripped);
      const looksLikeContinuation =
        stripped.startsWith('@') ||
        stripped.startsWith('//') ||
        stripped.startsWith('*') ||
        stripped.startsWith('/*') ||
        stripped.endsWith(',') ||
        stripped.endsWith(')') ||
        stripped.endsWith('{') ||
        stripped.includes('(');
      if (!looksLikeContinuation) break;
    }

    // Also include the next ~15 lines (the method header) so we catch
    // decorators that appear after `@Mutation` (rare but legal).
    const after = lines.slice(i, i + 15).join('\n');
    const windowText = window.join('\n') + '\n' + after;

    const hasAudit = /@AuditAction\b/.test(windowText);
    const hasExempt = /@audit-exempt/.test(windowText);
    if (hasAudit || hasExempt) continue;

    // Resolve the method name on the next non-decorator line.
    let k = i + 1;
    while (
      k < lines.length &&
      (lines[k].trim().startsWith('@') || lines[k].trim() === '')
    ) {
      k++;
    }
    const method =
      k < lines.length ? lines[k].trim().slice(0, 100) : '<unknown>';

    gaps.push({
      file: path.basename(filePath),
      line: i + 1,
      method,
    });
  }

  return gaps;
}

describe('Sprint 13B (S13B-1) — Audit coverage guardrail', () => {
  it('every @Mutation in apps/graphql-server resolvers has @AuditAction or @audit-exempt', () => {
    expect(fs.existsSync(RESOLVERS_DIR)).toBe(true);

    const resolverFiles = fs
      .readdirSync(RESOLVERS_DIR)
      .filter(
        (f) =>
          f.endsWith('.resolver.ts') && !f.endsWith('.resolver.spec.ts'),
      )
      .map((f) => path.join(RESOLVERS_DIR, f));

    expect(resolverFiles.length).toBeGreaterThan(0);

    const allGaps: ResolverGap[] = [];
    for (const file of resolverFiles) {
      allGaps.push(...findMutationGaps(file));
    }

    if (allGaps.length > 0) {
      const lines = allGaps
        .map((g) => `  ${g.file}:${g.line} → ${g.method}`)
        .join('\n');
      throw new Error(
        `\nFound ${allGaps.length} @Mutation handler(s) without @AuditAction (or // @audit-exempt: <reason>):\n${lines}\n\nAdd @AuditAction(action, resource) — see packages/common/src/audit/audit-action.decorator.ts.\nOr if the mutation genuinely shouldn't be audited (e.g. per-user inbox state),\nadd a leading comment line: // @audit-exempt: <short reason>\n`,
      );
    }

    expect(allGaps).toEqual([]);
  });
});
