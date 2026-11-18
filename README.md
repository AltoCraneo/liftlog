# LiftLog

Personal strength training tracker. Local-first PWA: all data stays in the phone's browser storage, works offline, free to host on GitHub Pages.

- **Live app:** https://altocraneo.github.io/liftlog/ (open in Safari, Share, Add to Home Screen)
- **Source:** `app/` (Vite + React + TypeScript + Dexie). The files in the repo root are the built app that GitHub Pages serves.

## Update the app

```
cd app
npm install
npm test        # logic tests (LIFTLOG_BACKUP / LIFTLOG_BACKUP_NEW = backup files to also test against real data)
# upgrade tests in a phone-size browser: see app/tests/e2e-upgrade.mjs
npm run build   # typecheck, build, and copy the built files to the repo root
git add -A && git commit -m "..." && git push
```

The installed app picks up a new version on the next launch. Data on the phone survives updates: the database is upgraded in place (see `app/src/db.ts`, version 4 upgrade).

## How it works

- `app/src/programme.ts`: four 30-minute full body sessions in rotation (FB 1 to 4, supersets, built-in KOT warm-up) plus the daily KOT routine outside the rotation.
- `app/src/progression.ts`: double progression, knee gate (pain 0 to 10, 3 = the limit), rotation by least recently done.
- `app/src/equipment.ts`: only suggests loads that can be built with the plates, dumbbells and cable stack available at home or at the gym.
- `app/src/migrate.ts`: upgrade from the v4 app (6-day plan) and from older backup files.
- `app/src/review.ts`: the "Export for review" summary to paste into a chat with Claude.
