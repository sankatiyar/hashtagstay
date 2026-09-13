import { describe, expect, it } from 'vitest';

import { newOtpCode, newPublicToken, newReference } from '@/lib/ids';
import { chooseAssignee, type RoutingCandidate } from '@/lib/services/routing';

import { assertSafePath, sniffMatches } from './storage';
import {
  TEMPLATES,
  TemplateError,
  redact,
  renderTemplate,
  templateVariables,
} from './templates';

describe('templates', () => {
  it('renders variables', () => {
    expect(
      renderTemplate('Hi {{name}}, ref {{reference}}', {
        name: 'Asha',
        reference: 'HSL-1',
      }),
    ).toBe('Hi Asha, ref HSL-1');
  });

  it('throws on a missing variable instead of sending a hole', () => {
    expect(() => renderTemplate('Code {{code}}', {})).toThrow(TemplateError);
  });

  it('redacts sensitive variables in the logged copy', () => {
    const otp = TEMPLATES.find((t) => t.key === 'otp.verify')!;
    const logged = redact(otp, otp.body, { code: '123456' });
    expect(logged).not.toContain('123456');
  });

  it('has unique keys and at least one channel each', () => {
    const keys = TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const t of TEMPLATES) expect(t.channels.length).toBeGreaterThan(0);
  });

  it('lists the variables a template needs', () => {
    expect(templateVariables('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });

  it('never asks for a phone number in a resident-facing template', () => {
    // Masked calling is the revenue control; no template may leak a number.
    for (const t of TEMPLATES) {
      expect(templateVariables(t.body)).not.toContain('host_phone');
      expect(templateVariables(t.body)).not.toContain('operator_phone');
    }
  });
});

describe('ids', () => {
  it('prefixes references by kind and avoids ambiguous characters', () => {
    const ref = newReference('lead');
    expect(ref).toMatch(/^HSL-[2-9A-HJKMNP-Z]{7}$/);
    expect(newReference('booking')).toMatch(/^HSB-/);
  });

  it('makes 22-character url-safe tokens', () => {
    expect(newPublicToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('makes six-digit codes', () => {
    for (let i = 0; i < 50; i += 1) expect(newOtpCode()).toMatch(/^\d{6}$/);
  });
});

describe('storage path safety', () => {
  it('accepts a normal path', () => {
    expect(assertSafePath('media/abc/def.jpg')).toBe('media/abc/def.jpg');
  });

  it.each([
    '../etc/passwd',
    '/abs/path.jpg',
    'media/../../x',
    'C:/x.jpg',
    'media/a b.jpg',
  ])('rejects %s', (path) => {
    expect(() => assertSafePath(path)).toThrow();
  });
});

describe('content sniffing', () => {
  it('recognises real magic bytes', () => {
    expect(sniffMatches(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg')).toBe(
      true,
    );
    expect(sniffMatches(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')).toBe(
      true,
    );
    expect(
      sniffMatches(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'application/pdf'),
    ).toBe(true);
  });

  it('rejects a file whose bytes do not match its claimed type', () => {
    const html = new TextEncoder().encode('<html><script>');
    expect(sniffMatches(html, 'image/jpeg')).toBe(false);
    expect(sniffMatches(html, 'application/pdf')).toBe(false);
  });
});

describe('chooseAssignee()', () => {
  const rm = (overrides: Partial<RoutingCandidate>): RoutingCandidate => ({
    userId: 'x',
    cities: [],
    languages: ['en', 'hi'],
    activeLeads: 0,
    maxActiveLeads: 40,
    lastAssignedAt: null,
    ...overrides,
  });

  it('prefers city and language together', () => {
    const decision = chooseAssignee(
      [
        rm({ userId: 'pune-en', cities: ['Pune'], languages: ['en'] }),
        rm({ userId: 'pune-ta', cities: ['Pune'], languages: ['en', 'ta'] }),
      ],
      { city: 'Pune', language: 'ta' },
    );
    expect(decision).toEqual({ userId: 'pune-ta', matchLevel: 'city_and_language' });
  });

  it('falls back to city when nobody speaks the language', () => {
    const decision = chooseAssignee(
      [
        rm({ userId: 'pune', cities: ['Pune'] }),
        rm({ userId: 'blr', cities: ['Bengaluru'] }),
      ],
      { city: 'Pune', language: 'ta' },
    );
    expect(decision?.userId).toBe('pune');
    expect(decision?.matchLevel).toBe('city');
  });

  it('balances load within a tier', () => {
    const decision = chooseAssignee(
      [
        rm({ userId: 'busy', cities: ['Pune'], activeLeads: 12 }),
        rm({ userId: 'free', cities: ['Pune'], activeLeads: 3 }),
      ],
      { city: 'Pune', language: 'en' },
    );
    expect(decision?.userId).toBe('free');
  });

  it('breaks ties by who was assigned longest ago', () => {
    const decision = chooseAssignee(
      [
        rm({ userId: 'recent', lastAssignedAt: new Date('2026-09-14T10:00:00Z') }),
        rm({ userId: 'earlier', lastAssignedAt: new Date('2026-09-14T08:00:00Z') }),
      ],
      { city: null, language: 'en' },
    );
    expect(decision?.userId).toBe('earlier');
  });

  it('skips an RM at capacity', () => {
    const decision = chooseAssignee(
      [
        rm({ userId: 'full', cities: ['Pune'], activeLeads: 40, maxActiveLeads: 40 }),
        rm({ userId: 'elsewhere', cities: ['Bengaluru'] }),
      ],
      { city: 'Pune', language: 'en' },
    );
    expect(decision?.userId).toBe('elsewhere');
  });

  it('returns null when everyone is at capacity', () => {
    expect(
      chooseAssignee([rm({ activeLeads: 40, maxActiveLeads: 40 })], {
        city: 'Pune',
        language: 'en',
      }),
    ).toBeNull();
  });

  it('treats an RM with no cities as covering every city', () => {
    const decision = chooseAssignee([rm({ userId: 'anywhere', cities: [] })], {
      city: 'Delhi NCR',
      language: 'hi',
    });
    expect(decision).toEqual({ userId: 'anywhere', matchLevel: 'city_and_language' });
  });
});
