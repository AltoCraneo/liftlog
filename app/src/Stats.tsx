import { useEffect, useMemo, useState } from 'react'
import { db, todayStr } from './db'
import { exName } from './library'
import { KOT_KEY } from './programme'
import { e1rm, isoWeekKey } from './progression'
import { Bars, LineChart, Stepper } from './components'
import type { BodyLog, CompletedSession, KneeCheck, SetLog } from './types'

const WEEKLY_TARGET = 4

export function Stats() {
  const [body, setBody] = useState<BodyLog[]>([])
  const [kg, setKg] = useState(88)
  const [sets, setSets] = useState<SetLog[]>([])
  const [sessions, setSessions] = useState<CompletedSession[]>([])
  const [checks, setChecks] = useState<KneeCheck[]>([])
  const [lift, setLift] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const load = async () => {
    const b = await db.bodyLog.orderBy('date').toArray()
    setBody(b)
    if (b.length) setKg(b[b.length - 1].weightKg)
    setSets((await db.setLogs.toArray()).filter(s => !s.isWarmup))
    setSessions(await db.sessions.toArray())
    setChecks(await db.kneeChecks.toArray())
  }
  useEffect(() => { load() }, [])

  const lifts = useMemo(() => [...new Set(sets.map(s => s.exerciseId))]
    .map(id => ({ id, name: exName(id), n: sets.filter(s => s.exerciseId === id).length }))
    .sort((a, b) => b.n - a.n), [sets])
  useEffect(() => { if (!lift && lifts.length) setLift(lifts[0].id) }, [lifts, lift])

  const liftData = useMemo(() => {
    if (!lift) return { chart: [], recent: [], best: null as SetLog | null, weighted: true }
    const own = sets.filter(s => s.exerciseId === lift).sort((a, b) => a.ts - b.ts)
    const weighted = own.some(s => (s.weightKg ?? 0) > 0)
    const byDate = new Map<string, SetLog[]>()
    for (const s of own) { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date)!.push(s) }
    const score = (s: SetLog) => (weighted ? e1rm(s.weightKg ?? 0, s.reps) : s.reps)
    const chart = [...byDate.entries()].map(([d, ss]) => ({ label: d.slice(5), y: Math.round(Math.max(...ss.map(score)) * 10) / 10 }))
    const recent = [...byDate.entries()].reverse().slice(0, 6).map(([date, ss]) => ({ date, ss }))
    let best: SetLog | null = null
    for (const s of own) if (!best || score(s) > score(best)) best = s
    return { chart, recent, best, weighted }
  }, [sets, lift])

  const weeks = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of sessions) {
      if (s.dayKey === KOT_KEY) continue
      const k = isoWeekKey(new Date(s.date + 'T12:00:00')); counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    const out: { label: string; y: number }[] = []
    for (let i = 7; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i * 7)
      out.push({ label: i === 0 ? 'now' : `-${i}w`, y: counts.get(isoWeekKey(d)) ?? 0 })
    }
    return out
  }, [sessions])

  const kotWeeks = useMemo(() => {
    const days = new Map<string, Set<string>>()
    for (const s of sessions) {
      if (s.dayKey !== KOT_KEY) continue
      const k = isoWeekKey(new Date(s.date + 'T12:00:00'))
      if (!days.has(k)) days.set(k, new Set())
      days.get(k)!.add(s.date)
    }
    const out: { label: string; y: number }[] = []
    for (let i = 7; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i * 7)
      out.push({ label: i === 0 ? 'now' : `-${i}w`, y: days.get(isoWeekKey(d))?.size ?? 0 })
    }
    return out
  }, [sessions])

  // Knee pain on each leg day, next to the heaviest box squat that day.
  const knee = useMemo(() => {
    const byDate = new Map<string, KneeCheck>()
    for (const c of [...checks].filter(c => c.source !== 'kot').sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) byDate.set(c.sessionDate, c)
    const dates = [...byDate.keys()].sort().slice(-10)
    const squat = (d: string) => {
      const ss = sets.filter(s => s.exerciseId === 'box-squat' && s.date === d)
      return ss.length ? Math.max(...ss.map(s => s.weightKg ?? 0)) : null
    }
    return dates.map(d => ({ date: d, pain: byDate.get(d)!.pain, swelling: byDate.get(d)!.swelling, squat: squat(d) }))
  }, [checks, sets])

  const logWeight = async () => {
    const t = todayStr()
    const ex = body.find(b => b.date === t)
    if (ex?.id) await db.bodyLog.update(ex.id, { weightKg: kg })
    else await db.bodyLog.add({ date: t, weightKg: kg })
    setSaved(true); setTimeout(() => setSaved(false), 1500); await load()
  }

  return (
    <div className="screen">
      <div className="eyebrow">Stats</div>
      <h1 className="title">Progress</h1>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Body weight</div>
        {body.length < 3
          ? <p className="muted small">{body.length === 0 ? 'No weigh-ins yet.' : `${body.length} weigh-in${body.length === 1 ? '' : 's'} so far.`} The trend shows from 3. The Today screen asks once a week.</p>
          : <LineChart data={body.slice(-20).map(b => ({ label: b.date.slice(5), y: b.weightKg }))} unit="kg" />}
        <div style={{ marginTop: 8 }}>
          <Stepper small value={kg.toFixed(1)} unit="kg today" onMinus={() => setKg(v => Math.round((v - 0.1) * 10) / 10)} onPlus={() => setKg(v => Math.round((v + 0.1) * 10) / 10)} />
        </div>
        <div style={{ height: 8 }} />
        <button className="btn" onClick={logWeight}>{saved ? 'Saved ✓' : "Log today's weight"}</button>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Knee and box squat</div>
        {knee.length === 0 ? <p className="muted small">Leg days will show here.</p> : (
          <>
            <LineChart height={110} data={knee.filter(k => k.squat !== null).map(k => ({ label: k.date.slice(5), y: k.squat! }))} unit="box squat top kg" />
            <Bars max={10} data={knee.map(k => ({ label: k.date.slice(5), y: k.pain }))}
              colorFor={v => (v > 3 ? 'var(--bad)' : v === 3 ? 'var(--accent)' : 'var(--good)')} />
            <p className="muted small" style={{ margin: 0 }}>Bars: pain 0 to 10 on each leg day. Green is under your limit, gold is at it (3), red is over. {knee.some(k => k.swelling) ? 'Swelling was reported on ' + knee.filter(k => k.swelling).map(k => k.date.slice(5)).join(', ') + '.' : ''}</p>
          </>
        )}
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Strength per lift</div>
        {lifts.length === 0 && <p className="muted small">Log some sessions and your lifts appear here.</p>}
        {lifts.length > 0 && (
          <>
            <div className="chiprow" style={{ paddingBottom: 8 }}>
              {lifts.slice(0, 14).map(l => <button key={l.id} className={`chip${lift === l.id ? ' on' : ''}`} onClick={() => setLift(l.id)}>{l.name}</button>)}
            </div>
            <LineChart data={liftData.chart.slice(-15)} unit={liftData.weighted ? 'e1RM kg' : 'best reps'} />
            {liftData.best && (
              <p className="small" style={{ margin: '4px 0 8px' }}>
                Best: <strong className="num">{liftData.best.weightKg !== null ? `${liftData.best.weightKg} kg × ` : ''}{liftData.best.reps}</strong>
                {liftData.weighted && <span className="muted"> · about {Math.round(e1rm(liftData.best.weightKg ?? 0, liftData.best.reps))} kg 1RM</span>}
                <span className="muted"> · {liftData.best.date}</span>
              </p>
            )}
            {liftData.recent.map(r => (
              <div key={r.date} className="exrow" style={{ padding: '6px 0' }}>
                <span className="muted small num">{r.date}</span>
                <span className="small num">{r.ss.map(s => `${s.weightKg !== null ? s.weightKg + '×' : ''}${s.reps}${s.isPR ? '★' : ''}`).join('  ')}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Sessions per week</div>
        <Bars data={weeks} highlight={WEEKLY_TARGET} />
        <p className="muted small" style={{ margin: 0 }}>Gold weeks hit {WEEKLY_TARGET}, one full rotation. Three is still a solid week. KOT isn't counted here.</p>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 8 }}>KOT days per week</div>
        <Bars data={kotWeeks} highlight={5} max={7} />
        <p className="muted small" style={{ margin: 0 }}>Gold weeks hit 5 or more days. Light days count.</p>
      </div>
    </div>
  )
}
