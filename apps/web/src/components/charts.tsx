/**
 * Minimal, accessible charts for the admin dashboard. Single series in the validated chart
 * colour; every chart has a text equivalent (title tooltips and a list or table).
 */
export function DailyColumns({ data, label }: { data: { day: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 640;
  const h = 160;
  const gap = 2;
  const bw = Math.max(2, (w - gap * data.length) / Math.max(1, data.length));
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h + 18}`} className="h-auto w-full" role="img" aria-label={`${label}: daily values`}>
        <line x1="0" x2={w} y1={h} y2={h} stroke="var(--color-line)" strokeWidth="1" />
        {data.map((d, i) => {
          const bh = Math.round((d.value / max) * (h - 8));
          const x = i * (bw + gap);
          return (
            <g key={d.day}>
              <rect x={x} y={h - bh} width={bw} height={Math.max(bh, d.value ? 2 : 0)} rx={Math.min(4, bw / 2)} fill="var(--color-chart)">
                <title>{`${d.day}: ${d.value}`}</title>
              </rect>
              <rect x={x} y={0} width={bw + gap} height={h} fill="transparent"><title>{`${d.day}: ${d.value}`}</title></rect>
            </g>
          );
        })}
        <text x="0" y={h + 14} fontSize="11" fill="var(--color-muted)">{data[0]?.day}</text>
        <text x={w} y={h + 14} fontSize="11" fill="var(--color-muted)" textAnchor="end">{data.at(-1)?.day}</text>
        <text x={w} y="10" fontSize="11" fill="var(--color-muted)" textAnchor="end">max {max}</text>
      </svg>
      <figcaption className="sr-only">{data.map((d) => `${d.day}: ${d.value}`).join("; ")}</figcaption>
    </figure>
  );
}

export function BarList({ rows, empty = "No data yet." }: { rows: { label: string; value: number; note?: string; suppressed?: boolean }[]; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => (r.suppressed ? 0 : r.value)));
  return (
    <ol className="space-y-1.5 text-sm">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
          <div className="min-w-0">
            <p className="truncate" title={r.label}>{r.label}</p>
            <div className="mt-0.5 h-2 rounded-full bg-sand" aria-hidden="true">
              {!r.suppressed ? <div className="h-2 rounded-full bg-[var(--color-chart)]" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} /> : null}
            </div>
          </div>
          <span className="tabular-nums text-ink-soft">{r.suppressed ? "<10" : r.value}{r.note ? ` ${r.note}` : ""}</span>
        </li>
      ))}
    </ol>
  );
}
