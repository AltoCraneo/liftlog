import Dexie, { type Table } from 'dexie'
import { DEFAULT_EQUIPMENT, type EquipmentProfile, loadLadder, type Location } from './equipment'
import { byId } from './library'
import { SCHEMA, upgradeData } from './migrate'
import { defaultPlan } from './programme'
import { kneeGate, suggest, todayStr, type Suggestion } from './progression'
import type { ActiveSession, Backup, BodyLog, CompletedSession, KneeCheck, PlanDay, PlanExercise, SetLog, Setting } from './types'

const STORES = {
  setLogs: '++id, date, exerciseId, [exerciseId+date]',
  sessions: '++id, date, dayKey',
  kneeChecks: '++id, sessionDate',
  settings: 'key',
  active: 'id',
  plan: 'dayIndex',
  bodyLog: '++id, date',
}

class LiftLogDB extends Dexie {
  setLogs!: Table<SetLog, number>
  sessions!: Table<CompletedSession, number>
  kneeChecks!: Table<KneeCheck, number>
  settings!: Table<Setting, string>
  active!: Table<ActiveSession, string>
  plan!: Table<PlanDay, number>
  bodyLog!: Table<BodyLog, number>

  constructor() {
    // Same database name and history as the v1 to v4 app, so existing data on the phone carries over.
    super('liftlog')
    const { setLogs, sessions, kneeChecks, settings, active } = STORES
    this.version(1).stores({ setLogs, sessions, kneeChecks, settings, active })
    this.version(2).stores({ setLogs, sessions, kneeChecks, settings, active, plan: STORES.plan })
    this.version(3).stores(STORES)
    this.version(4).stores(STORES).upgrade(async tx => {
      const [plan, sess, logs, sets] = await Promise.all([
        tx.table('plan').toArray(), tx.table('sessions').toArray(), tx.table('setLogs').toArray(), tx.table('settings').toArray(),
      ])
      const r = upgradeData({ plan, sessions: sess, setLogs: logs, settings: sets })
      if (r.planReplaced) {
        await tx.table('plan').clear()
        await tx.table('plan').bulkPut(r.plan)
      }
      for (const s of r.sessions) if (s.autoClosed && s.id !== undefined) await tx.table('sessions').put(s)
      await tx.table('settings').bulkPut(r.settings)
    })
  }
}

export const db = new LiftLogDB()

// ---------- settings ----------
export async function getSetting(key: string): Promise<string | null> {
  return (await db.settings.get(key))?.value ?? null
}
export async function setSetting(key: string, value: string) {
  await db.settings.put({ key, value })
}

export async function getEquipment(): Promise<EquipmentProfile> {
  const p: EquipmentProfile = structuredClone(DEFAULT_EQUIPMENT)
  const plates = await getSetting('plates') // same key the v4 app used for the micro-plate toggle
  if (plates) try { p.home.plates = JSON.parse(plates) } catch { /* keep default */ }
  const gym = await getSetting('gymEquipment')
  if (gym) try { Object.assign(p.gym, JSON.parse(gym)) } catch { /* keep default */ }
  return p
}

export async function init() {
  await db.open()
  if ((await db.plan.count()) === 0) await db.plan.bulkPut(defaultPlan())
  const a = await db.active.get('current')
  if (a && !a.exercises) await db.active.delete('current')
}

export async function persistStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return (await navigator.storage.persisted()) || (await navigator.storage.persist())
  } catch { /* unsupported */ }
  return false
}

// ---------- plan ----------
export const getPlan = async () => (await db.plan.toArray()).sort((a, b) => a.dayIndex - b.dayIndex)
export const savePlanDay = (d: PlanDay) => db.plan.put(d)
export async function resetDay(dayIndex: number) {
  const d = defaultPlan().find(x => x.dayIndex === dayIndex)
  if (d) await db.plan.put(d)
  return d ?? null
}
export async function resetWholePlan() {
  await db.transaction('rw', db.plan, async () => { await db.plan.clear(); await db.plan.bulkPut(defaultPlan()) })
}
export async function restoreArchivedPlan(): Promise<boolean> {
  const raw = await getSetting('planArchive')
  if (!raw) return false
  const { plan } = JSON.parse(raw) as { plan: PlanDay[] }
  await db.transaction('rw', db.plan, async () => { await db.plan.clear(); await db.plan.bulkPut(plan) })
  return true
}

// ---------- suggestions ----------
export async function suggestionFor(slot: PlanExercise, location: Location, excludeDate?: string): Promise<Suggestion> {
  const lib = byId.get(slot.exId)
  const [history, checks, eq] = await Promise.all([
    db.setLogs.where('exerciseId').equals(slot.exId).toArray(),
    db.kneeChecks.toArray(),
    getEquipment(),
  ])
  const ladder = lib ? loadLadder(lib.equipment, location, eq) : null
  return suggest({
    slot, lib, ladder, gate: kneeGate(checks),
    history: history.filter(s => !s.isWarmup && s.date !== excludeDate),
  })
}

// ---------- sessions ----------
export const AUTO_CLOSE_MS = 30 * 60 * 1000
export const AUTO_CLOSE_PAUSED_MS = 3 * 60 * 60 * 1000

export function lastActivity(a: ActiveSession) {
  return Math.max(a.startedTs, ...a.logged.map(l => l.ts))
}

export async function finishSession(a: ActiveSession, kneePain: number | null, opts: { finishedTs?: number; autoClosed?: boolean } = {}) {
  const finishedTs = opts.finishedTs ?? Date.now()
  const pausedMs = (a.pausedMs ?? 0) + (a.pausedAt && !opts.autoClosed ? finishedTs - a.pausedAt : 0)
  await db.transaction('rw', [db.sessions, db.kneeChecks, db.active], async () => {
    await db.sessions.add({
      date: a.date, dayKey: a.dayKey, title: a.title, startedTs: a.startedTs, finishedTs,
      pausedMs: opts.autoClosed ? 0 : pausedMs, kneePain, ...(opts.autoClosed ? { autoClosed: true } : {}),
    })
    if (a.isLegDay) await db.kneeChecks.add({ sessionDate: a.date, pain: kneePain, swelling: null })
    await db.active.delete('current')
  })
}

/** Close a session that was left open. Returns true if it closed one. */
export async function autoCloseIfStale(now = Date.now()): Promise<boolean> {
  const a = await db.active.get('current')
  if (!a || !a.exercises) return false
  const idle = now - (a.pausedAt ?? lastActivity(a))
  const limit = a.pausedAt ? AUTO_CLOSE_PAUSED_MS : AUTO_CLOSE_MS
  if (idle < limit) return false
  if (a.logged.length === 0) { await db.active.delete('current'); return true }
  await finishSession(a, null, { finishedTs: lastActivity(a), autoClosed: true })
  await setSetting('autoClosedNotice', `Your ${a.short} session on ${a.date} was left open, so it was closed at your last set. Logged sets are all kept.`)
  return true
}

// ---------- backup ----------
export async function exportAll(): Promise<Backup> {
  const [setLogs, sessions, kneeChecks, settings, plan, bodyLog] = await Promise.all([
    db.setLogs.toArray(), db.sessions.toArray(), db.kneeChecks.toArray(), db.settings.toArray(), db.plan.toArray(), db.bodyLog.toArray(),
  ])
  return { app: 'liftlog', schema: SCHEMA, exportedAt: new Date().toISOString(), setLogs, sessions, kneeChecks, settings, plan, bodyLog }
}

export async function importAll(raw: unknown): Promise<{ planReplaced: boolean; fixed: number }> {
  const b = raw as Backup
  if (!b || b.app !== 'liftlog' || ![1, 2, 3, 4].includes(b.schema) || !Array.isArray(b.setLogs) || !Array.isArray(b.sessions)) {
    throw new Error('Not a LiftLog backup file')
  }
  let plan = b.plan && b.plan.length ? b.plan : defaultPlan()
  let sessions = b.sessions
  let settings = b.settings ?? []
  let planReplaced = false, fixed = 0
  if (b.schema < SCHEMA) {
    const r = upgradeData({ plan, sessions, setLogs: b.setLogs, settings })
    plan = r.plan; sessions = r.sessions; planReplaced = r.planReplaced; fixed = r.fixed.length
    const keys = new Set(r.settings.map(s => s.key))
    settings = [...settings.filter(s => !keys.has(s.key)), ...r.settings]
  }
  const strip = <T extends { id?: number }>(rows: T[]) => rows.map(({ id: _id, ...rest }) => rest as T)
  await db.transaction('rw', [db.setLogs, db.sessions, db.kneeChecks, db.settings, db.plan, db.bodyLog], async () => {
    await Promise.all([db.setLogs.clear(), db.sessions.clear(), db.kneeChecks.clear(), db.settings.clear(), db.plan.clear(), db.bodyLog.clear()])
    await db.setLogs.bulkAdd(strip(b.setLogs))
    await db.sessions.bulkAdd(strip(sessions))
    await db.kneeChecks.bulkAdd(strip(b.kneeChecks ?? []))
    await db.settings.bulkPut(settings)
    await db.plan.bulkPut(plan)
    if (b.bodyLog?.length) await db.bodyLog.bulkAdd(strip(b.bodyLog))
  })
  return { planReplaced, fixed }
}

export function downloadJSON(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export { todayStr }
