import { useEffect, useState } from 'react'
import { autoCloseIfStale, db, init, persistStorage } from './db'
import { History } from './History'
import { Plan } from './Plan'
import { Settings } from './Settings'
import { Stats } from './Stats'
import { Today } from './Today'
import { NowBar, Workout } from './Workout'
import type { ActiveSession } from './types'

type Tab = 'today' | 'plan' | 'stats' | 'history' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [inWorkout, setInWorkout] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [todayKey, setTodayKey] = useState(0)

  const refreshActive = async () => {
    const closed = await autoCloseIfStale()
    const a = (await db.active.get('current')) ?? null
    setSession(a)
    if (closed) { setInWorkout(false); setTodayKey(k => k + 1) }
    return a
  }

  useEffect(() => {
    (async () => {
      try {
        await persistStorage()
        await init()
        const a = await refreshActive()
        setInWorkout(!!a)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
      setReady(true)
    })()
    const onVis = () => { if (document.visibilityState === 'visible') refreshActive() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  if (error) {
    return (
      <div className="app"><div className="screen">
        <h1 className="title">LiftLog couldn't open your data</h1>
        <div className="banner alert">{error}</div>
        <p className="small muted">Nothing has been deleted. Close the app fully and open it again. If this keeps happening, don't clear Safari data: send this message to Claude.</p>
      </div></div>
    )
  }
  if (!ready) return null

  if (session && inWorkout) {
    return (
      <div className="app">
        <Workout session={session} onUpdate={setSession} onBack={() => setInWorkout(false)}
          onExit={() => { setSession(null); setInWorkout(false); setTodayKey(k => k + 1); setTab('today') }} />
      </div>
    )
  }

  return (
    <div className="app">
      {tab === 'today' && <Today key={todayKey} onStart={s => { setSession(s); setInWorkout(true) }} onEditPlan={() => setTab('plan')} />}
      {tab === 'plan' && <Plan />}
      {tab === 'stats' && <Stats />}
      {tab === 'history' && <History />}
      {tab === 'settings' && <Settings />}
      {session && <NowBar session={session} onOpen={() => setInWorkout(true)} />}
      <nav className="nav">
        {(['today', 'plan', 'stats', 'history', 'settings'] as Tab[]).map(t => (
          <button key={t} className={tab === t ? 'active' : ''} onClick={() => { setTab(t); if (t === 'today') setTodayKey(k => k + 1) }}>{t}</button>
        ))}
      </nav>
    </div>
  )
}
