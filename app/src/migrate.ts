// Upgrade from the v4 app (6-day plan, schema 3) to v5 (4-day rotation, schema 4).
// Used twice: by the on-phone database upgrade, and when importing an older backup.
// Pure function: plain arrays in, plain arrays out.
import { defaultPlan, KOT_KEY, kotDay, PLAN_VERSION } from './programme'
import type { CompletedSession, PlanDay, SetLog, Setting } from './types'

export const SCHEMA = 5
export const MAX_SESSION_MS = 3 * 60 * 60 * 1000 // anything longer was left open by accident
const GAP_MS = 30 * 60 * 1000

export interface UpgradeInput {
  plan: PlanDay[]
  sessions: CompletedSession[]
  setLogs: SetLog[]
  settings: Setting[]
}

export interface UpgradeResult {
  plan: PlanDay[]
  planReplaced: boolean
  kotAdded: boolean
  sessions: CompletedSession[]
  fixed: { id?: number; date: string; dayKey: string; fromMin: number; toMin: number }[]
  settings: Setting[] // settings to put (added or changed)
}

export const isV5Plan = (plan: PlanDay[]) => plan.some(d => d.key === 'upper-a') && plan.filter(d => d.inRotation !== false).every(d => d.dayIndex <= 4)

/** Add the KOT day if the plan has none. Every other day is left exactly as it is. */
export function ensureKot(plan: PlanDay[]): { plan: PlanDay[]; added: boolean } {
  if (plan.some(d => d.key === KOT_KEY)) return { plan, added: false }
  const next = Math.max(0, ...plan.map(d => d.dayIndex)) + 1
  return { plan: [...plan, kotDay(next)], added: true }
}

export function sessionMinutes(s: CompletedSession) {
  return Math.round((s.finishedTs - s.startedTs - (s.pausedMs ?? 0)) / 60000)
}

/** Close sessions that were left open: finish time becomes the last set logged in them. */
export function fixLongSessions(sessions: CompletedSession[], setLogs: SetLog[]) {
  const fixed: UpgradeResult['fixed'] = []
  const out = sessions.map(s => {
    if (s.finishedTs - s.startedTs - (s.pausedMs ?? 0) <= MAX_SESSION_MS) return s
    const own = setLogs
      .filter(l => l.date === s.date && l.dayKey === s.dayKey && l.ts >= s.startedTs && l.ts <= s.finishedTs)
      .map(l => l.ts).sort((a, b) => a - b)
    // The workout ended at the last set before the first long gap. A set tapped hours later
    // (reopening the app the next day) doesn't extend it.
    let lastTs = s.startedTs
    for (const ts of own) {
      if (ts - lastTs > GAP_MS) break
      lastTs = ts
    }
    const next = { ...s, finishedTs: lastTs, pausedMs: 0, autoClosed: true }
    fixed.push({ id: s.id, date: s.date, dayKey: s.dayKey, fromMin: sessionMinutes(s), toMin: sessionMinutes(next) })
    return next
  })
  return { sessions: out, fixed }
}

export function upgradeData(input: UpgradeInput, now = new Date()): UpgradeResult {
  const settings: Setting[] = []
  let plan = input.plan
  let planReplaced = false
  if (!isV5Plan(plan)) {
    if (plan.length) settings.push({ key: 'planArchive', value: JSON.stringify({ savedAt: now.toISOString(), plan }) })
    plan = defaultPlan()
    planReplaced = true
  }
  const kot = ensureKot(plan)
  plan = kot.plan
  settings.push({ key: 'planVersion', value: PLAN_VERSION })
  const { sessions, fixed } = fixLongSessions(input.sessions, input.setLogs)
  if (fixed.length) settings.push({ key: 'autoClosedFix', value: JSON.stringify(fixed) })
  return { plan, planReplaced, kotAdded: kot.added, sessions, fixed, settings }
}
