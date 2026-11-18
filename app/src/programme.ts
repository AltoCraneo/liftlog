// v5.1 (November 2026): four 30-minute full body sessions in rotation, plus daily KOT.
// Built from the October to November logs: 2.3 sessions a week, the gym day rarely happened,
// sessions ran 56 minutes. Every session hits legs, push and pull, so any 2 a week cover everything.
// Knee-heavy days (1, 3) alternate with hip days (2, 4). Barbell lifts keep wide rep ranges
// because home barbell jumps are 10 kg.
import { byId } from './library'
import type { PlanDay, PlanExercise } from './types'

function slot(day: string, exId: string, sets: number, repLo: number, repHi: number, restSec: number,
  startKg: number | null, note?: string, restartKg?: number): PlanExercise {
  const lib = byId.get(exId)
  if (!lib) throw new Error(`Unknown exercise ${exId}`)
  return {
    slotId: `v5-${day}-${exId}`, exId, sets, repLo, repHi, restSec, incrementKg: lib.incrementKg, startKg,
    ...(note ? { note } : {}),
    // A deliberate restart load wins over history once, then progression takes over.
    ...(restartKg !== undefined ? { overrideKg: restartKg, overrideTs: Date.now() } : {}),
  }
}

export const PLAN_VERSION = 'v5.1-fullbody4'
export const FB_PREFIX = 'fb-'
export const KOT_KEY = 'kot'

/** Daily knees over toes routine. Sits outside the rotation. Light version = slots marked light. */
export function kotDay(dayIndex = 5): PlanDay {
  const k = (exId: string, sets: number, repLo: number, repHi: number, restSec: number, startKg: number | null, light: boolean, note?: string) =>
    ({ ...slot(KOT_KEY, exId, sets, repLo, repHi, restSec, startKg, note), kneeGated: false, light })
  return {
    dayIndex, key: KOT_KEY, title: 'KOT: Knees over toes', short: 'KOT', isLegDay: false, location: 'home', inRotation: false,
    exercises: [
      k('backward-walk', 1, 5, 8, 30, 10, true, 'Light cable load, steady steps. The easiest way to load the quads without stressing the joint.'),
      k('tibialis-raise', 2, 15, 25, 30, null, true),
      k('seated-db-calf', 2, 15, 20, 30, 12, false, 'One dumbbell on each thigh. Pause at the top, 3 s down.'),
      k('patrick-step', 2, 10, 20, 30, null, false, 'Keep pain at 3/10 or below. Raise the step only when 2 x 20 is pain free.'),
      k('couch-stretch', 1, 60, 90, 15, null, true),
    ],
  }
}


/** Built-in warm-up for each full body day: KOT light, about 5 minutes. */
function prep(day: string): PlanExercise[] {
  return [
    { ...slot(day, 'backward-walk', 1, 3, 5, 0, 10, 'Warm-up and today\'s KOT light in one.'), prep: true, kneeGated: false },
    { ...slot(day, 'tibialis-raise', 1, 15, 25, 0, null), prep: true, kneeGated: false },
  ]
}
const pair = (e: PlanExercise): PlanExercise => ({ ...e, pairNext: true })

export function defaultPlan(): PlanDay[] {
  const day = (n: number, title: string, exercises: PlanExercise[]): PlanDay => ({
    dayIndex: n, key: `${FB_PREFIX}${n}`, title: `Full body ${n}: ${title}`, short: `FB ${n}`, isLegDay: true, location: 'home', exercises,
  })
  return [
    day(1, 'Squat, bench, row', [
      ...prep('fb-1'),
      slot('fb-1', 'box-squat', 3, 8, 15, 120, 60, 'Knee gated. Load only goes up when the knee was at 2/10 or below.'),
      pair(slot('fb-1', 'bench-press', 3, 6, 12, 30, 60, 'Superset with the row: bench, 30 s, row, 90 s, repeat.')),
      slot('fb-1', 'bb-row', 3, 8, 15, 90, 50),
      slot('fb-1', 'lateral-raise', 2, 12, 15, 45, 8),
    ]),
    day(2, 'Hinge, press, pulldown', [
      ...prep('fb-2'),
      slot('fb-2', 'rdl', 3, 8, 15, 120, 60, 'Hips back, soft knees, shins stay vertical.'),
      pair(slot('fb-2', 'ohp-db', 3, 6, 10, 30, 20, 'Superset with the pulldown.')),
      slot('fb-2', 'sa-pulldown', 3, 10, 15, 90, 35, 'New: one arm at a time, so the 70 kg stack is enough again. First session is a calibration.'),
      slot('fb-2', 'cable-leg-curl', 2, 12, 15, 45, 20),
    ]),
    day(3, 'Split squat, incline, row', [
      ...prep('fb-3'),
      slot('fb-3', 'bulgarian-split-squat', 3, 10, 15, 90, 10, 'Knee gated.'),
      pair(slot('fb-3', 'incline-bb-press', 3, 6, 12, 30, 50, 'Superset with the cable row.')),
      slot('fb-3', 'single-arm-cable-row', 3, 8, 15, 90, 35, 'One arm at a time, so the stack keeps challenging you. First session is a calibration.'),
      slot('fb-3', 'triceps-pushdown', 2, 10, 15, 45, 40),
    ]),
    day(4, 'Hip thrust, incline DB, DB row', [
      ...prep('fb-4'),
      slot('fb-4', 'hip-thrust', 3, 8, 15, 120, 60),
      pair(slot('fb-4', 'incline-db-press', 3, 8, 12, 30, 20, 'Superset with the DB row.')),
      slot('fb-4', 'db-row', 3, 8, 12, 90, 22),
      pair(slot('fb-4', 'face-pull', 2, 12, 15, 20, 35, 'Superset with the hammer curl.')),
      slot('fb-4', 'hammer-curl', 2, 10, 12, 45, 14),
    ]),
    kotDay(5),
  ]
}

export const WARMUP = {
  built: ['Built in: backward walk and tibialis raise. That counts as today\'s KOT light.', 'Ramp up the first leg lift: about 50% x 8, then 75% x 4.'],
  leg: ['8 to 10 min easy bike, low resistance', 'Ramp up: first compound at about 50% x 8, then 75% x 4'],
  upper: ['3 to 4 min bike or brisk movement', 'Arm circles and band pull-aparts', 'Ramp up: first compound at about 50% x 8, then 75% x 4'],
}
