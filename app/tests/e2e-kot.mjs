// v5 live app with the 17 Nov backup -> upgrade to v5.1 on the same origin -> KOT flows.
// Usage: CHROME_BIN=... node tests/e2e-kot.mjs <v5Dir> <newDir> <backup.json> <shotsDir>
import { chromium } from 'playwright-core'
import http from 'node:http'
import { readFileSync, existsSync, mkdtempSync } from 'node:fs'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'

const [oldDir, newDir, backup, shots] = process.argv.slice(2)
let serveDir = oldDir
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/liftlog/, '')
  if (p === '/' || p === '') p = '/index.html'
  const f = join(serveDir, p)
  if (!existsSync(f)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
  res.end(readFileSync(f))
}).listen(4318)
const URL_ = 'http://localhost:4318/liftlog/'

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'llk-')), {
  executablePath: process.env.CHROME_BIN, viewport: { width: 393, height: 852 }, deviceScaleFactor: 2,
  isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: 'dark',
})
const page = ctx.pages()[0] ?? await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('dialog', d => d.accept())
const shot = n => page.screenshot({ path: join(shots, n + '.png'), fullPage: true })
const tap = (name, exact = false) => page.getByRole('button', { name, exact }).first().click()
const text = () => page.locator('body').innerText()
const check = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1 }
const dump = () => page.evaluate(() => new Promise(res => {
  const r = indexedDB.open('liftlog')
  r.onsuccess = () => {
    const db = r.result, out = { version: db.version }, names = [...db.objectStoreNames]
    const tx = db.transaction(names, 'readonly'); let left = names.length
    for (const n of names) { const q = tx.objectStore(n).getAll(); q.onsuccess = () => { out[n] = q.result; if (--left === 0) { db.close(); res(out) } } }
  }
}))
const logBtn = () => page.getByRole('button', { name: 'Log set', exact: true })
async function runSession() {
  for (let i = 0; i < 30; i++) {
    const t = await text()
    if (/Session complete/i.test(t)) return
    if (await page.getByRole('button', { name: 'Skip rest' }).count()) { await tap('Skip rest'); await page.waitForTimeout(150); continue }
    await logBtn().click(); await page.waitForTimeout(250)
  }
}
async function finishWithPain(p) {
  await tap('Knee check and finish'); await page.waitForTimeout(200)
  await page.locator('input[type=range]').fill(String(p))
  await tap('Save and finish'); await page.waitForTimeout(700)
}

// 1. live v5 with the real backup
await page.goto(URL_); await page.waitForTimeout(800)
await tap('settings')
const fc = page.waitForEvent('filechooser'); await tap('Import a backup'); await (await fc).setFiles(backup)
await page.waitForTimeout(800)
check((await text()).includes('Backup restored'), 'v5 imported the 17 Nov backup')
const before = await dump()

// 2. upgrade to v5.1
serveDir = newDir
await page.goto(URL_); await page.waitForTimeout(1200)
const after = await dump()
check(after.version === 50, `database upgraded to version 5 (got ${after.version / 10})`)
check(after.setLogs.length === before.setLogs.length && after.sessions.length === before.sessions.length, `all ${after.setLogs.length} sets and ${after.sessions.length} sessions kept`)
check(after.plan.length === 5 && after.plan.at(-1).key === 'kot' && after.plan.at(-1).inRotation === false, 'KOT day added outside the rotation')
check(JSON.stringify(after.plan.slice(0, 4)) === JSON.stringify(before.plan), 'your four days are byte-for-byte unchanged')
const t1 = await text()
check(/Next up: Lower A/i.test(t1), 'Today still offers Lower A next')
check(!/\bKOT\s*•/.test(t1) && /KOT daily/i.test(t1), 'KOT shows as its own card, not a rotation chip')
check(/Start KOT\b/.test(t1) && !/Start KOT \(light\)/.test(t1), 'full KOT offered (no leg day in the last day)')
await shot('01-today-kot')

// 3. full KOT
await tap(/^Start KOT/); await page.waitForTimeout(400)
const w = await text()
check(/Backward walk/i.test(w) && /MINUTES/i.test(w), 'KOT opens on the backward walk, logged in minutes')
await shot('02-kot-backward-walk')
await runSession()
await shot('03-kot-done')
await finishWithPain(2)
const t2 = await text()
check(/done today/i.test(t2), 'KOT marked done today')
check(/Next up: Lower A/i.test(t2) && /Start Lower A/.test(t2), 'rotation untouched: still Start Lower A (not "train again")')
let d = await dump()
const kotCheck = d.kneeChecks.at(-1)
check(kotCheck.source === 'kot' && kotCheck.pain === 2, 'KOT pain saved as a KOT knee check')

// 4. leg day today -> light KOT
await tap('Start Lower A'); await page.waitForTimeout(300)
await logBtn().click(); await page.waitForTimeout(250)
await tap('menu', true); await tap('Finish session now'); await page.waitForTimeout(200)
await finishWithPain(1)
const t3 = await text()
check(/light today/i.test(t3) && /Do KOT again \(light\)/.test(t3), 'after a leg day KOT switches to the light version, and says so')
await shot('04-today-after-leg')
await tap(/^Do KOT again/); await page.waitForTimeout(300)
await runSession()
d = await dump()
check(d.active[0].exercises.map(e => e.exId).join() === 'backward-walk,tibialis-raise,couch-stretch', 'light KOT has the three light exercises')
await finishWithPain(5)
const t4 = await text()
check(/Knee gate/i.test(t4) && /flagged/i.test(t4), 'KOT pain 5 flags the knee gate')

// 5. plan, stats, review
await tap('plan'); await page.waitForTimeout(300); await tap('KOT', true); await page.waitForTimeout(300)
check(/outside the rotation/i.test(await text()), 'Plan shows the KOT day for editing')
await shot('05-plan-kot')
await tap('stats'); await page.waitForTimeout(400)
check(/KOT days per week/i.test(await text()), 'Stats has a KOT card')
await shot('06-stats')
await tap('settings'); await page.waitForTimeout(300)
await page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }))
await tap('Export for review'); await page.waitForTimeout(400)
const rv = await page.locator('textarea').inputValue()
check(/KOT \(daily knee routine\): 1 of 28 days/.test(rv) && /KOT, pain 5/.test(rv), 'review export reports KOT days and KOT pain')
check(/v5\.1/.test(await text()), 'Settings shows v5.1')
check(errors.length === 0, 'no console errors ' + errors.slice(0, 3).join(' | '))
await ctx.close(); server.close()
