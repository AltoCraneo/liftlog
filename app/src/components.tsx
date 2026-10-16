import type { ReactNode } from 'react'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const range = (lo: number, hi: number) => (lo === hi ? `${lo}` : `${lo}–${hi}`)

export function Stepper({ value, unit, onMinus, onPlus, small }: {
  value: ReactNode; unit: string; onMinus: () => void; onPlus: () => void; small?: boolean
}) {
  return (
    <div className="stepper" style={small ? { gridTemplateColumns: '64px 1fr 64px' } : undefined}>
      <button className="pad" style={small ? { minHeight: 52, fontSize: 24 } : undefined} onClick={onMinus} aria-label={`less ${unit}`}>−</button>
      <div className="value">
        <div className="v num" style={small ? { fontSize: 24 } : undefined}>{value}</div>
        {unit && <div className="u">{unit}</div>}
      </div>
      <button className="pad" style={small ? { minHeight: 52, fontSize: 24 } : undefined} onClick={onPlus} aria-label={`more ${unit}`}>+</button>
    </div>
  )
}

export function Field({ label, value, onChange, step = 1, hint }: {
  label: string; value: number; onChange: (v: number) => void; step?: number; hint?: string
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span className="small" style={{ fontWeight: 600 }}>{label}</span>
        {hint && <span className="muted" style={{ fontSize: 11, textAlign: 'right' }}>{hint}</span>}
      </div>
      <div style={{ marginTop: 6 }}>
        <Stepper small value={value} unit="" onMinus={() => onChange(Math.round((value - step) * 100) / 100)} onPlus={() => onChange(Math.round((value + step) * 100) / 100)} />
      </div>
    </div>
  )
}

export function Chips<T extends string | number>({ items, value, onPick }: {
  items: { key: T; label: ReactNode }[]; value: T | null; onPick: (k: T) => void
}) {
  return (
    <div className="chiprow">
      {items.map(it => (
        <button key={String(it.key)} className={`chip${value === it.key ? ' on' : ''}`} onClick={() => onPick(it.key)}>{it.label}</button>
      ))}
    </div>
  )
}

export function LineChart({ data, unit, height = 140 }: { data: { label: string; y: number }[]; unit: string; height?: number }) {
  if (data.length === 0) return <p className="muted small" style={{ textAlign: 'center', padding: '24px 0' }}>No data yet.</p>
  const W = 320, H = height, pad = 26
  const ys = data.map(d => d.y)
  let lo = Math.min(...ys), hi = Math.max(...ys)
  if (lo === hi) { lo -= 1; hi += 1 }
  const x = (i: number) => (data.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (data.length - 1))
  const y = (v: number) => H - pad - ((v - lo) * (H - 2 * pad)) / (hi - lo)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label={`${unit} chart`}>
      <text x={2} y={y(hi) + 4} fill="var(--muted)" fontSize="10">{fmt(hi)}</text>
      <text x={2} y={y(lo) + 4} fill="var(--muted)" fontSize="10">{fmt(lo)}</text>
      <line x1={pad} y1={y(lo)} x2={W - pad} y2={y(lo)} stroke="var(--line)" strokeWidth="1" />
      {data.length > 1 && <polyline points={data.map((d, i) => `${x(i)},${y(d.y)}`).join(' ')} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" />}
      {data.map((d, i) => <circle key={i} cx={x(i)} cy={y(d.y)} r="3.5" fill="var(--accent)" />)}
      <text x={pad} y={H - 6} fill="var(--muted)" fontSize="10">{data[0].label}</text>
      <text x={W - pad} y={H - 6} fill="var(--muted)" fontSize="10" textAnchor="end">{data[data.length - 1].label}</text>
      <text x={W - 2} y={12} fill="var(--muted)" fontSize="10" textAnchor="end">{unit}</text>
    </svg>
  )
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

export function Bars({ data, highlight, max, colorFor }: {
  data: { label: string; y: number | null }[]; highlight?: number; max?: number; colorFor?: (y: number) => string
}) {
  const top = max ?? Math.max(6, ...data.map(d => d.y ?? 0))
  const W = 320, inner = W - 36, bw = inner / data.length - 6
  return (
    <svg viewBox={`0 0 ${W} 110`} style={{ width: '100%', height: 'auto' }}>
      {data.map((d, i) => {
        const v = d.y ?? 0
        const h = (v / top) * 74
        const x = 18 + i * (inner / data.length)
        const fill = d.y === null ? 'none' : colorFor ? colorFor(v) : highlight !== undefined && v >= highlight ? 'var(--accent)' : 'var(--line)'
        return (
          <g key={i}>
            <rect x={x} y={92 - h} width={bw} height={Math.max(h, 2)} rx="3" fill={fill} stroke={d.y === null ? 'var(--line)' : 'none'} strokeDasharray={d.y === null ? '2 2' : undefined} />
            <text x={x + bw / 2} y={106} fill="var(--muted)" fontSize="9" textAnchor="middle">{d.label}</text>
            {d.y !== null && <text x={x + bw / 2} y={92 - h - 4} fill="var(--muted)" fontSize="9" textAnchor="middle">{d.y}</text>}
          </g>
        )
      })}
    </svg>
  )
}
