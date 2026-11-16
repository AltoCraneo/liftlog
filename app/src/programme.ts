// The 4-day rotation (v5, October 2026). Built from the July to October logs:
// trained 3 to 4 days a week, never reached days 5 and 6, pushed 2.5x more than pulled,
// and barbell jumps are 10 kg at home. Wide rep ranges on barbell lifts absorb those jumps.
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

export const PLAN_VERSION = 'v5-4day'
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

export function defaultPlan(): PlanDay[] {
  return [
    {
      dayIndex: 1, key: 'upper-a', title: 'Upper A: Bench and rows', short: 'Upper A', isLegDay: false, location: 'home',
      exercises: [
        slot('upper-a', 'bench-press', 3, 6, 12, 150, 60, 'Wide range on purpose: a 10 kg jump costs about 4 reps.'),
        slot('upper-a', 'bb-row', 4, 8, 15, 120, 50),
        slot('upper-a', 'incline-db-press', 3, 8, 12, 90, 20),
        slot('upper-a', 'seated-row', 3, 8, 12, 90, 60),
        slot('upper-a', 'lateral-raise', 2, 12, 15, 60, 10),
        slot('upper-a', 'triceps-pushdown', 2, 10, 15, 60, 35),
        slot('upper-a', 'db-curl', 2, 10, 12, 60, 10),
      ],
    },
    {
      dayIndex: 2, key: 'lower-a', title: 'Lower A: Quads at the gym (knee gated)', short: 'Lower A', isLegDay: true, location: 'gym',
      exercises: [
        slot('lower-a', 'leg-ext-iso', 4, 30, 45, 90, 20, 'Pick a load you can hold 30 s at about 7/10 effort. Add load once 4 x 45 s feels easy.'),
        slot('lower-a', 'box-squat', 3, 8, 15, 150, 50, 'Restarted at 50 kg. Load only goes up when the knee was at 2/10 or below.', 50),
        slot('lower-a', 'leg-press', 3, 10, 15, 90, 60, 'First session is a calibration.'),
        slot('lower-a', 'bulgarian-split-squat', 2, 10, 15, 90, 10),
        slot('lower-a', 'seated-leg-curl', 3, 10, 15, 75, 30, 'First session is a calibration.'),
        slot('lower-a', 'calf-raise', 2, 12, 20, 60, 20),
        slot('lower-a', 'hip-adduction-machine', 2, 12, 15, 60, 30, 'First session is a calibration.'),
      ],
    },
    {
      dayIndex: 3, key: 'upper-b', title: 'Upper B: Overhead and pulldowns', short: 'Upper B', isLegDay: false, location: 'home',
      exercises: [
        slot('upper-b', 'ohp-db', 3, 6, 10, 150, 16),
        slot('upper-b', 'close-pulldown', 3, 10, 12, 90, 35),
        slot('upper-b', 'incline-bb-press', 3, 6, 12, 120, 40, 'Wide range to absorb 10 kg jumps.'),
        slot('upper-b', 'db-row', 3, 8, 12, 90, 20),
        slot('upper-b', 'face-pull', 2, 12, 15, 60, 25),
        slot('upper-b', 'cable-lateral', 2, 12, 15, 60, 10),
        slot('upper-b', 'hammer-curl', 2, 10, 12, 60, 10),
      ],
    },
    {
      dayIndex: 4, key: 'lower-b', title: 'Lower B: Posterior chain (knee friendly)', short: 'Lower B', isLegDay: true, location: 'home',
      exercises: [
        slot('lower-b', 'tke', 2, 15, 20, 30, 5, 'Rehab prep. Slow, squeeze at lockout.'),
        slot('lower-b', 'rdl', 3, 8, 15, 150, 60, 'Hips back, soft knees, shins stay vertical.'),
        slot('lower-b', 'hip-thrust', 3, 8, 15, 120, 40, 'New lift: first session is a calibration.'),
        slot('lower-b', 'cable-leg-curl', 3, 12, 15, 75, 10),
        slot('lower-b', 'sl-calf-raise', 3, 12, 15, 60, 12),
        slot('lower-b', 'deadbug', 2, 10, 10, 45, null),
      ],
    },
    kotDay(5),
  ]
}

export const WARMUP = {
  leg: ['8 to 10 min easy bike, low resistance', 'Ramp up: first compound at about 50% x 8, then 75% x 4'],
  upper: ['3 to 4 min bike or brisk movement', 'Arm circles and band pull-aparts', 'Ramp up: first compound at about 50% x 8, then 75% x 4'],
}
