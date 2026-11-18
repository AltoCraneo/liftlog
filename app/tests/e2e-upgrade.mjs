// Upgrade tests in an iPhone-size browser, same origin, real backups.
//  A: July app (v4) + 15 Oct backup  -> v5.1
//  B: live v5 + 17 Nov backup        -> v5.1, then a full FB 1 session with supersets, KOT, plan swap
// Usage: CHROME_BIN=... node tests/e2e-upgrade.mjs <v4Dir> <v5Dir> <newDir> <oct.json> <nov.json> <shotsDir>
import { chromium } from 'playwright-core'
import http from 'node:http'
import { readFileSync, existsSync, mkdtempSync } from 'node:fs'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'

const [v4Dir, v5Dir, newDir, octBackup, novBackup, shots] = process.argv.slice(2)
let serveDir = v4Dir
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/liftlog/, '')
  if (p === '/' || p === '') p = '/index.html'
  const f = join(serveDir, p)
  if (!existsSync(f)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
  res.end(readFileSync(f))
}).listen(4319)
const URL_ = 'http://localhost:4319/liftlog/'
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }

async function browser() {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'llu-')), {
    executablePath: process.env.CHROME_BIN, viewport: { width: 393, height: 852 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: 'dark',
  })
  const page = ctx.pages()[0] ?? await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(String(e)))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('dialog', d => d.accept())
  const h = {
    ctx, page, errors,
    shot: n => page.screenshot({ path: join(shots, n + '.png'), fullPage: true }),
    tap: (name, exact = false) => page.getByRole('button', { name, exact }).first().click(),
    text: () => page.locator('body').innerText(),
    title: () => page.locator('h1').first().innerText(),
    dump: () => page.evaluate(() => new Promise(res => {
      const r = indexedDB.open('liftlog')
      r.onsuccess = () => {
        const db = r.result, out = { version: db.version }, names = [...db.objectStoreNames]
        const tx = db.transaction(names, 'readonly'); let left = names.length
        for (const n of names) { const q = tx.objectStore(n).getAll(); q.onsuccess = () => { out[n] = q.result; if (--left === 0) { db.close(); res(out) } } }
      }
    })),
    async importBackup(file) {
      await h.tap('settings')
      const fc = page.waitForEvent('filechooser'); await h.tap('Import a backup'); await (await fc).setFiles(file)
      await page.waitForTimeout(900)
    },
    log: () => page.getByRole('button', { name: 'Log set', exact: true }).click().then(() => page.waitForTimeout(250)),
    async skipRestIfAny() { if (await page.getByRole('button', { name: 'Skip rest' }).count()) { await h.tap('Skip rest'); await page.waitForTimeout(150) } },
    async finishWithPain(p) {
      await h.tap('Knee check and finish'); await page.waitForTimeout(200)
      await page.locator('input[type=range]').fill(String(p))
      await h.tap('Save and finish'); await page.waitForTimeout(700)
    },
  }
  return h
}

// ---------- A: July app -> v5.1 ----------
{
  serveDir = v4Dir
  const b = await browser()
  await b.page.goto(URL_); await b.page.waitForTimeout(800)
  await b.importBackup(octBackup)
  const before = await b.dump()
  serveDir = newDir
  await b.page.goto(URL_); await b.page.waitForTimeout(1200)
  const after = await b.dump()
  check(after.version === 50, 'A: July app database upgraded to version 5')
  check(after.setLogs.length === before.setLogs.length && after.sessions.length === before.sessions.length, `A: all ${after.setLogs.length} sets and ${after.sessions.length} sessions kept`)
  check(after.plan.map(d => d.key).join() === 'fb-1,fb-2,fb-3,fb-4,kot', 'A: full body plan plus KOT')
  const longest = Math.max(...after.sessions.map(s => (s.finishedTs - s.startedTs - (s.pausedMs ?? 0)) / 60000))
  check(longest < 180, `A: forgotten sessions closed (longest ${Math.round(longest)} min)`)
  check(JSON.parse(after.settings.find(s => s.key === 'planArchive').value).label === '6-day split', 'A: the 6-day plan is archived')
  check(b.errors.length === 0, 'A: no console errors ' + b.errors.slice(0, 2).join(' | '))
  await b.ctx.close()
}

// ---------- B: live v5 -> v5.1 ----------
serveDir = v5Dir
const b = await browser()
const { page, tap, text, title, shot, dump, log, skipRestIfAny } = b
await page.goto(URL_); await page.waitForTimeout(800)
await b.importBackup(novBackup)
check((await text()).includes('Backup restored'), 'B: live v5 imported the 17 Nov backup')
const before = await dump()
serveDir = newDir
await page.goto(URL_); await page.waitForTimeout(1200)
const after = await dump()
check(after.version === 50, 'B: database upgraded to version 5')
check(after.setLogs.length === before.setLogs.length && after.sessions.length === before.sessions.length && after.kneeChecks.length === before.kneeChecks.length, `B: all ${after.setLogs.length} sets, ${after.sessions.length} sessions, ${after.kneeChecks.length} knee checks kept`)
check(after.plan.map(d => d.key).join() === 'fb-1,fb-2,fb-3,fb-4,kot', 'B: full body plan plus KOT')
const arch = JSON.parse(after.settings.find(s => s.key === 'planArchive').value)
check(JSON.stringify(arch.plan) === JSON.stringify(before.plan) && arch.label === '4-day split', 'B: your 4-day plan archived exactly, with every edit')
const hadArchive = before.settings.some(s => s.key === 'planArchive')
check(hadArchive ? after.settings.some(s => s.key === 'planArchiveOlder') : !after.settings.some(s => s.key === 'planArchiveOlder'), `B: older archive ${hadArchive ? 'kept' : 'not invented (none in this backup)'}`)
let t = await text()
check(/Next up: FB 1/i.test(await title()), 'B: Today offers FB 1')
check(/New plan:/.test(t) && /saved under Plan/.test(t), 'B: Today explains the switch')
check(/KOT daily/i.test(t) && !/light today/i.test(t), 'B: full KOT offered (no training yesterday)')
await shot('B01-today')

// Full FB 1 session
await tap('Got it'); await page.waitForTimeout(200)
await tap('Start FB 1'); await page.waitForTimeout(400)
check(/Backward walk/i.test(await title()), 'B: FB 1 opens with the backward walk warm-up')
await shot('B02-warmup')
await log()
check(/Tibialis/i.test(await title()), 'B: warm-up moves straight on, no rest timer')
await log()
check(/Box squat/i.test(await title()), 'B: then the box squat')
for (let i = 0; i < 3; i++) { await log(); await skipRestIfAny() }
check(/bench press/i.test(await title()), 'B: after 3 squat sets, bench press')
await log()
let tx = await text()
check(/Barbell row/.test(tx) && /seconds/i.test(tx), 'B: superset: after a bench set, rest then barbell row')
const restLeft = await page.locator('.ring .s').innerText()
check(Number(restLeft) <= 30 && Number(restLeft) >= 25, `B: 30 s switch rest between bench and row (${restLeft}s)`)
await shot('B03-superset-rest')
await skipRestIfAny()
check(/Barbell row/i.test(await title()), 'B: row screen')
await log()
await skipRestIfAny()
check(/bench press/i.test(await title()), 'B: back to bench for round 2')
for (let i = 0; i < 4; i++) { await log(); await skipRestIfAny() }
check(/Lateral raise/i.test(await title()), 'B: after 3 rounds, lateral raise')
await log(); await skipRestIfAny(); await log()
await page.waitForTimeout(300)
check(/Session complete/i.test(await text()), 'B: session complete')
let d = await dump()
const mine = d.active[0].logged.filter(l => !l.isWarmup).map(l => l.exerciseId)
check(mine.join() === 'backward-walk,tibialis-raise,box-squat,box-squat,box-squat,bench-press,bb-row,bench-press,bb-row,bench-press,bb-row,lateral-raise,lateral-raise', 'B: set order: warm-up, squats, bench and row alternating, laterals')
await b.finishWithPain(1)
t = await text()
check(/Next up: FB 2/i.test(await title()), 'B: rotation moves to FB 2')
check(/done in warm-up/i.test(t), 'B: the warm-up counts as today\'s KOT')
check(/light today/i.test(t) && /Do KOT again \(light\)/.test(t), 'B: extra KOT today is the light version')
await shot('B04-today-after')

// Plan swap and back
await tap('plan'); await page.waitForTimeout(300)
t = await text()
check(/Switch to previous plan \(4-day split\)/.test(t), 'B: Plan offers to switch to your 4-day split')
await shot('B05-plan')
await tap(/Switch to previous plan/); await page.waitForTimeout(500)
d = await dump()
const lb = d.plan.find(x => x.key === 'lower-b')
check(d.plan.map(x => x.key).join() === 'upper-a,lower-a,upper-b,lower-b,kot' && lb.exercises.some(e => e.exId === 'box-squat' && e.kneeGated === false && e.overrideKg === 60), 'B: 4-day split restored with your squat edit, KOT kept')
await tap(/Switch to previous plan/); await page.waitForTimeout(500)
d = await dump()
check(d.plan.map(x => x.key).join() === 'fb-1,fb-2,fb-3,fb-4,kot', 'B: and back to full body in one tap')

// Stats and review
await tap('stats'); await page.waitForTimeout(400); await shot('B06-stats')
await tap('settings'); await page.waitForTimeout(300)
await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }))
await tap('Export for review'); await page.waitForTimeout(400)
const rv = await page.locator('textarea').inputValue()
check(/KOT \(daily knee routine\): 1 of 28 days/.test(rv) && /FB 1 \(home\)/.test(rv), 'B: review export shows KOT days and the full body plan')
check(/v5\.1/.test(await text()), 'B: Settings shows v5.1')
check(b.errors.length === 0, 'B: no console errors ' + b.errors.slice(0, 3).join(' | '))
await b.ctx.close(); server.close()
