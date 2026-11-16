// End-to-end: old live app with the real backup -> upgrade to the new build on the same origin.
// Usage: node tests/e2e.mjs <oldDir> <newDir> <backup.json> <shotsDir>
import { chromium } from 'playwright-core'
import http from 'node:http'
import { readFileSync, existsSync, mkdtempSync } from 'node:fs'
import { join, extname } from 'node:path'
import { tmpdir } from 'node:os'

const [oldDir, newDir, backup, shots] = process.argv.slice(2)
let serveDir = oldDir
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' }
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/liftlog/, '')
  if (p === '/' || p === '') p = '/index.html'
  const f = join(serveDir, p)
  if (!existsSync(f)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': types[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-store' })
  res.end(readFileSync(f))
}).listen(4317)
const URL_ = 'http://localhost:4317/liftlog/'

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'll-')), {
  executablePath: process.env.CHROME_BIN,
  viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  serviceWorkers: 'block', colorScheme: 'dark',
})
const page = ctx.pages()[0] ?? await ctx.newPage()
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
page.on('dialog', d => { console.log('  dialog:', d.message().slice(0, 90)); d.accept() })
const shot = async n => page.screenshot({ path: join(shots, n + '.png'), fullPage: true })
const tap = async (name, opts = {}) => page.getByRole('button', { name, exact: opts.exact ?? false }).first().click()
const text = async () => page.locator('body').innerText()
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1 }
const idb = (fn) => page.evaluate(fn)
const counts = () => idb(() => new Promise(res => {
  const r = indexedDB.open('liftlog')
  r.onsuccess = () => {
    const db = r.result, out = { version: db.version }
    const names = [...db.objectStoreNames]
    const tx = db.transaction(names, 'readonly')
    let left = names.length
    for (const n of names) { const q = tx.objectStore(n).getAll(); q.onsuccess = () => { out[n] = q.result; if (--left === 0) { db.close(); res(out) } } }
  }
}))

// 1. OLD app: import the real backup through its own UI
await page.goto(URL_)
await page.waitForTimeout(800)
await tap('Settings')
const fc = page.waitForEvent('filechooser')
await tap('Import a backup')
await (await fc).setFiles(backup)
await page.waitForTimeout(800)
check((await text()).includes('Backup restored'), 'old app imported the real backup')
let before = await counts()
console.log(`  old db v${before.version}: ${before.setLogs.length} sets, ${before.sessions.length} sessions, plan ${before.plan.length} days`)

// 2. Swap in the NEW build on the same origin and reload: Dexie upgrade must run
serveDir = newDir
await page.goto(URL_)
await page.waitForTimeout(1200)
let after = await counts()
console.log(`  new db v${after.version}: ${after.setLogs.length} sets, ${after.sessions.length} sessions, plan ${after.plan.length} days`)
check(after.version === 50, 'database upgraded to version 5')
check(after.setLogs.length === before.setLogs.length, 'all sets kept')
check(after.sessions.length === before.sessions.length, 'all sessions kept')
check(after.kneeChecks.length === before.kneeChecks.length, 'all knee checks kept')
check(after.plan.length === 5 && after.plan.some(d => d.key === 'lower-a' && d.location === 'gym'), '4-day plan with gym Lower A')
check(after.settings.some(s => s.key === 'planArchive'), 'old 6-day plan archived')
const longest = Math.max(...after.sessions.map(s => (s.finishedTs - s.startedTs - (s.pausedMs ?? 0)) / 60000))
check(longest < 180, `no session over 3 hours (longest ${Math.round(longest)} min)`)
check(errors.length === 0, 'no console errors after upgrade ' + errors.join(' | '))
const t1 = await text()
check(t1.includes('Next up: Upper A'), 'Today offers Upper A next')
check(t1.includes('3/10'), 'knee gate shows the limit message')
await shot('01-today-after-upgrade')

// 3. History shows auto-closed sessions
await tap('history')
await page.waitForTimeout(300)
const h = await text()
check((h.match(/auto-closed/g) ?? []).length === 3, 'three sessions marked auto-closed in History')
await shot('02-history')

// 4. Run Upper A: one-tap logging, double-tap guard, rest, finish
await tap('today')
await page.waitForTimeout(500)
await tap('Start Upper A')
await page.waitForTimeout(500)
const w1 = await text()
check(w1.includes('Barbell bench press') && w1.includes('Per side: 20'), 'bench shows plate breakdown for 60 kg')
await shot('03-workout-bench')
const logBtn = page.getByRole('button', { name: 'Log set', exact: true })
await logBtn.dblclick()
await page.waitForTimeout(400)
let st = await counts()
check(st.active[0].logged.length === 1, 'double tap logged one set, not two')
await shot('04-rest')
await tap('Skip rest')
await page.waitForTimeout(300)
// weight + steps through buildable loads only
await page.getByRole('button', { name: 'more kg' }).click()
await page.waitForTimeout(150)
check((await text()).includes('70') , 'plus steps bench 60 -> 70 (next load you can build)')
await page.getByRole('button', { name: 'less kg' }).click()
await logBtn.click(); await page.waitForTimeout(300); await tap('Skip rest')
await logBtn.click(); await page.waitForTimeout(300); await tap('Skip rest')
await page.waitForTimeout(300)
check((await text()).includes('Barbell row'), 'moves to barbell row after 3 bench sets')
await tap('menu', { exact: true })
await tap('Finish session now')
await page.waitForTimeout(300)
await shot('05-finish')
await tap('Finish', { exact: true })
await page.waitForTimeout(600)
check((await text()).includes('Next up: Lower A'), 'rotation moves to Lower A')
await shot('06-today-lower-a')

// 5. Lower A at the gym: knee gate, iso in seconds, pain 4 -> hold next time
await tap(/(Start|Train again:) Lower A/)
await page.waitForTimeout(500)
const iso = await text()
check(iso.includes('Leg extension isometric hold') && iso.includes('SECONDS'), 'gym iso hold logs seconds')
await shot('07-iso')
await tap('exercises')
await page.getByRole('button', { name: /Box squat to bench/ }).click()
await page.waitForTimeout(400)
const sq = await text()
check(sq.includes('Using the weight you set in the plan') && /\b50\b/.test(sq), 'box squat restarts at 50 kg')
// try to jump 3 steps above target -> confirm prompt (auto-accepted, logged in output)
for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'more kg' }).click()
await logBtn.click()
await page.waitForTimeout(300)
await tap('menu', { exact: true }); await tap('Finish session now'); await page.waitForTimeout(200)
await tap('Knee check and finish')
await page.locator('input[type=range]').fill('4')
await shot('08-knee-check')
await tap('Save and finish')
await page.waitForTimeout(600)
const t2 = await text()
check(t2.includes('Next up: Upper B'), 'rotation moves to Upper B')
check(t2.includes('flagged'), 'pain 4 sets the knee gate to hold')

// 6. Auto-close a forgotten session using a fake clock
await page.clock.install()
await tap(/(Start|Train again:) Upper B/)
await page.waitForTimeout(400)
await logBtn.click()
await page.waitForTimeout(300)
await page.clock.fastForward('40:00')
await page.waitForTimeout(800)
st = await counts()
check(st.active.length === 0, 'session left open for 40 min was auto-closed')
const last = st.sessions[st.sessions.length - 1]
check(last.autoClosed === true && last.dayKey === 'upper-b', 'auto-closed session saved with its sets')
await page.reload(); await page.waitForTimeout(800)
check((await text()).includes('was left open'), 'Today explains the auto-close')
await shot('09-autoclose-notice')

// 7. Stats, Plan, Settings render; review export
await tap('stats'); await page.waitForTimeout(400); await shot('10-stats')
check((await text()).toLowerCase().includes('knee and box squat'), 'stats shows knee vs squat')
await tap('plan'); await page.waitForTimeout(400); await shot('11-plan')
await tap('settings'); await page.waitForTimeout(300)
await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }) })
await tap('Export for review'); await page.waitForTimeout(400)
const rv = await page.locator('textarea').inputValue()
check(rv.includes('LiftLog review') && rv.split(/\s+/).length < 400, `review export (${rv.split(/\s+/).length} words)`)
await shot('12-settings')
const dl = page.waitForEvent('download')
await tap('Export everything')
const file = await (await dl).path()
const exp = JSON.parse(readFileSync(file, 'utf8'))
check(exp.schema === 5 && exp.setLogs.length > before.setLogs.length, 'backup export is schema 4 with new sets')

// 8. Re-import the OLD backup into the new app: same migration applies
const fc2 = page.waitForEvent('filechooser')
await tap('Import a backup')
await (await fc2).setFiles(backup)
await page.waitForTimeout(800)
const im = await text()
check(im.includes('4-day plan was applied') && im.includes('3 sessions left open'), 'importing an old backup upgrades it too')
check(errors.length === 0, 'no console errors overall ' + errors.slice(0, 3).join(' | '))
await ctx.close(); server.close()
