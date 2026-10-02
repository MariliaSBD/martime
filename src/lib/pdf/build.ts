import type { Block, ReportDoc } from './blocks';

export interface FontData {
  regular: string; // base64
  bold: string; // base64
}

const INK = '#1F2333';
const MUTED = '#6B7280';

export const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="64" height="64"><rect width="512" height="512" rx="112" fill="#FFFDF7"/><circle cx="300" cy="236" r="150" fill="#D8DEFE" stroke="#3D5AFE" stroke-width="22"/><line x1="300" y1="236" x2="300" y2="160" stroke="#3D5AFE" stroke-width="18" stroke-linecap="round"/><line x1="300" y1="236" x2="356" y2="270" stroke="#3D5AFE" stroke-width="18" stroke-linecap="round"/><circle cx="186" cy="184" r="50" fill="#FFFDF7"/><circle cx="186" cy="184" r="32" fill="#3D5AFE"/><path d="M176 236 L150 320 M178 244 L236 278 L268 252 M168 244 L120 262 L98 236 M150 320 L206 356 L194 420 M150 320 L118 380 L64 384" stroke="#FFFDF7" stroke-width="66" stroke-linecap="round" stroke-linejoin="round" fill="none"/><path d="M176 236 L150 320 M178 244 L236 278 L268 252 M168 244 L120 262 L98 236 M150 320 L206 356 L194 420 M150 320 L118 380 L64 384" stroke="#3D5AFE" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;

function blockToPdf(b: Block): unknown {
  switch (b.k) {
    case 'h2':
      return { text: b.text, style: 'h2' };
    case 'h3':
      return { text: b.text, style: 'h3' };
    case 'p':
      return { text: b.text, bold: !!b.bold, color: b.muted ? MUTED : INK, margin: [0, 0, 0, 6] };
    case 'kv':
      return {
        table: { widths: [150, '*'], body: b.rows.map(([k, v]) => [{ text: k, bold: true }, { text: v || '—' }]) },
        layout: 'lightHorizontalLines',
        margin: [0, 0, 0, 8],
      };
    case 'table':
      return {
        table: {
          headerRows: 1,
          widths: b.widths ?? b.head.map(() => '*'),
          body: [b.head.map((h) => ({ text: h, bold: true, fillColor: '#EEF0F6' })), ...b.rows.map((r) => r.map((c) => ({ text: c || '—' })))],
        },
        layout: 'lightHorizontalLines',
        fontSize: 9,
        margin: [0, 0, 0, 8],
      };
    case 'list':
      return { ul: b.items, margin: [0, 0, 0, 8] };
    case 'svg':
      return { svg: b.svg, width: b.width, margin: [0, 2, 0, 8] };
    case 'quote':
      return {
        table: { widths: ['*'], body: [[{ stack: [{ text: b.label, bold: true, margin: [0, 0, 0, 2] }, { text: b.text || '—' }], fillColor: '#F3F5FF' }]] },
        layout: 'noBorders',
        margin: [0, 0, 0, 8],
      };
  }
}

export function docDefinition(doc: ReportDoc, labels: { name: string; course: string; module: string; period: string; generated: string }) {
  const cover = [
    { svg: ICON_SVG, width: 72, margin: [0, 80, 0, 8] },
    { text: 'MarTime', fontSize: 28, bold: true, color: '#3D5AFE' },
    { text: doc.title, fontSize: 22, bold: true, margin: [0, 24, 0, 24] },
    {
      table: {
        widths: [120, '*'],
        body: [
          [{ text: labels.name, bold: true }, doc.name || '—'],
          [{ text: labels.course, bold: true }, doc.course || '—'],
          [{ text: labels.module, bold: true }, doc.module || '—'],
          [{ text: labels.period, bold: true }, doc.period],
          [{ text: labels.generated, bold: true }, doc.generated],
        ],
      },
      layout: 'lightHorizontalLines',
    },
  ];
  const body = doc.sections.flatMap((s, i) => [{ text: s.title, style: 'h1', pageBreak: i === 0 ? 'before' : undefined }, ...s.blocks.map(blockToPdf)]);
  return {
    info: { title: `MarTime – ${doc.title}`, author: doc.name || 'MarTime' },
    pageSize: 'A4',
    pageMargins: [48, 48, 48, 56],
    defaultStyle: { font: 'Jakarta', fontSize: 10, color: INK, lineHeight: 1.25 },
    styles: {
      h1: { fontSize: 16, bold: true, margin: [0, 14, 0, 8], color: '#2A3FB2' },
      h2: { fontSize: 13, bold: true, margin: [0, 10, 0, 4] },
      h3: { fontSize: 11, bold: true, margin: [0, 6, 0, 3] },
    },
    footer: (page: number, count: number) => ({ text: `MarTime · ${doc.title} · ${page}/${count}`, alignment: 'center', fontSize: 8, color: MUTED, margin: [0, 20, 0, 0] }),
    content: [...cover, ...body],
  };
}

type PdfMake = {
  addVirtualFileSystem: (vfs: Record<string, string>) => void;
  addFonts: (f: Record<string, Record<string, string>>) => void;
  setUrlAccessPolicy?: (cb: (url: string) => boolean) => void;
  createPdf: (d: unknown) => { getBuffer: () => Promise<Uint8Array> };
};

export async function renderPdf(doc: ReportDoc, labels: Parameters<typeof docDefinition>[1], fonts: FontData): Promise<Uint8Array> {
  const mod = (await import('pdfmake/build/pdfmake')) as unknown as { default?: PdfMake } & PdfMake;
  const pdfMake = (mod.default ?? mod) as PdfMake;
  pdfMake.addVirtualFileSystem({ 'jakarta-400.woff': fonts.regular, 'jakarta-700.woff': fonts.bold });
  pdfMake.addFonts({ Jakarta: { normal: 'jakarta-400.woff', bold: 'jakarta-700.woff', italics: 'jakarta-400.woff', bolditalics: 'jakarta-700.woff' } });
  pdfMake.setUrlAccessPolicy?.(() => false);
  return pdfMake.createPdf(docDefinition(doc, labels)).getBuffer();
}

function toBase64(buf: ArrayBuffer): string {
  let s = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Fonts served by the app itself (no external requests; cached for offline use). */
export async function loadAppFonts(): Promise<FontData> {
  const [r, b] = await Promise.all([import('@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-400-normal.woff?url'), import('@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-700-normal.woff?url')]);
  const [ra, ba] = await Promise.all([fetch(r.default).then((x) => x.arrayBuffer()), fetch(b.default).then((x) => x.arrayBuffer())]);
  return { regular: toBase64(ra), bold: toBase64(ba) };
}

export function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Mac: download. */
export function downloadPdf(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** iPhone: share sheet with the file; without it, open the PDF in a tab. Must run inside a tap. */
export function sharePdf(bytes: Uint8Array, fileName: string): void {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const file = new File([blob], fileName, { type: 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    navigator.share({ files: [file], title: fileName }).catch(() => undefined);
    return;
  }
  window.open(URL.createObjectURL(blob), '_blank');
}
