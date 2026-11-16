import { useEffect, useState } from 'react'
import { getPlan, getSetting, resetDay, resetWholePlan, restoreArchivedPlan, savePlanDay } from './db'
import { byId, LIBRARY, MUSCLES, unitOf, unitSuffix, type LibraryExercise } from './library'
import { isKneeGated } from './progression'
import { clamp, Field, range } from './components'
import type { PlanDay, PlanExercise } from './types'

let seq = 0
const newSlotId = () => `s${Date.now().toString(36)}${(seq++).toString(36)}`

function slotFor(e: LibraryExercise): PlanExercise {
  return {
    slotId: newSlotId(), exId: e.id, sets: e.defaultSets, repLo: e.defaultRepLo, repHi: e.defaultRepHi,
    restSec: e.defaultRestSec, incrementKg: e.incrementKg, startKg: e.equipment === 'bodyweight' ? null : 10,
  }
}

export function Plan() {
  const [plan, setPlan] = useState<PlanDay[]>([])
  const [key, setKey] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [picker, setPicker] = useState<'add' | 'swap' | null>(null)
  const [hasArchive, setHasArchive] = useState(false)

  const load = async () => {
    const p = await getPlan()
    setPlan(p)
    setKey(k => (k && p.some(d => d.key === k) ? k : p[0]?.key ?? null))
    setHasArchive(!!(await getSetting('planArchive')))
  }
  useEffect(() => { load() }, [])

  const day = plan.find(d => d.key === key) ?? null
  const put = async (d: PlanDay) => { await savePlanDay(d); setPlan(p => p.map(x => (x.dayIndex === d.dayIndex ? d : x))) }
  if (!day) return <div className="screen" />
  const slot = editing !== null ? day.exercises[editing] : null
  const location = day.location ?? 'home'

  if (picker) {
    return (
      <Picker
        similarTo={picker === 'swap' && slot ? byId.get(slot.exId) ?? null : null}
        location={location}
        onCancel={() => setPicker(null)}
        onPick={async e => {
          const d = { ...day, exercises: [...day.exercises] }
          if (picker === 'swap' && editing !== null) {
            const old = d.exercises[editing]
            d.exercises[editing] = {
              ...slotFor(e), sets: old.sets,
              repLo: unitOf(e) !== unitOf(byId.get(old.exId)) ? e.defaultRepLo : old.repLo,
              repHi: unitOf(e) !== unitOf(byId.get(old.exId)) ? e.defaultRepHi : old.repHi, restSec: old.restSec,
            }
          } else d.exercises.push(slotFor(e))
          await put(d)
          setPicker(null)
          if (picker === 'add') setEditing(d.exercises.length - 1)
        }}
      />
    )
  }

  if (slot && editing !== null) {
    const lib = byId.get(slot.exId)
    const unit = ({ reps: 'reps', sec: 'sec', min: 'min' })[unitOf(lib)]
    const patch = (p: Partial<PlanExercise>) => {
      const d = { ...day, exercises: [...day.exercises] }
      d.exercises[editing] = { ...d.exercises[editing], ...p }
      return put(d)
    }
    const move = async (dir: number) => {
      const to = editing + dir
      if (to < 0 || to >= day.exercises.length) return
      const d = { ...day, exercises: [...day.exercises] }
      const [x] = d.exercises.splice(editing, 1)
      d.exercises.splice(to, 0, x)
      await put(d); setEditing(to)
    }
    const remove = async () => {
      if (!confirm(`Remove ${lib?.name ?? 'this exercise'} from ${day.short}?`)) return
      await put({ ...day, exercises: day.exercises.filter((_, i) => i !== editing) }); setEditing(null)
    }
    const gated = isKneeGated(slot, lib)
    return (
      <div className="screen">
        <div className="eyebrow">{day.short} · Edit exercise</div>
        <h1 className="title" style={{ fontSize: 22 }}>{lib?.name ?? slot.exId}</h1>
        {lib && <p className="muted small" style={{ marginTop: 0 }}>{lib.muscle} · {lib.pattern} · {lib.equipment}</p>}
        {slot.note && <p className="small" style={{ marginTop: 0 }}>{slot.note}</p>}
        <Field label="Sets" value={slot.sets} onChange={v => patch({ sets: clamp(v, 1, 8) })} />
        <Field label={`Min ${unit}`} value={slot.repLo} onChange={v => patch({ repLo: clamp(v, 1, Math.min(90, slot.repHi)) })} />
        <Field label={`Max ${unit}`} value={slot.repHi} onChange={v => patch({ repHi: clamp(v, slot.repLo, 90) })} />
        <Field label="Rest (sec)" value={slot.restSec} step={15} onChange={v => patch({ restSec: clamp(v, 15, 300) })} />
        {lib?.equipment !== 'bodyweight' && (
          <Field label="Weight (kg)" value={slot.overrideKg ?? slot.startKg ?? 0} step={lib?.equipment === 'dumbbell' ? 2 : 2.5}
            onChange={v => patch({ overrideKg: Math.max(0, v), overrideTs: Date.now(), startKg: slot.startKg ?? 0 })}
            hint="Used next session (snapped to a load you can build), then progression takes over" />
        )}
        <Field label="Minimum jump (kg)" value={slot.incrementKg} step={0.5} onChange={v => patch({ incrementKg: clamp(v, 0.5, 20) })}
          hint="Progression adds at least this, rounded up to the next load your kit allows" />
        {day.inRotation === false && (
          <button className={`btn${slot.light ? ' primary' : ''}`} style={{ minHeight: 48, marginBottom: 8 }} onClick={() => patch({ light: !slot.light })}>
            {slot.light ? 'In the light version: yes' : 'In the light version: no'}
          </button>
        )}
        <button className={`btn${gated ? ' primary' : ''}`} style={{ minHeight: 48, marginBottom: 8 }} onClick={() => patch({ kneeGated: !gated })}>
          {gated ? 'Knee gated: on' : 'Knee gated: off'}
        </button>
        <button className="btn" onClick={() => setPicker('swap')}>Swap exercise</button>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn ghost" onClick={() => move(-1)} disabled={editing === 0}>Move up</button>
          <button className="btn ghost" onClick={() => move(1)} disabled={editing === day.exercises.length - 1}>Move down</button>
        </div>
        <div style={{ marginTop: 8 }}><button className="btn danger" onClick={remove}>Remove</button></div>
        <div style={{ paddingTop: 16 }}><button className="btn primary big" onClick={() => setEditing(null)}>Done</button></div>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="eyebrow">{day.inRotation === false ? 'Plan · daily, outside the rotation' : 'Plan · 4-day rotation'}</div>
      <h1 className="title" style={{ fontSize: 22 }}>{day.title}</h1>
      <div className="chiprow" style={{ marginBottom: 12 }}>
        {plan.map(d => <button key={d.key} className={`chip${d.key === key ? ' on' : ''}`} onClick={() => { setKey(d.key); setEditing(null) }}>{d.short}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['home', 'gym'] as const).map(l => (
          <button key={l} className={`btn${location === l ? ' primary' : ''}`} style={{ minHeight: 44, fontSize: 15 }} onClick={() => put({ ...day, location: l })}>
            {l === 'home' ? 'Home kit' : 'Gym'}
          </button>
        ))}
      </div>
      <div className="card flush">
        {day.exercises.map((e, i) => {
          const lib = byId.get(e.exId)
          return (
            <button key={e.slotId} style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditing(i)}>
              <div className="exrow">
                <div>
                  <div style={{ fontWeight: 600 }}>{lib?.name ?? e.exId}</div>
                  <div className="muted small num">{e.sets} × {range(e.repLo, e.repHi)}{unitSuffix(lib)} · rest {e.restSec}s{isKneeGated(e, lib) ? ' · knee' : ''}{day.inRotation === false && e.light ? ' · light' : ''}</div>
                </div>
                <div className="muted">›</div>
              </div>
            </button>
          )
        })}
        {day.exercises.length === 0 && <div className="exrow"><span className="muted">Empty day. Add something below.</span></div>}
      </div>
      <button className="btn" onClick={() => { setEditing(null); setPicker('add') }}>+ Add exercise</button>
      <div style={{ height: 8 }} />
      <button className="btn ghost" onClick={async () => {
        if (!confirm(`Reset ${day.short} to the 4-day default? Your edits to this day are lost. History is kept.`)) return
        await resetDay(day.dayIndex); await load()
      }}>Reset this day</button>
      <div style={{ height: 8 }} />
      <button className="btn ghost" onClick={async () => {
        if (!confirm('Reset the whole plan to the 4-day default? History is kept.')) return
        await resetWholePlan(); await load()
      }}>Reset whole plan</button>
      {hasArchive && (
        <>
          <div style={{ height: 8 }} />
          <button className="btn ghost" onClick={async () => {
            if (!confirm('Switch back to the old 6-day plan you had before this update? History is kept.')) return
            await restoreArchivedPlan(); await load()
          }}>Restore the old 6-day plan</button>
        </>
      )}
      <p className="muted small">{day.inRotation === false
        ? 'KOT never counts towards the rotation. The light version runs the day of or after a leg session, or when the knee is flagged.'
        : "Days run in order, whatever the weekday. The Today screen always offers the day you've gone longest without."}</p>
    </div>
  )
}

function Picker({ similarTo, location, onPick, onCancel }: {
  similarTo: LibraryExercise | null; location: 'home' | 'gym'; onPick: (e: LibraryExercise) => void; onCancel: () => void
}) {
  const [muscle, setMuscle] = useState<string>(similarTo ? similarTo.muscle : 'all')
  const [same, setSame] = useState(!!similarTo)
  const [q, setQ] = useState('')
  const pool = LIBRARY.filter(e => location === 'gym' || e.equipment !== 'machine')
  let list = pool
  if (similarTo && same) {
    list = pool.filter(e => e.pattern === similarTo.pattern && e.id !== similarTo.id)
    if (list.length === 0) list = pool.filter(e => e.muscle === similarTo.muscle && e.id !== similarTo.id)
  } else if (muscle !== 'all') list = pool.filter(e => e.muscle === muscle)
  if (q.trim()) list = list.filter(e => e.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="screen">
      <div className="eyebrow">{similarTo ? `Replace ${similarTo.name}` : 'Add exercise'}{location === 'home' ? ' · home kit' : ' · gym'}</div>
      <input className="search" placeholder="Search exercises" value={q} onChange={e => setQ(e.target.value)} />
      <div className="chiprow" style={{ paddingBottom: 8 }}>
        {similarTo && <button className={`chip${same ? ' on' : ''}`} onClick={() => setSame(!same)}>same pattern</button>}
        <button className={`chip${!same && muscle === 'all' ? ' on' : ''}`} onClick={() => { setSame(false); setMuscle('all') }}>all</button>
        {MUSCLES.map(m => <button key={m} className={`chip${!same && muscle === m ? ' on' : ''}`} onClick={() => { setSame(false); setMuscle(m) }}>{m}</button>)}
      </div>
      <div className="card flush">
        {list.map(e => (
          <button key={e.id} style={{ width: '100%', textAlign: 'left' }} onClick={() => onPick(e)}>
            <div className="exrow">
              <div>
                <div style={{ fontWeight: 600 }}>{e.name}</div>
                <div className="muted small">{e.muscle} · {e.pattern}{e.equipment === 'machine' ? ' · gym machine' : ''}{e.kneeGoverned ? ' · knee gated' : ''}</div>
                <div className="muted" style={{ fontSize: 12 }}>{e.cue}</div>
              </div>
            </div>
          </button>
        ))}
        {list.length === 0 && <div className="exrow"><span className="muted">No matches with this kit.</span></div>}
      </div>
      <button className="btn ghost" style={{ marginTop: 8 }} onClick={onCancel}>Cancel</button>
    </div>
  )
}
