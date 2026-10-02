export type PaletteId = 'A' | 'B' | 'C' | 'D';

export interface Palette {
  id: PaletteId;
  bg: string;
  primary: string;
  colors: [string, string, string, string, string, string, string, string];
}

export const PALETTES: Record<PaletteId, Palette> = {
  A: { id: 'A', bg: '#FFFDF7', primary: '#3D5AFE', colors: ['#FF6B6B', '#FFA94D', '#FFD43B', '#51CF66', '#22B8CF', '#4C6EF5', '#845EF7', '#F06595'] },
  B: { id: 'B', bg: '#F8F7FC', primary: '#5B4B8A', colors: ['#F4A6A6', '#F9C784', '#F6E58D', '#A8E6CF', '#A0D8EF', '#A7B8F5', '#CDB4F0', '#F7B2D9'] },
  C: { id: 'C', bg: '#F6FBFA', primary: '#0F766E', colors: ['#FF5A5F', '#FF9F1C', '#FFD60A', '#2EC4B6', '#3A86FF', '#8338EC', '#06D6A0', '#FF006E'] },
  D: { id: 'D', bg: '#F7F6F3', primary: '#1D3557', colors: ['#D1495B', '#EDAE49', '#E9C46A', '#2A9D8F', '#457B9D', '#6D597A', '#8AB17D', '#F4A261'] },
};

export const NEUTRAL = { card: '#FFFFFF', text: '#1F2333', textSecondary: '#6B7280', line: '#E7E9F2' };
export const STATE = { success: '#2F9E44', warning: '#E8590C', danger: '#E03131' };
export const HOLIDAY = { national: '#475569', lisbon: '#9D174D' };
export const PROGRESS = { green: '#8CE99A', yellow: '#FFE066', orange: '#FFC078', red: '#FFA8A8', beige: '#F3EBDD', future: '#FFFFFF' };

/** Area colour position by creation order: 1st → C7, 2nd → C6, … then repeat. */
const AREA_SEQUENCE = [7, 6, 2, 3, 8, 4, 5, 1];
export function areaColorIndex(position: number): number {
  return AREA_SEQUENCE[position % AREA_SEQUENCE.length];
}

export function progressColor(pct: number | null, future = false): string {
  if (future) return PROGRESS.future;
  if (pct === null) return PROGRESS.beige;
  if (pct >= 80) return PROGRESS.green;
  if (pct >= 60) return PROGRESS.yellow;
  if (pct >= 40) return PROGRESS.orange;
  return PROGRESS.red;
}

// ---- colour maths ----
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}
function rgbToHex([r, g, b]: number[]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}
function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Light tint for card and tag backgrounds. */
export function soft(hex: string): string {
  return mix(hex, '#FFFFFF', 0.8);
}

/** Darkened version for text and icons, guaranteed AA (4.5) against its soft tint and white. */
export function dark(hex: string): string {
  const bg = soft(hex);
  for (let t = 0.3; t <= 1; t += 0.02) {
    const c = mix(hex, '#1F2333', t);
    if (contrast(c, bg) >= 4.6 && contrast(c, '#FFFFFF') >= 4.6) return c;
  }
  return '#1F2333';
}

/** Readable text colour on a solid fill (white or the main text colour). */
export function onColor(hex: string): string {
  return contrast('#FFFFFF', hex) >= 4.5 ? '#FFFFFF' : NEUTRAL.text;
}

/** Secondary text on the page background: #6B7280, darkened only when it would fall below AA. */
export function secondaryOn(bg: string): string {
  for (let t = 0; t <= 1; t += 0.02) {
    const c = mix(NEUTRAL.textSecondary, NEUTRAL.text, t);
    if (contrast(c, bg) >= 4.6) return c;
  }
  return NEUTRAL.text;
}

export function paletteVars(id: PaletteId): Record<string, string> {
  const p = PALETTES[id];
  const vars: Record<string, string> = {
    '--bg': p.bg,
    '--text-secondary-bg': secondaryOn(p.bg),
    '--primary': p.primary,
    '--primary-soft': soft(p.primary),
    '--primary-dark': dark(p.primary),
    '--on-primary': onColor(p.primary),
  };
  p.colors.forEach((c, i) => {
    vars[`--c${i + 1}`] = c;
    vars[`--c${i + 1}-soft`] = soft(c);
    vars[`--c${i + 1}-dark`] = dark(c);
  });
  for (const [k, v] of Object.entries(STATE)) {
    vars[`--${k}`] = v;
    vars[`--${k}-soft`] = soft(v);
    vars[`--${k}-dark`] = dark(v);
  }
  return vars;
}

export function applyPalette(id: PaletteId): void {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(paletteVars(id))) root.style.setProperty(k, v);
}
