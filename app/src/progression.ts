// Pure training logic: knee gate, load suggestions, PRs, rotation. No database access here,
// so every rule can be tested against real history.
import { unitOf, unitSuffix, type LibraryExercise } from './library'
import type { CompletedSession, KneeCheck, LoggedSet, PlanDay, PlanExercise, SetLog } from './types'
import { ladderMax, snap, stepDown, stepUp } from './equipment'

// ---------- Knee gate ----------
// Pain is 0 to 10, where the app has always said "3 = the limit".
//   above 3, or swelling     -> flagged: hold loads
//   flagged twice in a row   -> drop one step, suggest a physio check
//   exactly 3 (at the limit) -> no load increase, reps may still climb
export type Gate = 'clear' | 'limit' | 'hold' | 'deload'

export const isFlagged = (c: KneeCheck) => (c.pain !== null && c.pain > 3) || c.swelling === true

export function orderedChecks(checks: KneeCheck[]): KneeCheck[] {
  return checks
    .filter(c => c.pain !== null || c.swelling !== null)
    .sort((a, b) => (a.sessionDate === b.sessionDate ? (a.id ?? 0) - (b.id ?? 0) : a.sessionDate < b.sessionDate ? -1 : 1))
}

const isKot = (c: KneeCheck) => c.source === 'kot'

export function kneeGate(all: KneeCheck[]): Gate {
  const ordered = orderedChecks(all)
  const c = ordered.filter(k => !isKot(k))
  const lastLeg = c[c.length - 1]
  // A painful KOT session after the last leg day holds loads too. An easy one never clears a leg-day flag.
  const kotAfter = ordered.filter(k => isKot(k) && (!lastLeg || k.sessionDate >= lastLeg.sessionDate))
  const kotFlag = kotAfter.some(k => k.pain !== null && k.pain > 3)
  const g = legGate(c)
  if (kotFlag && (g === 'clear' || g === 'limit')) return 'hold'
  return g
}

function legGate(c: KneeCheck[]): Gate {
  if (c.length === 0) return 'clear'
  const last = c[c.length - 1]
  const prev = c.length > 1 ? c[c.length - 2] : null
  if (isFlagged(last) && prev && isFlagged(prev)) return 'deload'
  if (isFlagged(last)) return 'hold'
  if (last.pain === 3) return 'limit'
  return 'clear'
}

/** True when the last two leg days were both at or above the limit: time to ask the physio. */
export function physioFlag(checks: KneeCheck[]): boolean {
  const c = orderedChecks(checks).filter(k => !isKot(k))
  if (c.length < 2) return false
  const atOrOver = (k: KneeCheck) => (k.pain !== null && k.pain >= 3) || k.swelling === true
  return atOrOver(c[c.length - 1]) && atOrOver(c[c.length - 2])
}

export function gateText(g: Gate): string | null {
  if (g === 'hold') return 'Knee flagged (pain above 3 or swelling) since your last leg day. Knee gated lifts repeat their last load.'
  if (g === 'deload') return 'Two flagged leg days in a row. Knee gated lifts drop one step.'
  if (g === 'limit') return 'Knee was at 3/10, your limit, last leg day. Knee gated lifts keep their load and chase reps only.'
  return null
}

// ---------- Suggestions ----------
export interface Suggestion {
  weightKg: number | null
  reps: number
  reason: string
  tone: 'go' | 'hold' | 'alert'
  stalled?: boolean
  nearMax?: boolean
}

interface SessionSets { date: string; sets: SetLog[] }

export function groupByDate(history: SetLog[]): SessionSets[] {
  const m = new Map<string, SetLog[]>()
  for (const s of [...history].sort((a, b) => a.ts - b.ts)) {
    if (s.isWarmup) continue
    if (!m.has(s.date)) m.set(s.date, [])
    m.get(s.date)!.push(s)
  }
  return [...m.entries()].map(([date, sets]) => ({ date, sets }))
}

/** The heaviest load of a session and how the sets at that load went. */
export function topOf(sets: SetLog[]) {
  const weights = sets.map(s => s.weightKg ?? 0)
  const w = Math.max(...weights)
  const atTop = sets.filter(s => (s.weightKg ?? 0) === w)
  return { w, count: atTop.length, minReps: Math.min(...atTop.map(s => s.reps)), maxReps: Math.max(...atTop.map(s => s.reps)) }
}

export function isKneeGated(slot: PlanExercise, lib?: LibraryExercise) {
  return slot.kneeGated ?? lib?.kneeGoverned ?? false
}

export function suggest(args: {
  slot: PlanExercise
  lib?: LibraryExercise
  history: SetLog[] // this exercise only; caller excludes the session in progress
  gate: Gate
  ladder: number[] | null
}): Suggestion {
  const { slot, lib, history, ladder } = args
  const gated = isKneeGated(slot, lib)
  const gate: Gate = gated ? args.gate : 'clear'
  const unit = unitSuffix(lib)
  const sessions = groupByDate(history)
  const lastTs = history.length ? Math.max(...history.map(s => s.ts)) : 0
  const max = ladderMax(ladder)
  const withMax = (s: Suggestion): Suggestion =>
    s.weightKg !== null && max !== null && ladder && stepUp(ladder, s.weightKg) === null
      ? { ...s, nearMax: true, reason: `${s.reason} This is the heaviest load you can build here.` }
      : s

  if (slot.overrideKg != null && (slot.overrideTs ?? 0) > lastTs) {
    return { weightKg: snap(ladder, slot.overrideKg), reps: slot.repLo, reason: 'Using the weight you set in the plan.', tone: 'go' }
  }
  if (sessions.length === 0) {
    const start = slot.startKg === null ? null : snap(ladder, slot.startKg)
    const u = unitOf(lib)
    const how = u === 'sec' ? 'end each hold with a little left in the tank' : u === 'min' ? 'keep it easy and steady' : 'finish each set with 1 to 2 reps in reserve'
    return { weightKg: start, reps: slot.repLo, reason: `First time: calibrate, ${how}.`, tone: 'go' }
  }

  const last = sessions[sessions.length - 1]
  const top = topOf(last.sets)
  const bodyweight = last.sets.every(s => s.weightKg === null)
  const w = bodyweight ? null : snap(ladder, top.w)

  // Stall: the last two sessions at the same top load both fell below the bottom of the range.
  let stalled = false
  if (sessions.length >= 2 && !bodyweight) {
    const prev = topOf(sessions[sessions.length - 2].sets)
    stalled = prev.w === top.w && prev.minReps < slot.repLo && top.minReps < slot.repLo
  }

  if (gate === 'deload') {
    const down = w === null ? null : stepDown(ladder, w) ?? w
    return { weightKg: down, reps: slot.repLo, reason: 'Knee gate: two flagged leg days in a row. Dropped one step. Worth checking with your physio before adding load.', tone: 'alert' }
  }
  if (gate === 'hold') {
    return { weightKg: w, reps: Math.max(slot.repLo, Math.min(top.minReps, slot.repHi)), reason: 'Knee gate: last leg day was flagged. Repeat the last load, no progression.', tone: 'alert' }
  }
  if (stalled) {
    return { weightKg: w, reps: slot.repLo, reason: `Stalled: two sessions below ${slot.repLo}${unit} at ${w} kg. Hold the load and own the bottom of the range.`, tone: 'hold', stalled: true }
  }

  const needSets = Math.max(1, slot.sets - 1)
  const ready = top.count >= needSets && top.minReps >= slot.repHi
  if (ready) {
    if (gate === 'limit') {
      return { weightKg: w, reps: slot.repHi, reason: 'Range topped out, but the knee was at 3/10 last leg day. Same load until it settles at 2 or below.', tone: 'hold' }
    }
    if (w === null) {
      const more = ({ reps: 'a rep', sec: '5 seconds', min: 'a minute' })[unitOf(lib)]
      const step = ({ reps: 1, sec: 5, min: 1 })[unitOf(lib)]
      return { weightKg: null, reps: top.minReps + step, reason: `Topped out. Add ${more}, or make it a little harder.`, tone: 'go' }
    }
    const up = stepUp(ladder, w, slot.incrementKg)
    if (up === null) {
      return withMax({ weightKg: w, reps: slot.repHi, reason: `Topped out at ${w} kg. Keep the reps clean.`, tone: 'hold' })
    }
    return withMax({ weightKg: up, reps: slot.repLo, reason: `Hit ${slot.repHi}${unit} at ${w} kg. Up to ${up} kg, back to ${slot.repLo}${unit}.`, tone: 'go' })
  }

  const chase = Math.max(slot.repLo, Math.min(top.minReps + 1, slot.repHi))
  const limitNote = gate === 'limit' ? ' Knee was at 3/10 last leg day, so no load increase.' : ''
  return withMax({ weightKg: w, reps: chase, reason: `Same load, chase ${slot.repHi}${unit} on every set.${limitNote}`, tone: gate === 'limit' ? 'hold' : 'go' })
}

// ---------- PRs ----------
export function isPR(history: SetLog[], weightKg: number | null, reps: number): boolean {
  if (weightKg === null) return false
  const work = history.filter(s => !s.isWarmup)
  if (work.length === 0) return false
  const best = Math.max(...work.map(s => s.weightKg ?? 0))
  if (weightKg > best) return true
  if (weightKg === best) return reps > Math.max(...work.filter(s => s.weightKg === best).map(s => s.reps))
  return false
}

export const e1rm = (w: number, r: number) => w * (1 + r / 30)

// ---------- Rotation ----------
/** Last date each plan day was completed, or null. */
export function lastDone(plan: PlanDay[], sessions: CompletedSession[]): Map<string, string | null> {
  const m = new Map<string, string | null>()
  for (const d of plan) {
    const ds = sessions.filter(s => s.dayKey === d.key).map(s => s.date).sort()
    m.set(d.key, ds.length ? ds[ds.length - 1] : null)
  }
  return m
}

/** The plan day done least recently. Never-done days come first, ties go by plan order. */
export const inRotation = (d: PlanDay) => d.inRotation !== false

export function nextUp(all: PlanDay[], sessions: CompletedSession[]): PlanDay | null {
  const plan = all.filter(inRotation)
  if (plan.length === 0) return null
  const last = lastDone(plan, sessions)
  const sorted = [...plan].sort((a, b) => {
    const la = last.get(a.key) ?? '', lb = last.get(b.key) ?? ''
    if (la !== lb) return la < lb ? -1 : 1
    // same day (or both never): the one done earlier that day, then plan order
    const ta = latestTs(sessions, a.key), tb = latestTs(sessions, b.key)
    if (ta !== tb) return ta - tb
    return a.dayIndex - b.dayIndex
  })
  return sorted[0]
}

function latestTs(sessions: CompletedSession[], key: string) {
  const ts = sessions.filter(s => s.dayKey === key).map(s => s.finishedTs)
  return ts.length ? Math.max(...ts) : 0
}

export function daysBetween(a: string, b: string) {
  return Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 864e5)
}

export function isoWeekKey(d: Date): string {
  const t = new Date(d)
  t.setHours(0, 0, 0, 0)
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7))
  const w1 = new Date(t.getFullYear(), 0, 4)
  const wk = 1 + Math.round(((t.getTime() - w1.getTime()) / 864e5 - 3 + ((w1.getDay() + 6) % 7)) / 7)
  return `${t.getFullYear()}-W${String(wk).padStart(2, '0')}`
}

export function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------- KOT ----------
/** Light KOT the day of or after a leg session, or whenever the knee is flagged. */
export function kotLight(args: { today: string; sessions: CompletedSession[]; plan: PlanDay[]; gate: Gate }): { light: boolean; why: string | null } {
  const legKeys = new Set(args.plan.filter(d => d.isLegDay).map(d => d.key))
  const recentLeg = args.sessions.some(s => legKeys.has(s.dayKey) && daysBetween(s.date, args.today) <= 1 && daysBetween(s.date, args.today) >= 0)
  if (args.gate === 'hold' || args.gate === 'deload') return { light: true, why: 'Knee flagged, so today is the light version.' }
  if (recentLeg) return { light: true, why: 'Leg session in the last day, so today is the light version.' }
  return { light: false, why: null }
}

// ---------- Supersets ----------
/**
 * Where to go after a working set. Supersets (slot.pairNext) alternate with their partner until
 * both are done; otherwise stay on the exercise until its sets are done, then move on.
 */
export function nextTarget(exs: PlanExercise[], i: number, logged: LoggedSet[]): { index: number; setIndex: number; restSec: number } {
  const done = (k: number) => logged.filter(l => l.exerciseId === exs[k].exId && !l.isWarmup).length
  const slot = exs[i]
  const partner = slot.pairNext && i + 1 < exs.length ? i + 1 : i > 0 && exs[i - 1].pairNext ? i - 1 : null
  if (partner !== null && done(partner) < exs[partner].sets) return { index: partner, setIndex: done(partner), restSec: slot.restSec }
  const longest = partner !== null ? Math.max(slot.restSec, exs[partner].restSec) : slot.restSec
  if (done(i) < slot.sets) return { index: i, setIndex: done(i), restSec: longest }
  const after = Math.max(i, partner ?? i) + 1
  return { index: after, setIndex: after < exs.length ? done(after) : 0, restSec: longest }
}

