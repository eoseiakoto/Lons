export interface FieldDiff {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * Compute field-level diffs between two objects.
 * - Pass `null` for `before` when recording a create operation.
 * - Pass `null` for `after` when recording a delete operation.
 * Only fields that actually changed are included in the result.
 */
export function computeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): FieldDiff[] {
  const diffs: FieldDiff[] = [];

  // Collect all unique keys from both objects
  const allKeys = new Set<string>([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  for (const field of allKeys) {
    const beforeVal = before ? before[field] : undefined;
    const afterVal = after ? after[field] : undefined;

    // Perform a deep-equality check using JSON serialisation so that plain
    // objects and arrays are compared by value rather than reference.
    const beforeSerialized = JSON.stringify(beforeVal);
    const afterSerialized = JSON.stringify(afterVal);

    if (beforeSerialized !== afterSerialized) {
      diffs.push({ field, before: beforeVal, after: afterVal });
    }
  }

  return diffs;
}
