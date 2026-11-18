import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { ensureKot, switchPlan, upgradeData } from '../../src/migrate'
import { defaultPlan, KOT_KEY } from '../../src/programme'
import { kneeGate, kotLight, nextTarget, nextUp, suggest } from '../../src/progression'
import { DEFAULT_EQUIPMENT, loadLadder } from '../../src/equipment'
import { byId, unitOf } from '../../src/library'
import type { Backup, CompletedSession, KneeCheck } from '../../src/types'

const FIX = process.env.LIFTLOG_BACKUP_NEW ?? ''
const real: Backup | null = FIX && existsSync(FIX) ? JSON.parse(readFileSync(FIX, 'utf8')) : null
const sess = (dayKey: string, date: string, t: number): CompletedSession => ({ date, dayKey, title: '', startedTs: t, finishedTs: t + 1, kneePain: null })

test('KOT exercises exist and the day sits outside the rotation', () => {
  const kot = defaultPlan().find(d => d.key === KOT_KEY)!
  assert.equal(kot.inRotation, false)
  for (const e of kot.exercises) assert.ok(byId.get(e.exId), e.exId)
  assert.deepEqual(kot.exercises.filter(e => e.light).map(e => e.exId), ['backward-walk', 'tibialis-raise', 'couch-stretch'])
})

test('KOT never becomes next up, even when never done', () => {
  const plan = defaultPlan()
  assert.equal(nextUp(plan, [])!.key, 'fb-1')
  const s = ['fb-1', 'fb-2', 'fb-3', 'fb-4'].map((k, i) => sess(k, `2026-11-0${i + 1}`, i))
  assert.equal(nextUp(plan, [...s, sess(KOT_KEY, '2026-11-05', 9)])!.key, 'fb-1')
})

test('painful KOT holds loads; easy KOT never clears a leg-day flag', () => {
  const c = (pain: number, d: string, source?: 'kot'): KneeCheck => ({ sessionDate: d, pain, swelling: false, ...(source ? { source } : {}) })
  assert.equal(kneeGate([c(1, '2026-11-01'), c(5, '2026-11-02', 'kot')]), 'hold')
  assert.equal(kneeGate([c(5, '2026-11-01'), c(0, '2026-11-02', 'kot')]), 'hold')
  assert.equal(kneeGate([c(1, '2026-11-01'), c(2, '2026-11-02', 'kot')]), 'clear')
  // a painful KOT before the latest leg day no longer counts
  assert.equal(kneeGate([c(5, '2026-11-01', 'kot'), c(1, '2026-11-02')]), 'clear')
})

test('light KOT the day of or after a leg day, or when flagged', () => {
  const plan = defaultPlan()
  assert.equal(kotLight({ today: '2026-11-05', sessions: [sess('fb-2', '2026-11-04', 1)], plan, gate: 'clear' }).light, true)
  assert.equal(kotLight({ today: '2026-11-04', sessions: [sess('fb-2', '2026-11-04', 1)], plan, gate: 'clear' }).light, true)
  assert.equal(kotLight({ today: '2026-11-06', sessions: [sess('fb-2', '2026-11-04', 1)], plan, gate: 'clear' }).light, false)
  assert.equal(kotLight({ today: '2026-11-06', sessions: [], plan, gate: 'hold' }).light, true)
})

test('real 17 Nov backup: switches to full body, 4-day plan archived with every edit', { skip: !real }, () => {
  const b = real!
  const r = switchPlan(b.plan, b.settings)
  assert.equal(r.replaced, true)
  assert.deepEqual(r.plan.map(d => d.key), ['fb-1', 'fb-2', 'fb-3', 'fb-4', 'kot'])
  const arch = JSON.parse(r.settings.find(s => s.key === 'planArchive')!.value)
  assert.deepEqual(arch.plan, b.plan, 'archived plan is exactly the one on the phone')
  assert.equal(arch.label, '4-day split')
  const squat = arch.plan.find((d: { key: string }) => d.key === 'lower-b').exercises.find((e: { exId: string }) => e.exId === 'box-squat')
  assert.equal(squat.kneeGated, false); assert.equal(squat.overrideKg, 60)
  assert.equal(switchPlan(r.plan, []).replaced, false, 'running twice changes nothing')
  assert.equal(ensureKot(r.plan).added, false)
  const u = upgradeData({ plan: b.plan, sessions: b.sessions, setLogs: b.setLogs, settings: b.settings })
  assert.equal(u.planReplaced, true); assert.equal(u.fixed.length, 0)
  console.log('gate now:', kneeGate(b.kneeChecks), '| next up:', nextUp(r.plan, b.sessions)!.key)
  const EQ = DEFAULT_EQUIPMENT
  for (const d of r.plan) for (const slot of d.exercises) {
    const lib = byId.get(slot.exId)!
    const s = suggest({ slot, lib, gate: kneeGate(b.kneeChecks), ladder: loadLadder(lib.equipment, d.location ?? 'home', EQ), history: b.setLogs.filter(l => l.exerciseId === slot.exId && !l.isWarmup) })
    console.log(`${d.short.padEnd(5)} ${slot.exId.padEnd(22)} ${String(s.weightKg).padStart(5)} x ${s.reps}  ${s.reason}`)
  }
})

test('supersets alternate, then move on', () => {
  const fb1 = defaultPlan()[0].exercises
  const bench = fb1.findIndex(e => e.exId === 'bench-press'), row = bench + 1
  const log = (exId: string, n: number) => Array.from({ length: n }, (_, i) => ({ exerciseId: exId, setIndex: i, weightKg: 60, reps: 8, isPR: false, ts: i }))
  assert.deepEqual(nextTarget(fb1, bench, log('bench-press', 1)), { index: row, setIndex: 0, restSec: 30 })
  assert.deepEqual(nextTarget(fb1, row, [...log('bench-press', 1), ...log('bb-row', 1)]), { index: bench, setIndex: 1, restSec: 90 })
  const t = nextTarget(fb1, row, [...log('bench-press', 3), ...log('bb-row', 3)])
  assert.equal(fb1[t.index].exId, 'lateral-raise')
  // partner skipped or finished early: stay with the full rest
  assert.deepEqual(nextTarget(fb1, bench, [...log('bench-press', 1), ...log('bb-row', 3)]), { index: bench, setIndex: 1, restSec: 90 })
})

test('each full body session fits in about 30 minutes', () => {
  const work = (u: string) => (u === 'min' ? 4 * 60 : u === 'sec' ? 45 : 40)
  for (const d of defaultPlan().filter(x => x.key !== KOT_KEY)) {
    let t = 0
    for (const e of d.exercises) {
      const lib = byId.get(e.exId)!
      const one = work(unitOf(lib)) * (lib.perSide ? 2 : 1)
      t += e.sets * (one + e.restSec)
    }
    const mins = t / 60 + 3 // setup and ramp-up sets
    console.log(`${d.short}: ${mins.toFixed(0)} min`)
    assert.ok(mins <= 33, `${d.short} runs ${mins.toFixed(0)} min`)
  }
})
