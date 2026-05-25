/**
 * Catches FIX-STAB-1's class of bug: a new @InputType field shipped
 * without a class-validator decorator silently 400s every call to
 * the resolver that consumes it, because the global ValidationPipe
 * runs with `{ whitelist: true, forbidNonWhitelisted: true }` and
 * treats any undecorated property as non-whitelisted.
 *
 * The audit in `scripts/audit-input-decorators.ts` walks every
 * @InputType / @ArgsType class under apps/graphql-server/src/graphql/
 * inputs/ and services/*\/src/**\/dto/, and flags any @Field that
 * lacks a recognised class-validator decorator above it. This spec
 * asserts the gap list is empty — the build fails fast if anyone
 * adds a new input field without the matching validator.
 *
 * Sister to permission-catalog-drift.spec.ts.
 */
import { audit } from '../../scripts/audit-input-decorators';

describe('GraphQL input decorator drift', () => {
  it('every @Field on an @InputType / @ArgsType has at least one class-validator decorator', () => {
    const result = audit();

    if (result.gaps.length > 0) {
      // Render a developer-friendly message right in the failure so the
      // CI log makes the fix obvious without needing to run the audit
      // script locally.
      const byFile = new Map<string, typeof result.gaps>();
      for (const g of result.gaps) {
        const list = byFile.get(g.file) ?? [];
        list.push(g);
        byFile.set(g.file, list);
      }
      const sections: string[] = [];
      for (const [file, list] of byFile) {
        const rows = list
          .map((g) => `      line ${g.fieldLine}  ${g.className}.${g.property}`)
          .join('\n');
        sections.push(`    ${file}\n${rows}`);
      }
      throw new Error(
        `Input decorator drift detected.\n\n` +
          `These @Field properties on @InputType / @ArgsType classes are missing\n` +
          `class-validator decorators. Without them the global ValidationPipe\n` +
          `( whitelist: true, forbidNonWhitelisted: true ) will 400 every call.\n\n` +
          `${sections.join('\n\n')}\n\n` +
          `Fix: add at least one validator above each @Field — e.g.\n` +
          `  @IsString(), @IsInt(), @IsUUID(), @IsEnum(...), @IsBoolean(),\n` +
          `  @IsDateString(), @IsArray(), @IsObject(),\n` +
          `plus @IsOptional() if the field is nullable. See\n` +
          `apps/graphql-server/src/graphql/inputs/invoice-verification.input.ts\n` +
          `for the canonical pattern.\n\n` +
          `Tip: decorators must sit ABOVE @Field (the audit walks upward). The\n` +
          `most common cause of this failure is decorators placed BELOW @Field\n` +
          `— they have the same runtime effect but the audit treats them as\n` +
          `absent because @Field is encountered first.`,
      );
    }

    expect(result.gaps).toEqual([]);
  });
});
