import { useEffect, useRef, useState } from 'react'
import { db, downloadJSON, exportAll, getEquipment, getPlan, getSetting, importAll, setSetting, todayStr } from './db'
import { BASE_PLATES, DEFAULT_EQUIPMENT, homeBarbellLoads, MICRO_PLATES, type EquipmentProfile } from './equipment'
import { buildReview } from './review'

export const APP_VERSION = 'v5.0 (Oct 2026)'

export function Settings() {
  const [lastBackup, setLastBackup] = useState<string | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [eq, setEq] = useState<EquipmentProfile>(DEFAULT_EQUIPMENT)
  const [msg, setMsg] = useState<string | null>(null)
  const [review, setReview] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getEquipment().then(setEq)
    getSetting('lastBackup').then(setLastBackup)
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [])

  const exportNow = async () => {
    downloadJSON(`liftlog-backup-${todayStr()}.json`, await exportAll())
    const t = new Date().toISOString()
    await setSetting('lastBackup', t); setLastBackup(t)
    setMsg('Backup exported. Save it somewhere off this phone (Files, iCloud, or email it to yourself).')
  }
  const importFile = async (f: File) => {
    if (!confirm('Import replaces everything currently in the app with the backup. Continue?')) return
    try {
      const r = await importAll(JSON.parse(await f.text()))
      setMsg(`Backup restored.${r.planReplaced ? ' It was from the old app, so the 4-day plan was applied and the old plan was archived.' : ''}${r.fixed ? ` ${r.fixed} session${r.fixed === 1 ? '' : 's'} left open were closed at their last set.` : ''}`)
      setEq(await getEquipment())
    } catch (e) {
      setMsg(`Import failed: ${e instanceof Error ? e.message : 'not a valid backup file'}. Nothing was changed.`)
    }
  }
  const makeReview = async () => {
    const [plan, sessions, setLogs, kneeChecks, bodyLog] = await Promise.all([
      getPlan(), db.sessions.toArray(), db.setLogs.toArray(), db.kneeChecks.toArray(), db.bodyLog.toArray(),
    ])
    const text = buildReview({ plan, sessions, setLogs, kneeChecks, bodyLog })
    setReview(text)
    try {
      if (navigator.share) { await navigator.share({ title: 'LiftLog review', text }); return }
    } catch { /* cancelled share sheet: fall back to copy */ }
    try { await navigator.clipboard.writeText(text); setMsg('Review copied. Paste it into your training chat with Claude.') } catch { /* select manually */ }
  }
  const togglePlate = async (p: number) => {
    const has = eq.home.plates.includes(p)
    const plates = (has ? eq.home.plates.filter(x => x !== p) : [...eq.home.plates, p]).sort((a, b) => b - a)
    await setSetting('plates', JSON.stringify(plates))
    setEq({ ...eq, home: { ...eq.home, plates } })
  }
  const setGymDb = async (step: number) => {
    const gym = { ...eq.gym, dbStep: step }
    await setSetting('gymEquipment', JSON.stringify({ dbStep: step }))
    setEq({ ...eq, gym })
  }

  const loads = [...homeBarbellLoads(eq.home.barKg, eq.home.plates).keys()].sort((a, b) => a - b)
  const smallestJump = loads.length > 1 ? Math.min(...loads.slice(1).map((v, i) => v - loads[i])) : 0

  return (
    <div className="screen">
      <div className="eyebrow">Settings</div>
      <h1 className="title">Data and kit</h1>

      <div className="banner alert"><strong>Your data lives only on this phone.</strong> Clearing Safari website data, or iOS reclaiming storage, would wipe all history. Export regularly and keep the file somewhere else.</div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Backup</div>
        <p className="small muted" style={{ marginTop: 0 }}>Last backup: <span className="num">{lastBackup ? new Date(lastBackup).toLocaleString() : 'never'}</span></p>
        <button className="btn primary" onClick={exportNow}>Export everything</button>
        <div style={{ height: 8 }} />
        <button className="btn" onClick={() => file.current?.click()}>Import a backup</button>
        <input ref={file} type="file" accept="application/json,.json" onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} />
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Review with Claude</div>
        <p className="small muted" style={{ marginTop: 0 }}>A short plain-text summary of the last 28 days: sessions, lifts, knee and body weight. Paste it into your training chat once a month.</p>
        <button className="btn" onClick={makeReview}>Export for review</button>
        {review && <textarea className="reviewbox" readOnly value={review} onFocus={e => e.currentTarget.select()} />}
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Home kit</div>
        <p className="small" style={{ marginTop: 0 }}>
          Barbell {eq.home.barKg} kg with plates {BASE_PLATES.map(p => `2×${p}`).join(', ')}{eq.home.plates.filter(p => MICRO_PLATES.includes(p)).map(p => `, 2×${p}`).join('')}.
          Smallest jump <strong>{smallestJump} kg</strong>, heaviest load <strong>{loads[loads.length - 1]} kg</strong>.
        </p>
        <p className="small muted">Bought micro plates? Toggle them on and every suggestion uses them straight away.</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {MICRO_PLATES.map(p => {
            const on = eq.home.plates.includes(p)
            return <button key={p} className={`chip${on ? ' on' : ''}`} onClick={() => togglePlate(p)}>2×{p} kg {on ? '✓' : ''}</button>
          })}
        </div>
        <p className="small muted" style={{ margin: 0 }}>Dumbbells {eq.home.dbMin} to {eq.home.dbMax} kg in {eq.home.dbStep} kg steps. Cable stack {eq.home.cableMin} to {eq.home.cableMax} kg in {eq.home.cableStep} kg steps.</p>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Gym</div>
        <p className="small muted" style={{ marginTop: 0 }}>Used on days set to Gym in the plan. Barbell in 2.5 kg steps, machines and cables in 5 kg steps. Dumbbell steps at your gym:</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {[2, 2.5].map(s => <button key={s} className={`chip${eq.gym.dbStep === s ? ' on' : ''}`} onClick={() => setGymDb(s)}>{s} kg</button>)}
        </div>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>Storage protection</div>
        <p className="small" style={{ margin: 0 }}>
          {persisted === true && <span className="chip good">persistent storage granted</span>}
          {persisted === false && <span className="chip warn">not yet persistent</span>}
          {persisted === null && <span className="chip">status unknown on this browser</span>}
        </p>
        <p className="small muted">Open the app from its home screen icon, not a Safari tab. That gives it more durable storage on iOS and full-screen launch.</p>
      </div>

      <div className="card">
        <div className="eyebrow" style={{ marginBottom: 6 }}>About</div>
        <p className="small muted" style={{ margin: 0 }}>LiftLog {APP_VERSION} · local-first, offline, free. 4-day rotation, double progression, knee gated, plate aware.</p>
      </div>
      {msg && <div className="banner warn">{msg}</div>}
    </div>
  )
}
