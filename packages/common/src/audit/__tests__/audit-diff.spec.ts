import { computeDiff } from '../audit-diff.util';

describe('computeDiff', () => {
  it('returns all fields as added when before is null (create operation)', () => {
    const after = { name: 'Alice', status: 'active' };
    const diffs = computeDiff(null, after);

    expect(diffs).toHaveLength(2);
    expect(diffs.find((d) => d.field === 'name')).toEqual({ field: 'name', before: undefined, after: 'Alice' });
    expect(diffs.find((d) => d.field === 'status')).toEqual({ field: 'status', before: undefined, after: 'active' });
  });

  it('returns all fields as removed when after is null (delete operation)', () => {
    const before = { name: 'Bob', status: 'active' };
    const diffs = computeDiff(before, null);

    expect(diffs).toHaveLength(2);
    expect(diffs.find((d) => d.field === 'name')).toEqual({ field: 'name', before: 'Bob', after: undefined });
    expect(diffs.find((d) => d.field === 'status')).toEqual({
      field: 'status',
      before: 'active',
      after: undefined,
    });
  });

  it('returns only changed fields for an update operation', () => {
    const before = { name: 'Alice', status: 'active', limit: 1000 };
    const after = { name: 'Alice', status: 'suspended', limit: 2000 };
    const diffs = computeDiff(before, after);

    expect(diffs).toHaveLength(2);
    expect(diffs.find((d) => d.field === 'status')).toEqual({
      field: 'status',
      before: 'active',
      after: 'suspended',
    });
    expect(diffs.find((d) => d.field === 'limit')).toEqual({ field: 'limit', before: 1000, after: 2000 });
    expect(diffs.find((d) => d.field === 'name')).toBeUndefined();
  });

  it('returns an empty array when both objects are identical', () => {
    const obj = { name: 'Alice', status: 'active' };
    const diffs = computeDiff(obj, { ...obj });
    expect(diffs).toHaveLength(0);
  });

  it('detects nested object changes via deep equality', () => {
    const before = { address: { city: 'Accra', zip: '00233' } };
    const after = { address: { city: 'Kumasi', zip: '00233' } };
    const diffs = computeDiff(before, after);

    expect(diffs).toHaveLength(1);
    expect(diffs[0].field).toBe('address');
    expect(diffs[0].before).toEqual({ city: 'Accra', zip: '00233' });
    expect(diffs[0].after).toEqual({ city: 'Kumasi', zip: '00233' });
  });

  it('detects added fields when a key appears only in after', () => {
    const before = { name: 'Alice' };
    const after = { name: 'Alice', email: 'alice@example.com' };
    const diffs = computeDiff(before, after);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({ field: 'email', before: undefined, after: 'alice@example.com' });
  });

  it('detects removed fields when a key appears only in before', () => {
    const before = { name: 'Alice', email: 'alice@example.com' };
    const after = { name: 'Alice' };
    const diffs = computeDiff(before, after);

    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toEqual({ field: 'email', before: 'alice@example.com', after: undefined });
  });
});
