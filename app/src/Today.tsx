import { useEffect, useState } from 'react'
import { db, getPlan, getSetting, setSetting, suggestionFor } from './db'
import { byId, unitSuffix } from './library'
import { KOT_KEY, WARMUP } from './programme'
import { daysBetween, gateText, inRotation, isKneeGated, isoWeekKey, kneeGate, kotLight, lastDone, nextUp, physioFlag, todayStr, type Gate, type Suggestion } from './progression'
import { range, Stepper } from './components'
import type { ActiveSession, KneeCheck, PlanDay } from './types'

export function Today({ onStart, onEditPlan }: { onStart: (s: ActiveSession) => void; onEditPlan: () => void }) {
  const [plan, setPlan] = useState<PlanDay[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [last, setLast] = useState<Map<string, string | null>>(new Map())
  const [gate, setGate] = useState<Gate>('clear')
  const [physio, setPhysio] = useState(false)
  const [swellingDue, setSwellingDue] = useState<KneeCheck | null>(null)
  const [painDue, setPainDue] = useState<KneeCheck | null>(null)
  const [trainedToday, setTrainedToday] = useState(false)
  const [backupMsg, setBackupMsg] = useState<string | null>(null)
  const [autoNote, setAutoNote] = useState<string | null>(null)
  const [sugs, setSugs] = useState<Record<string, Suggestion>>({})
  const [weigh, setWeigh] = useState<{ due: boolean; kg: number }>({ due: false, kg: 88 })
  const [kot, setKot] = useState<{ doneToday: boolean; week: number; light: boolean; why: string | null }>({ doneToday: false, week: 0, light: false, why: null })
  const today = todayStr()

  const load = async () => {
    const [p, sessions, checks] = await Promise.all([getPlan(), db.sessions.toArray(), db.kneeChecks.toArray()])
    setPlan(p)
    const n = nextUp(p, sessions)
    setNext(n?.key ?? null)
    setSelected(s => s ?? n?.key ?? null)
    setLast(lastDone(p, sessions))
    setGate(kneeGate(checks))
    setPhysio(physioFlag(checks))
    const rotationKeys = new Set(p.filter(inRotation).map(d => d.key))
    setTrainedToday(sessions.some(s => s.date === today && rotationKeys.has(s.dayKey)))
    const g = kneeGate(checks)
    const kotSessions = sessions.filter(s => s.dayKey === KOT_KEY)
    const wk0 = isoWeekKey(new Date())
    setKot({
      doneToday: kotSessions.some(s => s.date === today),
      week: new Set(kotSessions.filter(s => isoWeekKey(new Date(s.date + 'T12:00:00')) === wk0).map(s => s.date)).size,
      ...kotLight({ today, sessions, plan: p, gate: g }),
    })
    const sorted = checks.filter(c => c.source !== 'kot').sort((a, b) => (a.sessionDate < b.sessionDate ? -1 : a.sessionDate > b.sessionDate ? 1 : (a.id ?? 0) - (b.id ?? 0)))
    const latest = sorted[sorted.length - 1]
    setPainDue(latest && latest.pain === null ? latest : null)
    setSwellingDue(latest && latest.swelling === null && latest.sessionDate < today ? latest : null)

    const lb = await getSetting('lastBackup')
    if (lb) {
      const d = Math.floor((Date.now() - new Date(lb).getTime()) / 864e5)
      setBackupMsg(d >= 7 ? `Last backup ${d} days ago.` : null)
    } else {
      setBackupMsg((await db.setLogs.count()) > 0 ? 'No backup yet. Your history only exists on this phone.' : null)
    }
    setAutoNote(await getSetting('autoClosedNotice'))

    const wk = isoWeekKey(new Date())
    const body = await db.bodyLog.orderBy('date').toArray()
    const thisWeek = body.some(b => isoWeekKey(new Date(b.date + 'T12:00:00')) === wk)
    const skipped = (await getSetting('weighSkip')) === wk
    setWeigh({ due: !thisWeek && !skipped, kg: body.length ? body[body.length - 1].weightKg : 88 })
  }
  useEffect(() => { load() }, [])

  const day = plan.find(d => d.key === selected) ?? null
  useEffect(() => {
    if (!day) return
    let live = true
    ;(async () => {
      const out: Record<string, Suggestion> = {}
      for (const ex of day.exercises) out[ex.slotId] = await suggestionFor(ex, day.location ?? 'home', today)
      if (live) setSugs(out)
    })()
    return () => { live = false }
  }, [day?.key, plan])

  const answerSwelling = async (v: boolean) => {
    if (!swellingDue?.id) return
    await db.kneeChecks.update(swellingDue.id, { swelling: v })
    await load()
  }
  const answerPain = async (v: number) => {
    if (!painDue?.id) return
    await db.kneeChecks.update(painDue.id, { pain: v })
    const sess = await db.sessions.where('date').equals(painDue.sessionDate).toArray()
    for (const s of sess) if (s.kneePain === null && s.id) await db.sessions.update(s.id, { kneePain: v })
    await load()
  }
  const saveWeight = async (skip: boolean) => {
    if (skip) await setSetting('weighSkip', isoWeekKey(new Date()))
    else {
      const ex = await db.bodyLog.where('date').equals(today).first()
      if (ex?.id) await db.bodyLog.update(ex.id, { weightKg: weigh.kg })
      else await db.bodyLog.add({ date: today, weightKg: weigh.kg })
    }
    setWeigh(w => ({ ...w, due: false }))
  }

  const begin = async (d: PlanDay, opts: { kot?: boolean; light?: boolean } = {}) => {
    const exercises = opts.light ? d.exercises.filter(e => e.light) : d.exercises
    const s: ActiveSession = {
      id: 'current', date: today, dayKey: d.key, title: d.title + (opts.light ? ' (light)' : ''), short: d.short + (opts.light ? ' light' : ''),
      isLegDay: d.isLegDay, location: d.location ?? 'home', exercises, startedTs: Date.now(), exerciseIndex: 0, setIndex: 0,
      logged: [], restEndsTs: null, ...(opts.kot ? { kot: true, light: !!opts.light } : {}),
    }
    await db.active.put(s)
    onStart(s)
  }
  const start = async () => { if (day) await begin(day) }
  const kotPlan = plan.find(d => d.key === KOT_KEY) ?? null
  const rotation = plan.filter(inRotation)

  const ago = (key: string) => {
    const d = last.get(key)
    if (!d) return 'new'
    const n = daysBetween(d, today)
    return n === 0 ? 'today' : `${n}d`
  }
  const gt = gateText(gate)
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const nextDay = plan.find(d => d.key === next)

  return (
    <div className="screen">
      <div className="eyebrow">{dateLabel}</div>
      <h1 className="title">{day ? (day.key === next ? `Next up: ${day.short}` : day.short) : 'LiftLog'}</h1>

      <div className="chiprow" style={{ margin: '4px 0 12px' }}>
        {rotation.map(d => (
          <button key={d.key} className={`chip daychip${selected === d.key ? ' on' : ''}`} onClick={() => setSelected(d.key)}>
            <span>{d.short}{d.key === next ? ' •' : ''}</span>
            <span className="sub">{ago(d.key)}</span>
          </button>
        ))}
      </div>

      {painDue && (
        <div className="banner warn">
          <strong>Knee check:</strong> the {painDue.sessionDate} leg session was closed without a pain score. Pain during it, 0 to 10?
          <div className="painrow">
            {Array.from({ length: 11 }, (_, i) => (
              <button key={i} className={`chip${i > 3 ? ' bad' : i === 3 ? ' warn' : ''}`} onClick={() => answerPain(i)}>{i}</button>
            ))}
          </div>
        </div>
      )}
      {swellingDue && !painDue && (
        <div className="banner warn">
          <strong>Knee check:</strong> any swelling this morning after the {swellingDue.sessionDate} leg session?
          <div className="row">
            <button className="btn" onClick={() => answerSwelling(false)}>No swelling</button>
            <button className="btn" onClick={() => answerSwelling(true)}>Yes, swollen</button>
          </div>
        </div>
      )}
      {gt && !swellingDue && !painDue && (
        <div className={`banner ${gate === 'limit' ? 'warn' : 'alert'}`}>
          <strong>Knee gate:</strong> {gt}
          {physio && <div style={{ marginTop: 6 }}>Knee pain has been 3 or more on your last two leg days. Worth checking with your physio before adding load.</div>}
        </div>
      )}
      {autoNote && (
        <div className="banner warn">
          {autoNote}
          <div className="row"><button className="btn" onClick={async () => { await db.settings.delete('autoClosedNotice'); setAutoNote(null) }}>Got it</button></div>
        </div>
      )}
      {backupMsg && (
        <div className="banner warn"><strong>Backup reminder:</strong> {backupMsg} Export from Settings. Clearing Safari data would wipe everything.</div>
      )}

      {kotPlan && (
        <div className="card kotcard">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <div className="eyebrow">KOT daily{kot.light ? ' · light today' : ''}</div>
            <span className={`chip${kot.doneToday ? ' good' : ''}`}>{kot.doneToday ? 'done today ✓' : `${kot.week} this week`}</span>
          </div>
          <div className="small muted" style={{ margin: '6px 0 10px' }}>
            {(kot.light ? kotPlan.exercises.filter(e => e.light) : kotPlan.exercises).map(e => byId.get(e.exId)?.name.replace(/ \(.*\)/, '') ?? e.exId).join(' · ')}
          </div>
          {kot.why && !kot.doneToday && <div className="small" style={{ marginBottom: 10 }}>{kot.why}</div>}
          <button className={`btn${kot.doneToday ? ' ghost' : ''}`} onClick={() => begin(kotPlan, { kot: true, light: kot.light })}>
            {kot.doneToday ? `Do KOT again${kot.light ? ' (light)' : ''}` : `Start KOT${kot.light ? ' (light)' : ''}`}
          </button>
          {kot.light && <button className="btn ghost" style={{ marginTop: 8, minHeight: 40, fontSize: 14 }} onClick={() => begin(kotPlan, { kot: true })}>Do the full routine anyway</button>}
        </div>
      )}

      {weigh.due && (
        <div className="card">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Weekly weigh-in</div>
          <Stepper small value={weigh.kg.toFixed(1)} unit="kg"
            onMinus={() => setWeigh(w => ({ ...w, kg: Math.round((w.kg - 0.1) * 10) / 10 }))}
            onPlus={() => setWeigh(w => ({ ...w, kg: Math.round((w.kg + 0.1) * 10) / 10 }))} />
          <div className="row" style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn" onClick={() => saveWeight(false)}>Save</button>
            <button className="btn ghost" onClick={() => saveWeight(true)}>Skip this week</button>
          </div>
        </div>
      )}

      {day && (
        <>
          {day.key !== next && nextDay && (
            <p className="muted small" style={{ marginTop: 0 }}>Off rotation. Next up is {nextDay.short}, last done {ago(nextDay.key) === 'new' ? 'never' : `${ago(nextDay.key)} ago`}.</p>
          )}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="eyebrow">Warm-up</div>
              <span className={`chip${day.location === 'gym' ? ' warn' : ''}`}>{day.location === 'gym' ? 'Gym' : 'Home'}</span>
            </div>
            {(day.isLegDay ? WARMUP.leg : WARMUP.upper).map((w, i) => <div key={i} className="small" style={{ padding: '3px 0' }}>• {w}</div>)}
          </div>
          <div className="card flush">
            {day.exercises.map(ex => {
              const lib = byId.get(ex.exId)
              const s = sugs[ex.slotId]
              const gated = isKneeGated(ex, lib)
              return (
                <div key={ex.slotId} className="exrow">
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{lib?.name ?? ex.exId}</div>
                    <div className="muted small num">{ex.sets} × {range(ex.repLo, ex.repHi)}{unitSuffix(lib)}{gated ? ' · knee gated' : ''}</div>
                  </div>
                  <div className="num small" style={{ textAlign: 'right', whiteSpace: 'nowrap', color: s?.tone === 'alert' ? 'var(--bad)' : s?.tone === 'hold' ? 'var(--accent)' : 'var(--ink)' }}>
                    {s ? `${s.weightKg !== null ? `${s.weightKg} kg × ` : ''}${s.reps}${unitSuffix(lib)}` : ''}
                  </div>
                </div>
              )
            })}
          </div>
          <button className="btn primary big" onClick={start}>{trainedToday ? `Train again: ${day.short}` : `Start ${day.short}`}</button>
          <div style={{ height: 8 }} />
          <button className="btn ghost" onClick={onEditPlan}>Edit plan</button>
          {trainedToday && <p className="muted small" style={{ textAlign: 'center' }}>Already logged a session today. Nice.</p>}
        </>
      )}
    </div>
  )
}
