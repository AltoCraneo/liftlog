import { useEffect, useRef, useState } from 'react'
import { autoCloseIfStale, db, finishSession, getEquipment, suggestionFor } from './db'
import { DEFAULT_EQUIPMENT, loadLadder, platesPerSide, platesText, snap, stepDown, stepUp, type EquipmentProfile } from './equipment'
import { byId } from './library'
import { isKneeGated, isPR, type Suggestion } from './progression'
import { range, Stepper } from './components'
import type { ActiveSession, LoggedSet } from './types'

export function elapsedMs(s: ActiveSession, now: number) {
  const end = s.pausedAt ? s.pausedAt : now
  return Math.max(0, end - s.startedTs - (s.pausedMs ?? 0))
}

type View = 'none' | 'summary' | 'knee'

export function Workout({ session, onUpdate, onBack, onExit }: {
  session: ActiveSession
  onUpdate: (s: ActiveSession) => void
  onBack: () => void
  onExit: () => void
}) {
  const slot = session.exercises[session.exerciseIndex]
  const lib = slot ? byId.get(slot.exId) : undefined
  const done = !slot
  const location = session.location ?? 'home'
  const [weight, setWeight] = useState<number | null>(null)
  const [reps, setReps] = useState(0)
  const [sug, setSug] = useState<Suggestion | null>(null)
  const [lastText, setLastText] = useState<string | null>(null)
  const [prFlash, setPrFlash] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [view, setView] = useState<View>('none')
  const [pain, setPain] = useState(0)
  const [overview, setOverview] = useState(false)
  const [menu, setMenu] = useState(false)
  const [eq, setEq] = useState<EquipmentProfile>(DEFAULT_EQUIPMENT)
  const wake = useRef<WakeLockSentinel | null>(null)
  const audio = useRef<AudioContext | null>(null)
  const prevLeft = useRef(0)
  const busy = useRef(false)
  // Armed by a logged set, disarmed by any deliberate step after it (skip rest, jump, next exercise).
  // A second identical tap while still armed and within 5 s is a double tap, not a set.
  const guard = useRef(false)

  const ladder = lib ? loadLadder(lib.equipment, location, eq) : null

  const unlockAudio = () => {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!audio.current) audio.current = new AC()
      if (audio.current.state === 'suspended') audio.current.resume()
    } catch { /* no audio */ }
  }
  const beep = () => {
    const ctx = audio.current
    if (!ctx) return
    try {
      for (let i = 0; i < 3; i++) {
        const t = ctx.currentTime + i * 0.28
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.frequency.value = 880; o.connect(g); g.connect(ctx.destination)
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18)
        o.start(t); o.stop(t + 0.2)
      }
    } catch { /* ignore */ }
  }

  useEffect(() => {
    getEquipment().then(setEq)
    const lock = async () => { try { wake.current = (await navigator.wakeLock?.request('screen')) ?? null } catch { /* unsupported */ } }
    lock()
    const vis = () => { if (document.visibilityState === 'visible') lock() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); wake.current?.release?.() }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    // A session left open closes itself 30 minutes after the last set.
    const stale = setInterval(async () => { if (await autoCloseIfStale()) onExit() }, 30000)
    return () => { clearInterval(t); clearInterval(stale) }
  }, [])

  useEffect(() => {
    if (!slot) return
    ;(async () => {
      const s = await suggestionFor(slot, location, session.date)
      setSug(s)
      const hist = (await db.setLogs.where('exerciseId').equals(slot.exId).sortBy('ts')).filter(l => !l.isWarmup && l.date !== session.date)
      if (hist.length) {
        const d = hist[hist.length - 1].date
        setLastText(`Last (${d}): ` + hist.filter(l => l.date === d).map(l => `${l.weightKg ?? '–'}×${l.reps}`).join(', '))
      } else setLastText(null)
      const mine = session.logged.filter(l => l.exerciseId === slot.exId && !l.isWarmup)
      if (mine.length) { setWeight(mine[mine.length - 1].weightKg); setReps(mine[mine.length - 1].reps) }
      else { setWeight(s.weightKg); setReps(s.reps) }
    })()
  }, [session.exerciseIndex, slot?.exId])

  const save = async (s: ActiveSession) => { await db.active.put(s); onUpdate({ ...s }) }
  const workCount = (exId: string) => session.logged.filter(l => l.exerciseId === exId && !l.isWarmup).length

  const logSet = async (warm: boolean) => {
    if (!slot || busy.current) return
    const last = session.logged[session.logged.length - 1]
    // Double-tap guard: an identical set within 5 seconds is the same tap twice.
    if (guard.current && last && last.exerciseId === slot.exId && last.weightKg === weight && last.reps === reps && !!last.isWarmup === warm && Date.now() - last.ts < 5000) return
    const count = workCount(slot.exId)
    if (!warm && count >= slot.sets + 1 && !confirm(`That's set ${count + 1} of a planned ${slot.sets}. Log another one?`)) return
    if (!warm && weight !== null && sug?.weightKg != null && isKneeGated(slot, lib)) {
      const ceiling = stepUp(ladder, sug.weightKg) ?? sug.weightKg
      if (weight > ceiling && !confirm(`${weight} kg is more than one step above today's knee gated target of ${sug.weightKg} kg. Log it anyway?`)) return
    }
    busy.current = true
    try {
      unlockAudio()
      const history = await db.setLogs.where('exerciseId').equals(slot.exId).toArray()
      const pr = warm ? false : isPR(history, weight, reps)
      const entry: LoggedSet = { exerciseId: slot.exId, setIndex: warm ? count : session.setIndex, weightKg: weight, reps, isPR: pr, isWarmup: warm, ts: Date.now() }
      await db.setLogs.add({ date: session.date, dayKey: session.dayKey, ...entry })
      if (pr) { setPrFlash(true); setTimeout(() => setPrFlash(false), 1600) }
      let next: ActiveSession
      if (warm) next = { ...session, logged: [...session.logged, entry], restEndsTs: Date.now() + 60_000 }
      else {
        const n = count + 1
        const finished = n >= slot.sets
        next = {
          ...session, logged: [...session.logged, entry],
          setIndex: finished ? 0 : n,
          exerciseIndex: finished ? session.exerciseIndex + 1 : session.exerciseIndex,
          restEndsTs: Date.now() + slot.restSec * 1000,
        }
      }
      guard.current = true
      await save(next)
    } finally { busy.current = false }
  }

  const jump = async (i: number) => {
    const ex = session.exercises[i]
    guard.current = false
    await save({ ...session, exerciseIndex: i, setIndex: workCount(ex.exId), restEndsTs: null })
    setOverview(false); setView('none')
  }
  const skipRest = () => { guard.current = false; return save({ ...session, restEndsTs: null }) }
  const skipExercise = () => { guard.current = false; return save({ ...session, setIndex: 0, exerciseIndex: session.exerciseIndex + 1, restEndsTs: null }) }
  const pause = async () => {
    const left = session.restEndsTs ? Math.max(0, session.restEndsTs - Date.now()) : null
    await save({ ...session, pausedAt: Date.now(), restLeftMsPaused: left, restEndsTs: null })
    setMenu(true)
  }
  const resume = async () => {
    const pausedMs = (session.pausedMs ?? 0) + (Date.now() - (session.pausedAt ?? Date.now()))
    await save({ ...session, pausedAt: null, pausedMs, restEndsTs: session.restLeftMsPaused ? Date.now() + session.restLeftMsPaused : null, restLeftMsPaused: null })
    setMenu(false)
  }
  const finish = async (kneePain: number | null) => { await finishSession(session, kneePain); onExit() }
  const discard = async () => {
    if (!confirm('Stop and discard this session? Sets already logged are kept in history.')) return
    await db.active.delete('current'); onExit()
  }

  const mins = Math.floor(elapsedMs(session, now) / 60000)

  if (menu || session.pausedAt) {
    return (
      <div className="screen fullbleed">
        <div className="eyebrow">{session.short} · {session.pausedAt ? 'Paused' : 'Menu'}</div>
        <h1 className="title">{session.pausedAt ? 'Paused' : 'What now?'}</h1>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="num" style={{ fontSize: 44, fontWeight: 800 }}>{mins} min</div>
          <div className="muted small">{session.pausedAt ? 'clock stopped' : 'elapsed'} · {session.logged.length} sets logged</div>
        </div>
        {session.pausedAt
          ? <button className="btn primary big" onClick={resume}>Resume workout</button>
          : <button className="btn primary big" onClick={() => setMenu(false)}>Back to workout</button>}
        <div style={{ height: 8 }} />
        {!session.pausedAt && <><button className="btn" onClick={pause}>Pause (stop the clock)</button><div style={{ height: 8 }} /></>}
        <button className="btn" onClick={async () => { if (session.pausedAt) await resume(); setMenu(false); setView('summary') }}>Finish session now</button>
        <div style={{ height: 8 }} />
        <button className="btn danger" onClick={discard}>Stop and discard</button>
        <p className="muted small">A session left without a logged set for 30 minutes closes itself at the last set. A paused one closes after 3 hours.</p>
      </div>
    )
  }

  if (overview) {
    return (
      <div className="screen fullbleed">
        <div className="eyebrow">{session.short} · Session overview</div>
        <h1 className="title" style={{ fontSize: 22 }}>Jump to any exercise</h1>
        <div className="card flush">
          {session.exercises.map((ex, i) => {
            const l = byId.get(ex.exId)
            const n = workCount(ex.exId)
            const tag = i === session.exerciseIndex ? '● now' : n >= ex.sets ? '✓ done' : n > 0 ? `${n}/${ex.sets}` : ''
            return (
              <button key={ex.slotId} style={{ width: '100%', textAlign: 'left' }} onClick={() => jump(i)}>
                <div className="exrow">
                  <div>
                    <div style={{ fontWeight: 600 }}>{l?.name ?? ex.exId}</div>
                    <div className="muted small num">{ex.sets} × {range(ex.repLo, ex.repHi)}{l?.isometric ? 's' : ''} · rest {ex.restSec}s</div>
                  </div>
                  <div className="small" style={{ color: n >= ex.sets ? 'var(--good)' : i === session.exerciseIndex ? 'var(--accent)' : 'var(--muted)' }}>{tag}</div>
                </div>
              </button>
            )
          })}
        </div>
        <p className="muted small">Tap a finished exercise to add extra sets.</p>
        <button className="btn big" onClick={() => setOverview(false)}>Close</button>
      </div>
    )
  }

  if (done || view !== 'none') {
    if (session.isLegDay && view === 'knee') {
      return (
        <div className="screen fullbleed">
          <div className="eyebrow">Knee check</div>
          <h1 className="title">Pain during the session?</h1>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="num" style={{ fontSize: 64, fontWeight: 800, color: pain > 3 ? 'var(--bad)' : pain === 3 ? 'var(--accent)' : 'var(--ink)' }}>{pain}</div>
            <input className="slider" type="range" min={0} max={10} value={pain} onChange={e => setPain(Number(e.target.value))} aria-label="knee pain" />
            <div className="muted small">0 = nothing · 3 = the limit · 10 = worst</div>
          </div>
          <button className="btn primary big" onClick={() => finish(pain)}>Save and finish</button>
          <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => setView('summary')}>Back</button>
          <p className="muted small">At 3, knee gated lifts keep their load next time. Above 3, or swelling tomorrow morning, they repeat last session. Twice in a row, they drop a step.</p>
        </div>
      )
    }
    const prs = session.logged.filter(l => l.isPR).length
    return (
      <div className="screen fullbleed">
        <div className="eyebrow">{session.short}</div>
        <h1 className="title">{done ? 'Session complete' : 'Finish session?'}</h1>
        <div className="card">
          <div className="exrow" style={{ padding: '8px 0' }}><span className="muted">Duration</span><span className="num">{mins} min</span></div>
          <div className="exrow" style={{ padding: '8px 0' }}><span className="muted">Sets logged</span><span className="num">{session.logged.length}</span></div>
          <div className="exrow" style={{ padding: '8px 0' }}><span className="muted">PRs</span><span className="num">{prs}</span></div>
        </div>
        <button className="btn primary big" onClick={() => (session.isLegDay ? setView('knee') : finish(null))}>{session.isLegDay ? 'Knee check and finish' : 'Finish'}</button>
        <div style={{ height: 8 }} />
        <button className="btn ghost" onClick={() => { setView('none'); setOverview(true) }}>Keep training: add sets</button>
      </div>
    )
  }

  const left = session.restEndsTs ? Math.max(0, Math.ceil((session.restEndsTs - now) / 1000)) : 0
  if (prevLeft.current > 0 && left === 0) beep()
  prevLeft.current = left

  if (session.restEndsTs && left > 0) {
    const frac = Math.min(1, left / slot.restSec)
    const R = 90, C = 2 * Math.PI * R
    return (
      <div className="screen fullbleed">
        <TopBar session={session} mins={mins} onBack={onBack} onOverview={() => setOverview(true)} onMenu={() => setMenu(true)} />
        <div className="rest">
          <div className="ring">
            <svg width="200" height="200" viewBox="0 0 200 200">
              <circle cx="100" cy="100" r={R} fill="none" stroke="var(--line)" strokeWidth="10" />
              <circle cx="100" cy="100" r={R} fill="none" stroke="var(--accent)" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} />
            </svg>
            <div className="t"><div className="s num">{left}</div><div className="lbl">seconds</div></div>
          </div>
          {prFlash && <div className="pr-flash" style={{ marginTop: 16 }}>★ New PR</div>}
          <p className="muted" style={{ marginTop: 16, textAlign: 'center' }}>
            Next: <strong style={{ color: 'var(--ink)' }}>{lib?.name}</strong>, set {session.setIndex + 1} of {slot.sets}
            {weight !== null && <><br /><span className="num">{weight} kg × {reps}</span></>}
          </p>
        </div>
        <button className="btn big" onClick={skipRest}>Skip rest</button>
      </div>
    )
  }

  const count = workCount(slot.exId)
  const extra = count >= slot.sets
  const plates = weight !== null && lib?.equipment === 'barbell' ? platesPerSide(weight, location, eq) : null
  const bump = (dir: 1 | -1) => setWeight(w => {
    if (w === null) return dir > 0 ? (ladder ? ladder[0] : slot.incrementKg) : null
    if (!ladder) return Math.max(0, Math.round((w + dir * slot.incrementKg) * 100) / 100)
    const base = snap(ladder, w)
    return (dir > 0 ? stepUp(ladder, base) : stepDown(ladder, base)) ?? base
  })

  return (
    <div className="screen fullbleed">
      <TopBar session={session} mins={mins} onBack={onBack} onOverview={() => setOverview(true)} onMenu={() => setMenu(true)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <div className="eyebrow">{session.short} · {session.exerciseIndex + 1}/{session.exercises.length}</div>
        <div className="setdots">{Array.from({ length: slot.sets }).map((_, i) => <span key={i} className={i < count ? 'done' : ''} />)}</div>
      </div>
      <h1 className="title">{lib?.name ?? slot.exId}</h1>
      <p className="muted small" style={{ marginTop: 0 }}>
        {extra ? 'Extra set' : `Set ${Math.min(count + 1, slot.sets)} of ${slot.sets}`}{lib?.perSide ? ' · each side' : ''} · target {range(slot.repLo, slot.repHi)}{lib?.isometric ? ' sec' : ' reps · RIR 1 to 2'}
      </p>
      {sug && !extra && <div className={`banner ${sug.tone === 'alert' ? 'alert' : 'warn'}`} style={{ fontSize: 13 }}>{sug.reason}</div>}
      {weight !== null && (
        <div style={{ marginBottom: 6 }}>
          <Stepper value={weight} unit={`kg${ladder && lib?.equipment !== 'barbell' ? ` · ${location === 'gym' ? 'gym' : 'home'} steps` : ''}`} onMinus={() => bump(-1)} onPlus={() => bump(1)} />
        </div>
      )}
      {weight !== null && lib?.equipment === 'barbell' && (
        <p className="small num" style={{ margin: '0 0 8px', color: plates ? 'var(--muted)' : 'var(--accent)' }}>
          {plates ? `Per side: ${platesText(plates)}` : `Can't build ${weight} kg with your plates. Use + or − to pick a load you can.`}
        </p>
      )}
      <Stepper value={reps} unit={lib?.isometric ? 'seconds' : 'reps'} onMinus={() => setReps(r => Math.max(0, r - 1))} onPlus={() => setReps(r => r + 1)} />
      {prFlash && <div className="pr-flash" style={{ textAlign: 'center', marginTop: 10 }}>★ New PR</div>}
      <div style={{ marginTop: 14 }}><button className="btn primary big" onClick={() => logSet(false)}>Log set</button></div>
      <div style={{ marginTop: 8 }}><button className="btn ghost" onClick={() => logSet(true)}>Log as warm-up set</button></div>
      {count > 0 && <p className="muted small" style={{ marginTop: 8, marginBottom: 0 }}>Numbers carry over from your last set, so the same again is one tap.</p>}
      {lastText && <p className="muted small num" style={{ marginTop: 10, marginBottom: 0 }}>{lastText}</p>}
      {slot.note && <p className="small" style={{ marginTop: 6, marginBottom: 0 }}>{slot.note}</p>}
      <p className="muted small" style={{ marginTop: 6 }}>{lib?.cue}</p>
      <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 16 }}>
        <button className="btn ghost" onClick={skipExercise}>Skip exercise</button>
        <button className="btn ghost" onClick={() => setView('summary')}>Finish</button>
      </div>
    </div>
  )
}

function TopBar({ session, mins, onBack, onOverview, onMenu }: {
  session: ActiveSession; mins: number; onBack: () => void; onOverview: () => void; onMenu: () => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button className="chip" onClick={onBack}>‹ app</button>
      <button className="chip" onClick={onOverview}>exercises</button>
      <span style={{ flex: 1 }} />
      <span className="chip num">{session.location === 'gym' ? 'gym · ' : ''}{mins} min</span>
      <button className="chip" onClick={onMenu} aria-label="menu">⋯</button>
    </div>
  )
}

export function NowBar({ session, onOpen }: { session: ActiveSession; onOpen: () => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t) }, [])
  const mins = Math.floor(elapsedMs(session, now) / 60000)
  const left = session.restEndsTs ? Math.max(0, Math.ceil((session.restEndsTs - now) / 1000)) : 0
  return (
    <button className="nowbar" onClick={onOpen}>
      <span className="dot" />
      <span style={{ fontWeight: 700 }}>{session.short}</span>
      <span className="muted small">{session.pausedAt ? 'paused' : `${mins} min`}</span>
      <span style={{ flex: 1 }} />
      {left > 0 && <span className="num" style={{ color: 'var(--accent)', fontWeight: 800 }}>rest {left}s</span>}
      <span className="muted">›</span>
    </button>
  )
}
