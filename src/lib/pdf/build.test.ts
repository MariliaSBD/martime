// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderPdf } from './build';
import { pdfFileName } from './blocks';
import { barsSvg, donutSvg } from './svg';

const dir = 'node_modules/@fontsource/plus-jakarta-sans/files/';
const fonts = { regular: readFileSync(dir + 'plus-jakarta-sans-latin-400-normal.woff').toString('base64'), bold: readFileSync(dir + 'plus-jakarta-sans-latin-700-normal.woff').toString('base64') };

async function textOf(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const c = await (await doc.getPage(i)).getTextContent();
    out += c.items.map((x) => ('str' in x ? x.str : '')).join(' ') + '\n';
  }
  return out;
}

describe('PDF (16, R6)', () => {
  it('generates a valid PDF with correct Portuguese accents and SVG charts', async () => {
    const bytes = await renderPdf(
      {
        title: 'Relatório semanal',
        name: 'Marília',
        course: 'Gestão',
        module: 'Gestão do tempo',
        period: '5 out. – 11 out.',
        generated: '2 de outubro de 2026',
        sections: [{ title: 'Progressão e decisões', blocks: [{ k: 'p', text: 'Ação, coração, pão, avó, à, é, ç, ã, õ, ê' }, { k: 'svg', svg: barsSvg([{ a: 30, b: 45 }], ['#4C6EF5', '#51CF66']), width: 300, alt: '' }, { k: 'svg', svg: donutSvg([{ value: 2, color: '#845EF7' }, { value: 1, color: '#22B8CF' }]), width: 120, alt: '' }, { k: 'table', head: ['Área', 'Horas'], rows: [['Saúde e bem-estar', '3 h']] }] }],
      },
      { name: 'Nome', course: 'Curso', module: 'Módulo', period: 'Período', generated: 'Gerado em' },
      fonts,
    );
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    const text = await textOf(bytes);
    for (const s of ['MarTime', 'Relatório semanal', 'Marília', 'Módulo', 'Ação, coração, pão, avó, à, é, ç, ã, õ, ê', 'Saúde e bem-estar']) expect(text).toContain(s);
  }, 30000);

  it('English titles render too', async () => {
    const bytes = await renderPdf({ title: 'Weekly report', name: 'Marília', course: '', module: '', period: '5–11 Oct', generated: '2 October 2026', sections: [{ title: 'Progress', blocks: [{ k: 'p', text: 'Planned vs actual' }] }] }, { name: 'Name', course: 'Course', module: 'Module', period: 'Period', generated: 'Generated' }, fonts);
    const text = await textOf(bytes);
    expect(text).toContain('Weekly report');
    expect(text).toContain('Marília');
  }, 30000);

  it('file name has no accents or spaces', () => {
    expect(pdfFileName('Formação', 'Marília Carlos', '2026-10-02')).toBe('MarTime-Formacao-MariliaCarlos-2026-10-02.pdf');
  });
});
