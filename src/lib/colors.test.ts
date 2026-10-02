import { describe, expect, it } from 'vitest';
import { HOLIDAY, NEUTRAL, PALETTES, PROGRESS, areaColorIndex, contrast, dark, onColor, progressColor, secondaryOn, soft, STATE } from './colors';

const AA = 4.5;

describe('AA contrast of every colour combination used', () => {
  for (const p of Object.values(PALETTES)) {
    it(`palette ${p.id}`, () => {
      expect(contrast(onColor(p.primary), p.primary)).toBeGreaterThanOrEqual(AA);
      expect(contrast(p.primary, NEUTRAL.card)).toBeGreaterThanOrEqual(AA);
      expect(contrast(dark(p.primary), soft(p.primary))).toBeGreaterThanOrEqual(AA);
      expect(contrast(NEUTRAL.text, p.bg)).toBeGreaterThanOrEqual(AA);
      expect(contrast(secondaryOn(p.bg), p.bg)).toBeGreaterThanOrEqual(AA);
      for (const c of p.colors) {
        expect(contrast(dark(c), soft(c))).toBeGreaterThanOrEqual(AA);
        expect(contrast(dark(c), NEUTRAL.card)).toBeGreaterThanOrEqual(AA);
      }
    });
  }

  it('neutrals, states and holidays', () => {
    expect(contrast(NEUTRAL.text, NEUTRAL.card)).toBeGreaterThanOrEqual(AA);
    expect(contrast(NEUTRAL.textSecondary, NEUTRAL.card)).toBeGreaterThanOrEqual(AA);
    for (const s of Object.values(STATE)) expect(contrast(dark(s), soft(s))).toBeGreaterThanOrEqual(AA);
    for (const h of Object.values(HOLIDAY)) expect(contrast('#FFFFFF', h)).toBeGreaterThanOrEqual(AA);
  });

  it('progress scale always uses #1F2333 text', () => {
    for (const c of Object.values(PROGRESS)) expect(contrast(NEUTRAL.text, c)).toBeGreaterThanOrEqual(AA);
  });
});

describe('progress scale', () => {
  it('maps percentages to colours', () => {
    expect(progressColor(80)).toBe(PROGRESS.green);
    expect(progressColor(79)).toBe(PROGRESS.yellow);
    expect(progressColor(60)).toBe(PROGRESS.yellow);
    expect(progressColor(59)).toBe(PROGRESS.orange);
    expect(progressColor(40)).toBe(PROGRESS.orange);
    expect(progressColor(39)).toBe(PROGRESS.red);
    expect(progressColor(null)).toBe(PROGRESS.beige);
    expect(progressColor(50, true)).toBe(PROGRESS.future);
  });
});

describe('area colours', () => {
  it('follows C7, C6, C2, C3, C8, C4, C5, C1 and repeats', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(areaColorIndex)).toEqual([7, 6, 2, 3, 8, 4, 5, 1, 7]);
  });
});
