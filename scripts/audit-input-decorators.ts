/**
 * audit-input-decorators.ts — catch missing class-validator decorators
 * on @InputType / @ArgsType fields before they ship as 400s.
 *
 * The global ValidationPipe in apps/graphql-server runs with
 * `{ whitelist: true, forbidNonWhitelisted: true }`. Any @Field()
 * property without at least one class-validator decorator is treated
 * as non-whitelisted, and the empty filter/args instance NestJS
 * constructs for nullable args gets every property rejected.
 *
 * Sprint 18 stabilisation FIX-STAB-1 swept all known files, but a
 * code-level guard is required so the next person to add a new
 * @InputType doesn't reintroduce the bug.
 *
 * Sister script to audit-permissions.ts — same model: scan source,
 * compute diff, exit non-zero on regressions. Regression test in
 * tests/regression/input-decorator-drift.spec.ts.
 *
 * Usage:
 *   pnpm audit:input-decorators
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

export interface FieldGap {
  file: string;
  className: string;
  property: string;
  fieldLine: number;
  preview: string;
}

export interface AuditResult {
  scannedFiles: number;
  scannedFields: number;
  gaps: FieldGap[];
}

const PROJECT_ROOT = join(__dirname, '..');

// Class-validator decorators we recognise as "covering" a field. Not
// exhaustive — extend as new decorators get used. Anything starting
// with `Is`, `Min`, `Max`, `Length`, `Matches`, `Array`, `Contains`,
// `Equals`, `NotContains`, `NotEquals`, `Validate` is treated as a
// validator, which covers the full class-validator surface plus the
// custom @Validate() escape hatch.
//
// `Type` (from class-transformer) does NOT count — it's a coercion
// helper, not a validator. Same for `Transform`, `Exclude`, `Expose`.
const VALIDATOR_DECORATOR_RE =
  /@(Is[A-Z]|Min(Length|Size|Date)?\b|Max(Length|Size|Date)?\b|Length\b|Matches\b|Array(NotEmpty|MinSize|MaxSize|Unique|Contains|NotContains)\b|Contains\b|NotContains\b|Equals\b|NotEquals\b|Validate(Nested|If|By|Promise)?\b|Allow\b)/;

const SCAN_DIRS = [
  join(PROJECT_ROOT, 'apps', 'graphql-server', 'src', 'graphql', 'inputs'),
  // Per-service DTO folders surfaced by `find services -type d -name dto`.
  // dist/ is excluded by the walk filter below.
  join(PROJECT_ROOT, 'services', 'process-engine', 'src', 'monitoring', 'dto'),
  join(PROJECT_ROOT, 'services', 'recovery-service', 'src', 'dto'),
  join(PROJECT_ROOT, 'services', 'entity-service', 'src', 'auth', 'dto'),
  join(PROJECT_ROOT, 'services', 'entity-service', 'src', 'audit', 'dto'),
  join(PROJECT_ROOT, 'services', 'notification-service', 'src', 'templates', 'dto'),
  join(PROJECT_ROOT, 'services', 'notification-service', 'src', 'webhooks', 'dto'),
];

const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.turbo', '__tests__']);

function walkTs(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let s: ReturnType<typeof statSync>;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      walkTs(p, out);
    } else if (
      s.isFile() &&
      p.endsWith('.ts') &&
      !/\.spec\.ts$|\.test\.ts$|\.e2e-spec\.ts$/.test(p)
    ) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Scan a single source file. For each class annotated with @InputType
 * or @ArgsType, walk the class body and find every property that
 * carries a @Field decorator but no class-validator decorator on the
 * lines immediately preceding it.
 *
 * Properties: split the file into lines. For each `@Field` line,
 * collect the decorators that appear contiguously above it (going up
 * until we hit a blank line, another property declaration, a `}` for
 * end-of-class, or the start of the class). If none of those
 * decorators match VALIDATOR_DECORATOR_RE, the property is a gap.
 *
 * The class context (which class are we in?) is tracked by walking
 * the file linearly and remembering the last @InputType / @ArgsType
 * declaration. Files without those decorators are skipped entirely.
 */
export function scanFile(filePath: string): { fields: number; gaps: FieldGap[] } {
  const source = readFileSync(filePath, 'utf8');
  if (!/@(InputType|ArgsType)\b/.test(source)) {
    return { fields: 0, gaps: [] };
  }

  const lines = source.split('\n');
  const gaps: FieldGap[] = [];
  let fieldCount = 0;

  let currentClass: string | null = null;
  let inInputType = false;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect @InputType()/@ArgsType() decorator → next class line is
    // the entry point. We don't enter the class until we see the
    // opening brace, so the brace-depth tracking works on body-only.
    if (/@(InputType|ArgsType)\b/.test(line)) {
      inInputType = true;
      continue;
    }

    const classMatch = line.match(/^\s*(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/);
    if (classMatch && inInputType) {
      currentClass = classMatch[1];
      braceDepth = 0;
      // Don't reset inInputType — wait until we see the opening
      // brace, then track depth.
    }

    // Track braces only when we're inside an @InputType class. The
    // simple counter handles nested object literals in default values
    // because we count both `{` and `}` on every line.
    if (currentClass) {
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;
      if (braceDepth <= 0 && /\}/.test(line) && line.indexOf('{') === -1) {
        // End of class.
        currentClass = null;
        inInputType = false;
        braceDepth = 0;
        continue;
      }
    }

    if (!currentClass) continue;

    // Look for a @Field decorator. Once found, walk upward to collect
    // the preceding decorators on this property.
    if (/@Field\b/.test(line)) {
      fieldCount++;
      // Collect decorators above this @Field line.
      const decorators: string[] = [line.trim()];
      for (let j = i - 1; j >= 0; j--) {
        const above = lines[j].trim();
        if (above === '') break;
        if (above.startsWith('//')) continue; // comments
        if (above.startsWith('*') || above.startsWith('/*')) continue; // JSDoc
        if (above.startsWith('@')) {
          decorators.push(above);
          continue;
        }
        // Hit a non-decorator non-comment line (e.g. previous property's
        // semicolon end). Stop scanning upward.
        break;
      }

      // Also check the same-line case: @Field(...) might be preceded
      // by inline decorators on the same line, e.g.
      //   @IsOptional() @IsString() @Field(...) name?: string;
      // The split-on-newline already covers this via `line.trim()` —
      // any `@Is...` token earlier on the line will be in `decorators[0]`.

      const hasValidator = decorators.some((d) =>
        VALIDATOR_DECORATOR_RE.test(d),
      );
      if (!hasValidator) {
        // Find the property name by looking at the next line(s).
        let propertyLine = '';
        for (let k = i + 1; k < Math.min(i + 5, lines.length); k++) {
          const nx = lines[k].trim();
          if (nx === '' || nx.startsWith('@') || nx.startsWith('//') || nx.startsWith('*')) continue;
          propertyLine = nx;
          break;
        }
        const nameMatch = propertyLine.match(/^(\w+)[?!]?[:!=]/);
        const propertyName = nameMatch ? nameMatch[1] : '(unknown)';
        // For inline-decorator-on-@Field-line cases, the property name
        // is on the same line as @Field. Try that fallback.
        let fallbackName = propertyName;
        if (fallbackName === '(unknown)') {
          const sameLine = line.match(/@Field\b[^)]*\)\s*(\w+)[?!]?[:!]/);
          if (sameLine) fallbackName = sameLine[1];
        }
        gaps.push({
          file: filePath.replace(PROJECT_ROOT + '/', ''),
          className: currentClass,
          property: fallbackName,
          fieldLine: i + 1,
          preview: line.trim().slice(0, 100),
        });
      }
    }
  }

  return { fields: fieldCount, gaps };
}

export function audit(): AuditResult {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) walkTs(dir, files);

  let scannedFields = 0;
  const gaps: FieldGap[] = [];
  for (const f of files) {
    const r = scanFile(f);
    scannedFields += r.fields;
    gaps.push(...r.gaps);
  }

  return { scannedFiles: files.length, scannedFields, gaps };
}

function main(): void {
  const result = audit();

  console.log('Input decorator audit');
  console.log('=====================\n');
  console.log(`Scanned: ${result.scannedFiles} files / ${result.scannedFields} @Field properties\n`);

  if (result.gaps.length === 0) {
    console.log('\x1b[32m✓ Every @Field property in @InputType / @ArgsType has at least one class-validator decorator.\x1b[0m');
    process.exit(0);
  }

  // Group gaps by file for readable output.
  const byFile = new Map<string, FieldGap[]>();
  for (const g of result.gaps) {
    const list = byFile.get(g.file) ?? [];
    list.push(g);
    byFile.set(g.file, list);
  }

  console.error(
    `\x1b[31m✗ MISSING DECORATORS (${result.gaps.length} field${result.gaps.length === 1 ? '' : 's'} across ${byFile.size} file${byFile.size === 1 ? '' : 's'}):\x1b[0m\n`,
  );
  for (const [file, list] of byFile) {
    console.error(`  \x1b[1m${file}\x1b[0m`);
    for (const g of list) {
      console.error(`    line ${g.fieldLine}  ${g.className}.${g.property}`);
    }
    console.error('');
  }
  console.error(
    'Fix: add at least one class-validator decorator (e.g. @IsString(), @IsInt(),\n' +
      '     @IsUUID(), @IsEnum(...), @IsBoolean(), @IsDateString(), @IsArray(),\n' +
      '     plus @IsOptional() if the field is nullable) above each @Field.\n' +
      'See apps/graphql-server/src/graphql/inputs/invoice-verification.input.ts\n' +
      'for the canonical pattern.',
  );
  process.exit(1);
}

if (require.main === module) {
  main();
}
