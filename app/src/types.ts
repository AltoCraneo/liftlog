import type { Location } from './equipment'

export interface PlanExercise {
  slotId: string
  exId: string
  sets: number
  repLo: number
  repHi: number
  restSec: number
  incrementKg: number
  startKg: number | null
  overrideKg?: number | null
  overrideTs?: number
  /** Per-slot knee gate. Undefined = use the library default. */
  kneeGated?: boolean
  note?: string
}

export interface PlanDay {
  dayIndex: number
  key: string
  title: string
  short: string
  isLegDay: boolean
  location?: Location
  exercises: PlanExercise[]
}

export interface SetLog {
  id?: number
  date: string
  dayKey: string
  exerciseId: string
  setIndex: number
  weightKg: number | null
  reps: number
  isPR: boolean
  isWarmup?: boolean
  ts: number
}

export interface CompletedSession {
  id?: number
  date: string
  dayKey: string
  title: string
  startedTs: number
  finishedTs: number
  pausedMs?: number
  kneePain: number | null
  autoClosed?: boolean
}

export interface KneeCheck {
  id?: number
  sessionDate: string
  pain: number | null
  swelling: boolean | null
}

export interface BodyLog {
  id?: number
  date: string
  weightKg: number
}

export interface Setting {
  key: string
  value: string
}

export interface LoggedSet {
  exerciseId: string
  setIndex: number
  weightKg: number | null
  reps: number
  isPR: boolean
  isWarmup?: boolean
  ts: number
}

export interface ActiveSession {
  id: 'current'
  date: string
  dayKey: string
  title: string
  short: string
  isLegDay: boolean
  location?: Location
  exercises: PlanExercise[]
  startedTs: number
  exerciseIndex: number
  setIndex: number
  logged: LoggedSet[]
  restEndsTs: number | null
  pausedAt?: number | null
  pausedMs?: number
  restLeftMsPaused?: number | null
}

export interface Backup {
  app: 'liftlog'
  schema: number
  exportedAt: string
  setLogs: SetLog[]
  sessions: CompletedSession[]
  kneeChecks: KneeCheck[]
  settings: Setting[]
  plan: PlanDay[]
  bodyLog?: BodyLog[]
}
