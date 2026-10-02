/** Neutral report content: rendered on screen (preview) and into the PDF, so both always match. */
export type Block =
  | { k: 'h2'; text: string }
  | { k: 'h3'; text: string }
  | { k: 'p'; text: string; bold?: boolean; muted?: boolean }
  | { k: 'kv'; rows: [string, string][] }
  | { k: 'table'; head: string[]; rows: string[][]; widths?: (number | '*' | 'auto')[] }
  | { k: 'list'; items: string[] }
  | { k: 'svg'; svg: string; width: number; alt: string }
  | { k: 'quote'; label: string; text: string };

export interface ReportDoc {
  title: string;
  /** cover lines */
  name: string;
  course: string;
  module: string;
  period: string;
  generated: string;
  sections: { title: string; blocks: Block[] }[];
}

/** File name without accents or spaces: MarTime-[tipo]-[nome]-[AAAA-MM-DD].pdf */
export function pdfFileName(type: string, name: string, date: string): string {
  const clean = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '');
  const n = clean(name);
  return `MarTime-${clean(type)}${n ? `-${n}` : ''}-${date}.pdf`;
}
