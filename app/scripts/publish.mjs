// Copy the built app from dist/ to the repo root, which is what GitHub Pages serves.
// Only build outputs are replaced; source in app/ and the README are left alone.
import { cpSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const dist = join(here, '..', 'dist')
const root = join(here, '..', '..')
// remove stale workbox runtime files from earlier builds
for (const f of readdirSync(root)) if (/^workbox-.*\.js$/.test(f)) rmSync(join(root, f))
for (const f of readdirSync(dist)) cpSync(join(dist, f), join(root, f), { recursive: true })
console.log('published to repo root:', readdirSync(dist).join(', '))
if (!existsSync(join(root, 'index.html'))) throw new Error('index.html missing after publish')
