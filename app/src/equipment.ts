// What loads can actually be built, per location. Every suggested or stepped load goes
// through here, so the app never proposes a weight Bruno can't put on the bar.
import type { Equipment } from './library'

export type Location = 'home' | 'gym'

export interface EquipmentProfile {
  home: {
    barKg: number
    plates: number[] // plate sizes owned, one PAIR each (one per side)
    dbMin: number
    dbMax: number
    dbStep: number
    cableMin: number
    cableMax: number
    cableStep: number
  }
  gym: {
    barKg: number
    smallestPlate: number // gym plates are effectively unlimited
    dbStep: number
    dbMax: number
    machineStep: number
    cableStep: number
  }
}

export const BASE_PLATES = [20, 10, 5]
export const MICRO_PLATES = [2.5, 1.25]

export const DEFAULT_EQUIPMENT: EquipmentProfile = {
  home: { barKg: 20, plates: BASE_PLATES, dbMin: 4, dbMax: 36, dbStep: 2, cableMin: 5, cableMax: 70, cableStep: 5 },
  gym: { barKg: 20, smallestPlate: 1.25, dbStep: 2.5, dbMax: 50, machineStep: 5, cableStep: 5 },
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** Every total barbell load buildable at home: bar + 2 x (any subset of owned pairs). */
export function homeBarbellLoads(barKg: number, plates: number[]): Map<number, number[]> {
  const out = new Map<number, number[]>()
  const n = plates.length
  for (let mask = 0; mask < 1 << n; mask++) {
    const used: number[] = []
    for (let i = 0; i < n; i++) if (mask & (1 << i)) used.push(plates[i])
    const total = r2(barKg + 2 * used.reduce((a, b) => a + b, 0))
    const perSide = [...used].sort((a, b) => b - a)
    const prev = out.get(total)
    // prefer fewer plates for the same total
    if (!prev || perSide.length < prev.length) out.set(total, perSide)
  }
  return out
}

/** Sorted list of loads that can be set for this equipment at this location. null = no external load. */
export function loadLadder(eq: Equipment, loc: Location, p: EquipmentProfile): number[] | null {
  if (eq === 'bodyweight') return null
  if (loc === 'home') {
    const h = p.home
    if (eq === 'barbell') return [...homeBarbellLoads(h.barKg, h.plates).keys()].sort((a, b) => a - b)
    if (eq === 'dumbbell') return range(h.dbMin, h.dbMax, h.dbStep)
    if (eq === 'cable') return range(h.cableMin, h.cableMax, h.cableStep)
    // machines don't exist at home; fall back to cable-like steps
    return range(h.cableMin, h.cableMax, h.cableStep)
  }
  const g = p.gym
  if (eq === 'barbell') return range(g.barKg, 300, 2 * g.smallestPlate)
  if (eq === 'dumbbell') return range(g.dbStep, g.dbMax, g.dbStep)
  if (eq === 'cable') return range(g.cableStep, 150, g.cableStep)
  return range(g.machineStep, 400, g.machineStep)
}

function range(min: number, max: number, step: number): number[] {
  const out: number[] = []
  for (let v = min; v <= max + 1e-9; v = r2(v + step)) out.push(r2(v))
  return out
}

/** Smallest buildable load at or above `target`. null if beyond the top of the ladder. */
export function atOrAbove(ladder: number[], target: number): number | null {
  for (const v of ladder) if (v >= target - 1e-9) return v
  return null
}

/** Next buildable load strictly above w, respecting the plan's minimum jump. */
export function stepUp(ladder: number[] | null, w: number, minJump = 0): number | null {
  if (!ladder) return null
  return atOrAbove(ladder, Math.max(w + 1e-6, w + minJump))
}

/** Next buildable load strictly below w. */
export function stepDown(ladder: number[] | null, w: number): number | null {
  if (!ladder) return null
  let best: number | null = null
  for (const v of ladder) if (v < w - 1e-9) best = v
  return best
}

/** Nearest buildable load (for snapping an off-ladder value from old data or manual edits). */
export function snap(ladder: number[] | null, w: number): number {
  if (!ladder || ladder.length === 0) return w
  let best = ladder[0]
  for (const v of ladder) if (Math.abs(v - w) < Math.abs(best - w)) best = v
  return best
}

export function ladderMax(ladder: number[] | null): number | null {
  return ladder && ladder.length ? ladder[ladder.length - 1] : null
}

/** Per-side plate breakdown for a home barbell load, or null if it can't be built. */
export function platesPerSide(total: number, loc: Location, p: EquipmentProfile): number[] | null {
  if (loc === 'home') return homeBarbellLoads(p.home.barKg, p.home.plates).get(r2(total)) ?? null
  // gym: greedy with standard plates
  const std = [25, 20, 15, 10, 5, 2.5, 1.25]
  let side = r2((total - p.gym.barKg) / 2)
  if (side < 0) return null
  const out: number[] = []
  for (const pl of std) while (side >= pl - 1e-9) { out.push(pl); side = r2(side - pl) }
  return side < 1e-9 ? out : null
}

export const platesText = (ps: number[]) => (ps.length === 0 ? 'empty bar' : ps.join(' + '))
