import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { DEFAULT_EQUIPMENT, loadLadder, platesPerSide, stepUp, snap } from '../../src/equipment'
import { kneeGate, nextUp, physioFlag, suggest, isPR } from '../../src/progression'
import { byId } from '../../src/library'
import { defaultPlan } from '../../src/programme'
import { upgradeData, sessionMinutes } from '../../src/migrate'
import { buildReview } from '../../src/review'
import type { Backup, PlanExercise } from '../../src/types'

const EQ = DEFAULT_EQUIPMENT
const FIX = process.env.LIFTLOG_BACKUP ?? ''
const real: Backup | null = FIX && existsSync(FIX) ? JSON.parse(readFileSync(FIX, 'utf8')) : null

test('home barbell loads are 10 kg apart with the base plates, max 90', () => {
  const l = loadLadder('barbell', 'home', EQ)!
  assert.deepEqual(l, [20, 30, 40, 50, 60, 70, 80, 90])
  assert.equal(stepUp(l, 60, 2.5), 70)
  assert.deepEqual(platesPerSide(70, 'home', EQ), [20, 5])
})

test('micro plates shrink the home barbell jump', () => {
  const p = structuredClone(EQ); p.home.plates = [20, 10, 5, 2.5, 1.25]
  const l = loadLadder('barbell', 'home', p)!
  assert.equal(stepUp(l, 60, 2.5), 62.5)
})

test('cable stack is 5 to 70 in 5s, dumbbells 4 to 36 in 2s', () => {
  assert.deepEqual(loadLadder('cable', 'home', EQ)!.slice(0, 3), [5, 10, 15])
  assert.equal(loadLadder('cable', 'home', EQ)!.at(-1), 70)
  assert.equal(snap(loadLadder('cable', 'home', EQ), 24.5), 25)
  assert.equal(loadLadder('dumbbell', 'home', EQ)!.at(-1), 36)
  assert.equal(stepUp(loadLadder('dumbbell', 'home', EQ), 36, 2), null)
})

test('knee gate: 3 is the limit, above 3 holds, two flags drop', () => {
  const c = (pain: number | null, swelling: boolean | null, d: string) => ({ sessionDate: d, pain, swelling })
  assert.equal(kneeGate([c(1, false, '2026-01-01')]), 'clear')
  assert.equal(kneeGate([c(3, false, '2026-01-01')]), 'limit')
  assert.equal(kneeGate([c(4, false, '2026-01-01')]), 'hold')
  assert.equal(kneeGate([c(1, true, '2026-01-01')]), 'hold')
  assert.equal(kneeGate([c(5, false, '2026-01-01'), c(1, true, '2026-01-03')]), 'deload')
  assert.equal(physioFlag([c(3, false, '2026-01-01'), c(3, false, '2026-01-03')]), true)
})

test('double progression steps by one buildable load only', () => {
  const slot: PlanExercise = { slotId: 's', exId: 'bench-press', sets: 3, repLo: 6, repHi: 12, restSec: 150, incrementKg: 2.5, startKg: 40 }
  const mk = (w: number, r: number, i: number) => ({ date: '2026-10-01', dayKey: 'upper-a', exerciseId: 'bench-press', setIndex: i, weightKg: w, reps: r, isPR: false, ts: 1000 + i })
  const ladder = loadLadder('barbell', 'home', EQ)
  const s = suggest({ slot, lib: byId.get('bench-press'), history: [mk(60, 12, 0), mk(60, 12, 1), mk(60, 12, 2)], gate: 'clear', ladder })
  assert.equal(s.weightKg, 70); assert.equal(s.reps, 6)
  const t = suggest({ slot, lib: byId.get('bench-press'), history: [mk(60, 8, 0), mk(60, 7, 1), mk(60, 6, 2)], gate: 'clear', ladder })
  assert.equal(t.weightKg, 60); assert.equal(t.reps, 7)
})

test('knee gated lift does not increase at the limit', () => {
  const slot: PlanExercise = { slotId: 's', exId: 'box-squat', sets: 3, repLo: 8, repHi: 15, restSec: 150, incrementKg: 2.5, startKg: 50 }
  const mk = (r: number, i: number) => ({ date: '2026-10-01', dayKey: 'lower-a', exerciseId: 'box-squat', setIndex: i, weightKg: 50, reps: r, isPR: false, ts: 1000 + i })
  const hist = [mk(15, 0), mk(15, 1), mk(15, 2)]
  const ladder = loadLadder('barbell', 'gym', EQ)
  assert.equal(suggest({ slot, lib: byId.get('box-squat'), history: hist, gate: 'clear', ladder }).weightKg, 52.5)
  assert.equal(suggest({ slot, lib: byId.get('box-squat'), history: hist, gate: 'limit', ladder }).weightKg, 50)
  assert.equal(suggest({ slot, lib: byId.get('box-squat'), history: hist, gate: 'deload', ladder }).weightKg, 47.5)
})

test('rotation picks the day done least recently', () => {
  const plan = defaultPlan()
  const s = (dayKey: string, date: string, t: number) => ({ date, dayKey, title: '', startedTs: t, finishedTs: t + 1, kneePain: null })
  assert.equal(nextUp(plan, [])!.key, 'upper-a')
  assert.equal(nextUp(plan, [s('upper-a', '2026-10-01', 1), s('lower-a', '2026-10-02', 2), s('upper-b', '2026-10-03', 3)])!.key, 'lower-b')
  // skipped ahead to Upper A: Lower B is still owed
  assert.equal(nextUp(plan, [s('upper-a', '2026-10-01', 1), s('lower-a', '2026-10-02', 2), s('upper-b', '2026-10-03', 3), s('upper-a', '2026-10-04', 4)])!.key, 'lower-b')
})

test('every default plan exercise exists in the library', () => {
  for (const d of defaultPlan()) for (const e of d.exercises) assert.ok(byId.get(e.exId), e.exId)
})

test('real backup: upgrade keeps history, fixes the three open sessions', { skip: !real }, () => {
  const b = real!
  const r = upgradeData({ plan: b.plan, sessions: b.sessions, setLogs: b.setLogs, settings: b.settings })
  assert.equal(r.planReplaced, true)
  assert.equal(r.sessions.length, b.sessions.length)
  assert.equal(r.fixed.length, 3)
  for (const s of r.sessions) assert.ok(sessionMinutes(s) <= 180, `${s.date} ${sessionMinutes(s)}`)
  console.log('fixed:', r.fixed)
  assert.ok(r.settings.find(s => s.key === 'planArchive'))
})

test('real backup: suggestions for the new plan', { skip: !real }, () => {
  const b = real!
  const gate = kneeGate(b.kneeChecks)
  console.log('gate now:', gate, 'physio flag:', physioFlag(b.kneeChecks))
  assert.equal(gate, 'limit')
  for (const d of defaultPlan()) for (const slot of d.exercises) {
    const lib = byId.get(slot.exId)!
    const s = suggest({ slot, lib, gate, ladder: loadLadder(lib.equipment, d.location ?? 'home', EQ), history: b.setLogs.filter(l => l.exerciseId === slot.exId && !l.isWarmup) })
    console.log(`${d.short.padEnd(8)} ${slot.exId.padEnd(24)} ${String(s.weightKg).padStart(5)} x ${s.reps}  ${s.reason}`)
    if (s.weightKg !== null) assert.ok(loadLadder(lib.equipment, d.location ?? 'home', EQ)!.includes(s.weightKg), `${slot.exId} ${s.weightKg} not buildable`)
  }
})

test('real backup: review text', { skip: !real }, () => {
  const b = real!
  const txt = buildReview({ plan: defaultPlan(), sessions: b.sessions, setLogs: b.setLogs, kneeChecks: b.kneeChecks, bodyLog: b.bodyLog ?? [], now: new Date('2026-10-16T12:00:00') })
  console.log(txt)
  assert.ok(txt.split(/\s+/).length < 400, 'under 400 words')
})

test('PR needs more than the best', () => {
  const h = [{ date: 'd', dayKey: 'k', exerciseId: 'x', setIndex: 0, weightKg: 50, reps: 10, isPR: false, ts: 1 }]
  assert.equal(isPR(h, 50, 10), false); assert.equal(isPR(h, 50, 11), true); assert.equal(isPR(h, 55, 1), true)
})
