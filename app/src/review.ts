// Plain-text summary of the last 28 days, sized to paste into a chat with Claude.
import { exName } from './library'
import { KOT_KEY } from './programme'
import { e1rm, groupByDate, topOf, todayStr } from './progression'
import type { BodyLog, CompletedSession, KneeCheck, PlanDay, SetLog } from './types'

export function buildReview(args: {
  plan: PlanDay[]
  sessions: CompletedSession[]
  setLogs: SetLog[]
  kneeChecks: KneeCheck[]
  bodyLog: BodyLog[]
  now?: Date
  days?: number
}): string {
  const now = args.now ?? new Date()
  const days = args.days ?? 28
  const from = new Date(now); from.setDate(from.getDate() - days)
  const fromStr = todayStr(from), toStr = todayStr(now)
  const inWin = (d: string) => d > fromStr && d <= toStr
  const all = args.sessions.filter(s => inWin(s.date)).sort((a, b) => (a.date < b.date ? -1 : 1))
  const sess = all.filter(s => s.dayKey !== KOT_KEY)
  const kotDays = new Set([
    ...all.filter(s => s.dayKey === KOT_KEY).map(s => s.date),
    ...args.setLogs.filter(l => l.exerciseId === 'backward-walk' && inWin(l.date)).map(l => l.date),
  ]).size
  const lines: string[] = []

  lines.push(`LiftLog review: ${fromStr} to ${toStr} (${days} days)`)
  lines.push('')
  const perWeek = (sess.length / (days / 7)).toFixed(1)
  lines.push(`Sessions: ${sess.length} (${perWeek} a week)`)
  const names = new Map(args.plan.map(d => [d.key, d.short]))
  const byDay = new Map<string, number>()
  for (const s of sess) byDay.set(s.dayKey, (byDay.get(s.dayKey) ?? 0) + 1)
  const dayParts = args.plan.filter(d => d.key !== KOT_KEY).map(d => `${d.short} ${byDay.get(d.key) ?? 0}`)
  for (const [k, n] of byDay) if (!names.has(k)) dayParts.push(`${k} (old plan) ${n}`)
  lines.push(`By plan day: ${dayParts.join(', ')}`)
  const mins = sess.filter(s => !s.autoClosed).map(s => Math.round((s.finishedTs - s.startedTs - (s.pausedMs ?? 0)) / 60000))
  if (mins.length) lines.push(`Typical length: ${median(mins)} min`)
  if (args.plan.some(d => d.key === KOT_KEY)) lines.push(`KOT (daily knee routine): ${kotDays} of ${days} days`)
  const auto = sess.filter(s => s.autoClosed).length
  if (auto) lines.push(`Auto-closed (left open): ${auto}`)

  lines.push('')
  lines.push('Lifts (top set at start of window, then latest, then trend):')
  const work = args.setLogs.filter(s => !s.isWarmup && inWin(s.date))
  const ids = [...new Set(work.map(s => s.exerciseId))]
  const rows = ids.map(id => {
    const g = groupByDate(work.filter(s => s.exerciseId === id))
    const first = topOf(g[0].sets), last = topOf(g[g.length - 1].sets)
    const weighted = g.some(x => x.sets.some(s => (s.weightKg ?? 0) > 0))
    const a = weighted ? e1rm(first.w, first.maxReps) : first.maxReps
    const b = weighted ? e1rm(last.w, last.maxReps) : last.maxReps
    const change = a > 0 ? (b - a) / a : 0
    const trend = g.length < 2 ? 'one session only' : change > 0.02 ? 'progressing' : change < -0.02 ? 'dropping' : 'holding'
    const fmt = (t: ReturnType<typeof topOf>) => (weighted ? `${t.w}x${t.maxReps}` : `${t.maxReps}`)
    return { n: g.length, text: `- ${exName(id)}: ${fmt(first)} -> ${fmt(last)}, ${trend} (${g.length} sessions)` }
  }).sort((x, y) => y.n - x.n)
  if (rows.length === 0) lines.push('- none logged')
  for (const r of rows) lines.push(r.text)

  lines.push('')
  lines.push('Knee (pain 0 to 10 during the session, 3 = the limit; swelling next morning):')
  const knees = args.kneeChecks.filter(k => inWin(k.sessionDate)).sort((a, b) => (a.sessionDate < b.sessionDate ? -1 : 1))
  if (knees.length === 0) lines.push('- no leg days logged')
  for (const k of knees) {
    const sw = k.swelling === null ? 'swelling not answered' : k.swelling ? 'SWELLING' : 'no swelling'
    if (k.source === 'kot') lines.push(`- ${k.sessionDate}: KOT, pain ${k.pain ?? 'not recorded'}`)
    else lines.push(`- ${k.sessionDate}: pain ${k.pain ?? 'not recorded'}, ${sw}`)
  }

  lines.push('')
  const bw = [...args.bodyLog].sort((a, b) => (a.date < b.date ? -1 : 1))
  const bwWin = bw.filter(b => inWin(b.date))
  if (bwWin.length >= 2) {
    const d = bwWin[bwWin.length - 1].weightKg - bwWin[0].weightKg
    lines.push(`Body weight: ${bwWin[0].weightKg} kg (${bwWin[0].date}) -> ${bwWin[bwWin.length - 1].weightKg} kg (${bwWin[bwWin.length - 1].date}), ${d >= 0 ? '+' : ''}${d.toFixed(1)} kg`)
  } else if (bw.length) {
    lines.push(`Body weight: only ${bwWin.length} entr${bwWin.length === 1 ? 'y' : 'ies'} in this window. Latest ${bw[bw.length - 1].weightKg} kg on ${bw[bw.length - 1].date}.`)
  } else {
    lines.push('Body weight: none logged.')
  }
  lines.push('')
  lines.push(`Plan: ${args.plan.filter(d => d.key !== KOT_KEY).map(d => `${d.short} (${d.location ?? 'home'})`).join(', ')}, done in rotation.`)
  return lines.join('\n')
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2)
}
