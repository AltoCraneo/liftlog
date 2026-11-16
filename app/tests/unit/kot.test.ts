import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { ensureKot, upgradeData } from '../../src/migrate'
import { defaultPlan, KOT_KEY } from '../../src/programme'
import { kneeGate, kotLight, nextUp } from '../../src/progression'
import { byId } from '../../src/library'
import { buildReview } from '../../src/review'
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
  assert.equal(nextUp(plan, [])!.key, 'upper-a')
  const s = ['upper-a', 'lower-a', 'upper-b', 'lower-b'].map((k, i) => sess(k, `2026-11-0${i + 1}`, i))
  assert.equal(nextUp(plan, [...s, sess(KOT_KEY, '2026-11-05', 9)])!.key, 'upper-a')
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
  assert.equal(kotLight({ today: '2026-11-05', sessions: [sess('lower-b', '2026-11-04', 1)], plan, gate: 'clear' }).light, true)
  assert.equal(kotLight({ today: '2026-11-04', sessions: [sess('lower-b', '2026-11-04', 1)], plan, gate: 'clear' }).light, true)
  assert.equal(kotLight({ today: '2026-11-06', sessions: [sess('lower-b', '2026-11-04', 1)], plan, gate: 'clear' }).light, false)
  assert.equal(kotLight({ today: '2026-11-06', sessions: [sess('upper-a', '2026-11-05', 1)], plan, gate: 'hold' }).light, true)
})

test('real 17 Nov backup: KOT added, every edit kept', { skip: !real }, () => {
  const b = real!
  const r = ensureKot(b.plan)
  assert.equal(r.added, true)
  assert.equal(r.plan.length, b.plan.length + 1)
  assert.deepEqual(r.plan.slice(0, b.plan.length), b.plan, 'existing days untouched')
  const lb = r.plan.find(d => d.key === 'lower-b')!
  const squat = lb.exercises.find(e => e.exId === 'box-squat')!
  assert.equal(squat.kneeGated, false); assert.equal(squat.overrideKg, 60)
  assert.equal(r.plan.at(-1)!.dayIndex, 5)
  assert.equal(ensureKot(r.plan).added, false, 'running twice adds nothing')
  const u = upgradeData({ plan: b.plan, sessions: b.sessions, setLogs: b.setLogs, settings: b.settings })
  assert.equal(u.planReplaced, false); assert.equal(u.kotAdded, true); assert.equal(u.fixed.length, 0)
  console.log('gate now:', kneeGate(b.kneeChecks), '| next up:', nextUp(r.plan, b.sessions)!.key)
  console.log(buildReview({ plan: r.plan, sessions: b.sessions, setLogs: b.setLogs, kneeChecks: b.kneeChecks, bodyLog: b.bodyLog ?? [], now: new Date('2026-11-17T12:00:00') }))
})
