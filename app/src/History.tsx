import { useEffect, useState } from 'react'
import { db } from './db'
import { exName } from './library'
import { isPR } from './progression'
import { Stepper } from './components'
import type { CompletedSession, SetLog } from './types'

export function History() {
  const [sessions, setSessions] = useState<CompletedSession[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [sets, setSets] = useState<SetLog[]>([])
  const [edit, setEdit] = useState<SetLog | null>(null)
  const [w, setW] = useState(0)
  const [r, setR] = useState(0)

  const loadSessions = async () => setSessions((await db.sessions.orderBy('date').reverse().toArray()))
  useEffect(() => { loadSessions() }, [])

  const loadSets = async (s: CompletedSession) => {
    const all = await db.setLogs.where('date').equals(s.date).toArray()
    setSets(all.filter(l => l.dayKey === s.dayKey).sort((a, b) => a.ts - b.ts))
  }
  const toggle = async (s: CompletedSession) => {
    if (open === s.id) { setOpen(null); return }
    await loadSets(s); setOpen(s.id ?? null)
  }
  const reload = async () => { const s = sessions.find(x => x.id === open); if (s) await loadSets(s) }

  const saveEdit = async () => {
    if (!edit?.id) return
    const weight = edit.weightKg === null ? null : w
    const others = (await db.setLogs.where('exerciseId').equals(edit.exerciseId).toArray()).filter(x => x.id !== edit.id)
    await db.setLogs.update(edit.id, { weightKg: weight, reps: r, isPR: edit.isWarmup ? false : isPR(others, weight, r) })
    await reload(); setEdit(null)
  }
  const deleteSet = async () => {
    if (!edit?.id || !confirm('Delete this set from history?')) return
    await db.setLogs.delete(edit.id); await reload(); setEdit(null)
  }
  const deleteSession = async (s: CompletedSession) => {
    if (!s.id || !confirm(`Delete the ${s.date} ${s.title} session and all its sets? This can't be undone.`)) return
    const own = (await db.setLogs.where('date').equals(s.date).toArray()).filter(l => l.dayKey === s.dayKey)
    await db.setLogs.bulkDelete(own.map(l => l.id!).filter(Boolean))
    await db.sessions.delete(s.id)
    setOpen(null); await loadSessions()
  }

  if (edit) {
    return (
      <div className="screen">
        <div className="eyebrow">Edit set · {edit.date}</div>
        <h1 className="title" style={{ fontSize: 22 }}>{exName(edit.exerciseId)}</h1>
        {edit.isWarmup && <p className="muted small">Warm-up set. Never counts for PRs or progression.</p>}
        {edit.weightKg !== null && (
          <div style={{ marginBottom: 10 }}>
            <Stepper value={w} unit="kg · ±0.5" onMinus={() => setW(v => Math.max(0, Math.round((v - 0.5) * 100) / 100))} onPlus={() => setW(v => Math.round((v + 0.5) * 100) / 100)} />
          </div>
        )}
        <Stepper value={r} unit="reps / sec" onMinus={() => setR(v => Math.max(0, v - 1))} onPlus={() => setR(v => v + 1)} />
        <div style={{ marginTop: 14 }}><button className="btn primary big" onClick={saveEdit}>Save changes</button></div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="btn danger" onClick={deleteSet}>Delete set</button>
          <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
        </div>
        <p className="muted small">PR stars recalculate after edits.</p>
      </div>
    )
  }

  return (
    <div className="screen">
      <div className="eyebrow">History</div>
      <h1 className="title">Sessions</h1>
      {sessions.length === 0 && <div className="card"><p className="muted" style={{ margin: 0 }}>Nothing logged yet. Your first session will appear here.</p></div>}
      {sessions.map(s => {
        const mins = Math.round((s.finishedTs - s.startedTs - (s.pausedMs ?? 0)) / 60000)
        const isOpen = open === s.id
        return (
          <div key={s.id} className="card flush">
            <button style={{ width: '100%', textAlign: 'left' }} onClick={() => toggle(s)}>
              <div className="exrow" style={{ borderBottom: isOpen ? '1px solid var(--line)' : 'none' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{s.title}</div>
                  <div className="muted small num">
                    {s.date} · {mins} min{s.autoClosed ? ' (auto-closed)' : ''}{s.kneePain !== null && s.kneePain !== undefined ? ` · knee ${s.kneePain}/10` : ''}
                  </div>
                </div>
                <div className="muted">{isOpen ? '▾' : '▸'}</div>
              </div>
            </button>
            {isOpen && (
              <div style={{ padding: '4px 0' }}>
                {sets.map(l => (
                  <button key={l.id} style={{ width: '100%', textAlign: 'left' }} onClick={() => { setEdit(l); setW(l.weightKg ?? 0); setR(l.reps) }}>
                    <div className="exrow" style={{ padding: '8px 16px', borderBottom: 'none' }}>
                      <span className="small">{exName(l.exerciseId)}{l.isWarmup ? ' (warm-up)' : ''}</span>
                      <span className="small num">{l.weightKg !== null ? `${l.weightKg} kg × ` : ''}{l.reps}{l.isPR ? ' ★' : ''} <span className="muted">✎</span></span>
                    </div>
                  </button>
                ))}
                {sets.length === 0 && <div className="exrow"><span className="muted small">No sets recorded.</span></div>}
                <div style={{ padding: '8px 16px 12px' }}>
                  <button className="btn ghost" style={{ minHeight: 40, fontSize: 14 }} onClick={() => deleteSession(s)}>Delete this session</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <p className="muted small">Tap any set to edit or delete it.</p>
    </div>
  )
}
