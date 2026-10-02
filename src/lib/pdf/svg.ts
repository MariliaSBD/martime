// Small SVG charts drawn from the data (no screenshots). Labels and values live in the tables next to them.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function barsSvg(rows: { a: number; b: number }[], colors: [string, string], width = 500, height = 160): string {
  const max = Math.max(1, ...rows.flatMap((r) => [r.a, r.b]));
  const n = Math.max(1, rows.length);
  const slot = width / n;
  const bw = Math.max(2, Math.min(18, slot / 2 - 2));
  const bars = rows
    .map((r, i) => {
      const x = i * slot + slot / 2 - bw;
      const ha = (r.a / max) * (height - 10);
      const hb = (r.b / max) * (height - 10);
      return `<rect x="${x.toFixed(1)}" y="${(height - ha).toFixed(1)}" width="${bw.toFixed(1)}" height="${ha.toFixed(1)}" fill="${colors[0]}"/><rect x="${(x + bw).toFixed(1)}" y="${(height - hb).toFixed(1)}" width="${bw.toFixed(1)}" height="${hb.toFixed(1)}" fill="${colors[1]}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><line x1="0" y1="${height}" x2="${width}" y2="${height}" stroke="#E7E9F2"/>${bars}</svg>`;
}

export function donutSvg(segments: { value: number; color: string }[], size = 140): string {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 10;
  const c = size / 2;
  let a0 = -Math.PI / 2;
  const paths = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const a1 = a0 + (s.value / total) * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const p = (a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
      const d = segments.filter((x) => x.value > 0).length === 1 ? `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c - 0.01} ${c - r}` : `M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}`;
      a0 = a1;
      return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="22"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}</svg>`;
}

export function stackedSvg(segments: { value: number; color: string }[], width = 500, height = 22): string {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let x = 0;
  const rects = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const w = (s.value / total) * width;
      const r = `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="${s.color}"/>`;
      x += w;
      return r;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${rects}</svg>`;
}

export function lineSvg(series: { values: (number | null)[]; color: string; dashed?: boolean }[], width = 500, height = 160, max?: number): string {
  const m = max ?? Math.max(1, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  const n = Math.max(2, ...series.map((s) => s.values.length));
  const px = (i: number) => (i / (n - 1)) * (width - 10) + 5;
  const py = (v: number) => height - 5 - (v / m) * (height - 10);
  const lines = series
    .map((s) => {
      const pts = s.values.map((v, i) => (v === null ? null : `${px(i).toFixed(1)},${py(v).toFixed(1)}`)).filter(Boolean);
      if (pts.length < 2) return '';
      return `<polyline points="${pts.join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.5"${s.dashed ? ' stroke-dasharray="6 4"' : ''}/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#E7E9F2"/>${lines}</svg>`;
}

export function gridSvg(cells: { x: number; y: number; color: string }[], cols: number, rows: number, cell = 18): string {
  const rects = cells.map((c) => `<rect x="${c.x * (cell + 2)}" y="${c.y * (cell + 2)}" width="${cell}" height="${cell}" rx="3" fill="${c.color}"/>`).join('');
  const w = cols * (cell + 2);
  const h = rows * (cell + 2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${rects}</svg>`;
}

/** Timeline bars for a project: one row per step. */
export function timelineSvg(rows: { start: number; end: number; critical: boolean; done: boolean }[], colors: { critical: string; other: string }, width = 500, row = 16): string {
  const rects = rows
    .map((r, i) => {
      const x = Math.max(0, r.start) * width;
      const w = Math.max(4, (r.end - r.start) * width);
      return `<rect x="${x.toFixed(1)}" y="${i * (row + 6)}" width="${w.toFixed(1)}" height="${row}" rx="4" fill="${r.critical ? colors.critical : colors.other}" fill-opacity="${r.done ? 0.5 : 1}"/>`;
    })
    .join('');
  const h = Math.max(1, rows.length) * (row + 6);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}"><desc>${esc('timeline')}</desc>${rects}</svg>`;
}
