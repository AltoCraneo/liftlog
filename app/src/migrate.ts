// Upgrades older plans and data to v5.1 (four full body days plus KOT, schema 5).
// Used twice: by the on-phone database upgrade, and when importing an older backup.
// Pure function: plain arrays in, plain arrays out.
import { defaultPlan, FB_PREFIX, KOT_KEY, kotDay, PLAN_VERSION } from './programme'
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

export const isFullBodyPlan = (plan: PlanDay[]) => plan.some(d => d.key.startsWith(FB_PREFIX))

const planLabel = (plan: PlanDay[]) => {
  const n = plan.filter(d => d.inRotation !== false).length
  return plan.some(d => d.key.startsWith(FB_PREFIX)) ? `${n}-day full body` : `${n}-day split`
}

/**
 * Move an older plan to the full body plan. The plan being replaced is archived (with every edit)
 * so it can be restored; an archive already there is kept under planArchiveOlder.
 */
export function switchPlan(plan: PlanDay[], settings: Setting[], now = new Date()): { plan: PlanDay[]; replaced: boolean; settings: Setting[] } {
  if (isFullBodyPlan(plan)) {
    const k = ensureKot(plan)
    return { plan: k.plan, replaced: false, settings: [] }
  }
  const out: Setting[] = []
  const prev = settings.find(s => s.key === 'planArchive')
  if (prev) out.push({ key: 'planArchiveOlder', value: prev.value })
  if (plan.length) out.push({ key: 'planArchive', value: JSON.stringify({ savedAt: now.toISOString(), label: planLabel(plan), plan }) })
  return { plan: defaultPlan(), replaced: true, settings: out }
}

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
  const hadKot = input.plan.some(d => d.key === KOT_KEY)
  const sw = switchPlan(input.plan, input.settings, now)
  const plan = sw.plan
  const planReplaced = sw.replaced
  const settings: Setting[] = [...sw.settings, { key: 'planVersion', value: PLAN_VERSION }]
  const { sessions, fixed } = fixLongSessions(input.sessions, input.setLogs)
  if (fixed.length) settings.push({ key: 'autoClosedFix', value: JSON.stringify(fixed) })
  return { plan, planReplaced, kotAdded: !hadKot, sessions, fixed, settings }
}
