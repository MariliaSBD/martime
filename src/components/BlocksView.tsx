import type { Block } from '@/lib/pdf/blocks';

/** On-screen preview of report blocks (same content as the PDF). */
export function BlocksView({ blocks }: { blocks: Block[] }) {
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((b, i) => {
        switch (b.k) {
          case 'h2':
            return (
              <h3 key={i} className="mt-2 text-base font-bold">
                {b.text}
              </h3>
            );
          case 'h3':
            return (
              <h4 key={i} className="mt-1 text-[15px] font-bold">
                {b.text}
              </h4>
            );
          case 'p':
            return (
              <p key={i} className={`text-[15px] ${b.bold ? 'font-semibold' : ''} ${b.muted ? 'text-muted' : ''}`}>
                {b.text}
              </p>
            );
          case 'kv':
            return (
              <dl key={i} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-3 gap-y-1 text-[15px]">
                {b.rows.map(([k, v], j) => (
                  <div key={j} className="contents">
                    <dt className="font-semibold">{k}</dt>
                    <dd className="whitespace-pre-wrap">{v || '—'}</dd>
                  </div>
                ))}
              </dl>
            );
          case 'table':
            return (
              <div key={i} className="overflow-x-auto" tabIndex={0} role="region" aria-label={b.head.join(', ')}>
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-line bg-[#EEF0F6]">
                      {b.head.map((h, j) => (
                        <th key={j} className="px-1 py-1">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-line/60 align-top">
                        {r.map((c, k) => (
                          <td key={k} className="px-1 py-1 whitespace-pre-wrap">
                            {c || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'list':
            return (
              <ul key={i} className="list-disc pl-5 text-[15px]">
                {b.items.map((x, j) => (
                  <li key={j}>{x}</li>
                ))}
              </ul>
            );
          case 'svg':
            return <div key={i} className="max-w-full overflow-hidden" style={{ width: b.width }} aria-hidden dangerouslySetInnerHTML={{ __html: b.svg.replace(/width="\d+"/, 'width="100%"').replace(/height="\d+"/, '') }} />;
          case 'quote':
            return (
              <div key={i} className="rounded-[8px] bg-primary-soft/40 p-2 text-[15px]">
                <p className="font-semibold">{b.label}</p>
                <p className="whitespace-pre-wrap">{b.text || '—'}</p>
              </div>
            );
        }
      })}
    </div>
  );
}
