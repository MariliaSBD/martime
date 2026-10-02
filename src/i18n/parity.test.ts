import { describe, expect, it } from 'vitest';
import pt from './pt-PT.json';
import en from './en.json';

function flatten(o: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v as Record<string, unknown>, key));
    else out[key] = v;
  }
  return out;
}

describe('translations (17)', () => {
  const p = flatten(pt);
  const e = flatten(en);
  it('have exactly the same keys', () => {
    expect(Object.keys(p).sort()).toEqual(Object.keys(e).sort());
  });
  it('have no empty values', () => {
    for (const [k, v] of [...Object.entries(p), ...Object.entries(e)]) {
      expect(typeof v === 'string' && v.trim().length > 0, k).toBe(true);
    }
  });
  it('never use exclamation marks in Portuguese', () => {
    for (const [k, v] of Object.entries(p)) expect(String(v).includes('!'), k).toBe(false);
  });
});
