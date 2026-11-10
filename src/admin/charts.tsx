// Small dependency-free SVG bar charts (horizontal bars, labelled values, light/neutral palette).
interface Item { label: string; values: (number | null)[]; note?: string }

export function BarChart({
  items, series, domain, format = (v) => v.toFixed(2), height = 28, title,
}: {
  items: Item[]; series: { name: string; color: string }[]; domain: [number, number]
  format?: (v: number) => string; height?: number; title: string
}) {
  // widen the axis if any value falls outside the requested domain (never clip a bar)
  const vals = items.flatMap((i) => i.values).filter((v): v is number => typeof v === 'number')
  const lo = Math.min(domain[0], ...vals.map((v) => Math.floor(v - 0.5)))
  const hi = Math.max(domain[1], ...vals.map((v) => Math.ceil(v + 0.5)))
  const labelW = 190, chartW = 420, pad = 56
  const rowH = height * series.length + 14
  const W = labelW + chartW + pad
  const x = (v: number) => labelW + ((v - lo) / (hi - lo)) * chartW
  const zero = x(Math.max(lo, Math.min(hi, 0)))
  return (
    <figure className="w-full max-w-2xl">
      <svg viewBox={`0 0 ${W} ${items.length * rowH + 8}`} className="h-auto w-full" role="img" aria-label={title}>
        <line x1={zero} x2={zero} y1={0} y2={items.length * rowH} stroke="#94a3b8" strokeWidth={1} />
        {items.map((it, i) => (
          <g key={it.label} transform={`translate(0 ${i * rowH + 6})`}>
            <text x={labelW - 10} y={(height * series.length) / 2 + 4} textAnchor="end" fontSize={12} fill="#334155">{it.label}</text>
            {series.map((s, k) => {
              const v = it.values[k]
              const y = k * height
              if (v === null || v === undefined) return <text key={s.name} x={zero + 6} y={y + height / 2 + 4} fontSize={11} fill="#94a3b8">no data</text>
              const x0 = Math.min(zero, x(v)), w = Math.abs(x(v) - zero)
              return (
                <g key={s.name}>
                  <rect x={x0} y={y + 2} width={Math.max(w, 1)} height={height - 6} rx={3} fill={s.color} />
                  <text x={v >= 0 ? x0 + w + 6 : x0 - 6} y={y + height / 2 + 3} textAnchor={v >= 0 ? 'start' : 'end'} fontSize={11} fill="#334155">{format(v)}</text>
                </g>
              )
            })}
          </g>
        ))}
      </svg>
      {series.length > 1 && (
        <figcaption className="mt-1 flex gap-4 text-xs text-slate-600">
          {series.map((s) => <span key={s.name} className="inline-flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}
        </figcaption>
      )}
    </figure>
  )
}
