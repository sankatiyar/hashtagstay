import { describe, expect, it } from 'vitest';

import { diffFields, requiresAudit } from './index';

describe('diffFields()', () => {
  it('records only the fields that changed', () => {
    const result = diffFields(
      { name: 'Nest Malleswaram', city: 'Bengaluru', listingState: 'draft' },
      { name: 'Nest Malleswaram', city: 'Bengaluru', listingState: 'live' },
    );
    expect(result.before).toEqual({ listingState: 'draft' });
    expect(result.after).toEqual({ listingState: 'live' });
  });

  it('ignores updatedAt, which changes on every write and says nothing', () => {
    const result = diffFields(
      { name: 'A', updatedAt: new Date('2026-01-01') },
      { name: 'A', updatedAt: new Date('2026-09-12') },
    );
    expect(result.before).toEqual({});
    expect(result.after).toEqual({});
  });

  it('detects a change inside a jsonb array', () => {
    const result = diffFields(
      { amenities: ['wifi', 'ac'] },
      { amenities: ['wifi', 'ac', 'gym'] },
    );
    expect(result.after).toEqual({ amenities: ['wifi', 'ac', 'gym'] });
  });

  it('treats array reordering as a change, since order is meaningful for media', () => {
    const result = diffFields({ order: ['a', 'b'] }, { order: ['b', 'a'] });
    expect(result.before).toEqual({ order: ['a', 'b'] });
  });

  it('captures an added field', () => {
    const result = diffFields({ a: 1 }, { a: 1, b: 2 });
    expect(result.before).toEqual({ b: undefined });
    expect(result.after).toEqual({ b: 2 });
  });

  it('captures a removed field', () => {
    const result = diffFields({ a: 1, b: 2 }, { a: 1 });
    expect(result.before).toEqual({ b: 2 });
    expect(result.after).toEqual({ b: undefined });
  });

  it('treats a create (no before) as everything new', () => {
    const result = diffFields(null, { name: 'New', city: 'Pune' });
    expect(result.before).toEqual({});
    expect(result.after).toEqual({ name: 'New', city: 'Pune' });
  });

  it('treats a delete (no after) as everything removed', () => {
    const result = diffFields({ name: 'Gone' }, null);
    expect(result.before).toEqual({ name: 'Gone' });
    expect(result.after).toEqual({});
  });

  it('returns empty for identical inputs', () => {
    const row = { name: 'Same', amenities: ['wifi'] };
    const result = diffFields(row, { ...row, amenities: ['wifi'] });
    expect(result.before).toEqual({});
    expect(result.after).toEqual({});
  });

  it('does not confuse null with undefined-but-present', () => {
    const result = diffFields({ verifiedAt: null }, { verifiedAt: new Date(0) });
    expect(result.after.verifiedAt).toEqual(new Date(0));
  });
});

describe('requiresAudit()', () => {
  it('requires an entry for bulk PII export and money movement', () => {
    expect(requiresAudit('export:pii')).toBe(true);
    expect(requiresAudit('payment:refund')).toBe(true);
    expect(requiresAudit('fee_rule:edit')).toBe(true);
    expect(requiresAudit('verification:approve')).toBe(true);
    expect(requiresAudit('call:listen_recording')).toBe(true);
  });

  it('does not require one for ordinary reads', () => {
    expect(requiresAudit('lead:view_assigned')).toBe(false);
    expect(requiresAudit('report:view')).toBe(false);
  });
});
