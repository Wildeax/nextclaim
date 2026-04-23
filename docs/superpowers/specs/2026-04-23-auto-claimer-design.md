# Auto Claimer — Design Spec

**Date:** 2026-04-23
**Goal:** Wrap [vogler/free-games-claimer](https://github.com/vogler/free-games-claimer) in a small Electron desktop app so a non-technical user can install it from a single zip, log into Epic / Prime / GOG once, and have free games auto-claimed daily with friendly notifications.

## Goals & non-goals

**Goals**
- One-folder portable distribution. No installers, no admin prompts, no terminal.
- Tray + dashboard UX. Set-and-forget by default; dashboard for visibility/control.
- Reliable scheduling: at-Windows-login + once daily, with catch-up after offline periods.
- Native Windows notifications: daily summary on success, immediate toast on actionable errors.
- Fully self-contained data dir inside the portable folder (no `%APPDATA%` writes).

**Non-goals**
- Cloud sync, remote control, or multi-machine state sharing.
- Auto-update / signed installer (out of scope; manual zip swap when upstream updates).
- Modifying upstream `free-games-claimer` source. We wrap it as-is, pinned to a known-good commit.
- Cross-platform. Windows-only target (electron-builder `win` portable).
- Stores beyond Epic / Prime / GOG. (Unreal assets, AliExpress, Steam are out of scope.)

## Architecture

Single Electron process tree. Main process owns tray, scheduler, child-process runner, notifier, and `electron-store` settings/history. Renderer process is the dashboard window (hidden by default). Children are unmodified `node free-games-claimer/<store>.js` invocations spawned by the runner; their stdout is parsed for sentinels and IPC-broadcast to the renderer for live logs.

```
Auto Claimer.exe (electron-builder portable)
└── Electron MAIN process (long-running, lives in tray)
    ├── Tray              (Electron Tray API)
    ├── BrowserWindow     (hidden until tray click — the dashboard)
    ├── Scheduler         (node-cron: daily + at-launch trigger)
    ├── Claimer runner    (spawns Node child procs per store, queue of 1)
    ├── Notifier          (Electron Notification API, native toasts)
    └── Store             (electron-store: settings + history index)
        │ IPC                        │ child_process.spawn
        ▼                            ▼
    RENDERER               free-games-claimer/{epic,prime,gog}.js
    (dashboard)            stdout → main → IPC → renderer
```

Single user, single machine, all on `localhost`. No accounts, no auth, no servers.

## Components

### Tray (`ui/main.js`)
System tray icon. Right-click menu: *Open Dashboard*, *Claim Now*, *Pause schedule*, *Exit*. Left-click toggles dashboard window. Icon swaps to red-dot variant when last run had an actionable error.

### Dashboard window (`ui/renderer/`)
Single HTML page, hidden until tray click. Closing the window hides instead of quits (`win.on('close', e => { e.preventDefault(); win.hide(); })`); real exit only via tray menu *Exit*. Four panels:

- **Status** — last run timestamp per store, colored dot (green/yellow/red), "next scheduled run at HH:MM"
- **Actions** — `Claim Now` button (enqueues all 3 stores), per-store `Log in` buttons (spawns claimer with `SHOW=1` so its Firefox is visible)
- **History** — table of claimed games (date, store, game name, optional code) — joined from `data/{epic,prime,gog}-games.json` plus our `electron-store` index. Prime codes get a *Copy* button.
- **Live log** — terminal-style div, streams stdout from currently running child via IPC

### Scheduler (`ui/scheduler.js`)
`node-cron` running inside the main process. Two triggers:
1. On app launch: if `lastRunAt` is `> 18h ago` (or null), enqueue a claim run with 30 s delay (avoids hammering network on boot).
2. Daily cron at user-configured time (default `03:00`, configurable via dashboard Settings).

Schedule state and `lastRunAt` persist to `electron-store`.

### Claimer runner (`ui/runner.js`)
Wraps `child_process.spawn`. Owns a single-slot queue (Firefox profile is single-instance — no parallelism). Per job:

1. `spawn('node', ['epic-games.js'], { cwd: '<resources>/free-games-claimer/', env: {...process.env, SHOW: 0|1, BROWSER_DIR: undefined} })`. Electron's bundled Node executable is used; `process.execPath` with the `ELECTRON_RUN_AS_NODE=1` env var makes Electron behave as plain node for the child.
2. Pipe stdout/stderr; line-split; emit `run:line` events (broadcast to renderer for live log).
3. Parse each line for sentinels (table below); accumulate per-run state.
4. On child exit: emit `run:end {store, exitCode, claimed: [...], errors: [...], codes: [...]}`. Advance queue.

**Sentinel table (verified against upstream source):**

| Meaning | Sentinel | Stores |
|---|---|---|
| Login OK | `Signed in as <user>` | all |
| Login lost | `Not signed in anymore.` | all |
| Claimed | `Claimed successfully!` | epic, gog |
| Claimed (Prime) | `Redeemed successfully.` | prime |
| Already had | `Already in library! Nothing to claim.` | epic, gog |
| Already had (Prime code) | `Code was already used!` | prime |
| Failed | `Failed to claim!` | epic, gog |
| Captcha (Epic) | `Got hcaptcha challenge!` | epic |
| Captcha (GOG) | `Got a captcha during login` | gog |
| Captcha (Prime) | `Got captcha; could not redeem!` | prime |
| Code to redeem | `Code to redeem game: <code>` | prime |
| Linking needed | `Account linking is required to claim this offer!` | prime |
| Region-locked | `This product is unavailable in your region!` | epic |

### Notifier (`ui/notifier.js`)
Wraps `new Notification({title, body}).show()`. Two subscriptions on runner events:

- **Daily summary** — at end of full 3-store run, if `claimed.length > 0` or `codes.length > 0`, fire one toast: *"Claimed 2 today: Game X (Epic), Game Y (GOG) — and 1 code to redeem"*
- **Error toast** — immediate, on `login_required` / `captcha` / `linking_needed` / `crash` classifications: *"Epic Games needs you to log in again — open Auto Claimer"*. Clicking the toast brings the dashboard window to front.

### Store (`ui/store.js`)
`electron-store` for: schedule time, paused flag, `lastRunAt`, `lastRunPerStore`, autostart-on-login flag, first-run-completed flag, denormalized history index for fast dashboard render. Source-of-truth claim records still live in `free-games-claimer/data/{store}-games.json` (multi-user shape `db.data[user][game_id] = {title, time, url, status}`); we sync our index from those after each run.

## Data flow

### App launch (every Windows startup)
1. `Auto Claimer.exe` starts. Main process boots, creates tray icon, creates hidden `BrowserWindow`, loads renderer.
2. Scheduler reads `lastRunAt`. If `> 18h ago` or null, enqueues a claim run with 30 s delay.
3. Tray icon visible; otherwise silent.

### Tray icon clicked
1. Main shows the dashboard window. Renderer IPC `get-status` → main returns last run per store, queue state, schedule, recent history. Renders four panels.
2. If a run is in progress, live-log is already streaming.

### "Claim Now" clicked
1. Renderer IPC `run-all` → main enqueues 3 jobs (Epic → Prime → GOG).
2. Runner spawns each child with `SHOW=0` (headless Firefox), pipes stdout, classifies sentinels.
3. After all 3 done: notifier fires daily-summary toast if anything new; `lastRunAt` and `lastRunPerStore` updated; renderer status panel refreshes.

### "Log in to <store>" clicked
1. Renderer IPC `login <store>` → runner spawns that store's script with `SHOW=1` (visible Firefox).
2. Spawned child has no TTY, so `enquirer.prompt` calls fail-swallow (caught and ignored upstream); the script falls through to "wait for browser login" mode. She logs in via the visible Firefox; cookies save to `data/browser/`. The script then auto-claims any current free game and exits.
3. Subsequent scheduled runs are fully headless.

### Scheduled fire (daily at 03:00)
Identical to *Claim Now* path; no UI is open. Toasts fire regardless of UI state.

### Window close
`close` event preventDefault'd; window hides. App stays in tray. Real exit only via tray menu *Exit*.

## First-run experience

1. Tray icon appears. Dashboard window auto-opens (detected by absence of `firstRunCompleted` in `electron-store`).
2. **Welcome panel** replaces the normal dashboard. Three cards (Epic / Prime / GOG), each with `[ Log in ]` button and `[ Skip ]` link, status starts at **Not connected**.
3. She clicks `Log in to Epic`. Visible Firefox opens. Welcome panel shows *"Log in to Epic in the browser window. The window will close itself when you're done."* with live-log line below.
4. She logs in. Cookies persist. Claimer auto-claims any current free game, exits. Card flips to **✓ Connected** and shows the user it signed in as.
5. Repeat for Prime and GOG. Independent; order doesn't matter.
6. All three handled (connected or skipped) → Welcome collapses, Settings panel slides in:
   - *Daily run time* — time picker, default `03:00`
   - *Run when Windows starts* — checkbox, default ON
   - *Start Auto Claimer when I log into Windows* — checkbox, default ON (writes shortcut to `shell:startup`)
   - `[ Done ]`
7. Window hides to tray. Toast: *"Auto Claimer is running. I'll claim your free games every day at 3 AM."*
8. `firstRunCompleted = true`. From now on, launches go straight to the normal dashboard.

**Edge cases**
- She closes Firefox without logging in → claimer hits `LOGIN_TIMEOUT` (180 s), exits non-zero. Card stays **Not connected** with *Try again* button.
- She logs in but Epic shows hcaptcha → claimer logs `Got hcaptcha challenge!`, exits. Card shows **⚠ Captcha — try again later** with retry button.
- She skips a store → that store excluded from scheduled runs; re-enable from Settings later.

## Error handling

Errors classified by what *she* needs to do about them:

| Class | Detection | Toast | Dashboard state |
|---|---|---|---|
| OK, claimed | exit 0 + saw `Claimed successfully!` / `Redeemed successfully.` | Daily summary | History row added; dot green |
| OK, nothing new | exit 0; only `Already in library!` / `Signed in as` | (silent) | Dot green; "last run: just now" |
| Login expired | saw `Not signed in anymore.` OR exit non-zero with `Signed in as` never seen | Immediate: *"X needs you to log in again — click here"* | Dot yellow; *Log in* highlighted |
| Captcha | saw any captcha sentinel | Immediate: *"X showed a captcha — click Log in to X"* | Dot yellow; banner |
| Linking needed (Prime) | saw `Account linking is required` | Immediate: *"A Prime offer needs you to link Twitch/store account"* | History row tagged "needs linking" with URL |
| Code to redeem (Prime) | saw `Code to redeem game:` | Daily summary mentions count | History row shows code with **Copy** button |
| Region-locked | saw `This product is unavailable in your region!` | (silent — not actionable) | History row tagged "region-locked" |
| Crash / unknown | exit non-zero, no recognized sentinels | Immediate: *"Auto Claimer hit an error on X — open to see logs"* | Dot red; last 50 log lines retained |

**Network failures** (`ENOTFOUND`, `ECONNRESET`, Playwright timeouts) → *Crash / unknown*. Runner retries the whole run once after 5 minutes; if still failing, fires the toast.

**Main-process crash** → `process.on('uncaughtException')` writes to rolling log at `<portable>/logs/main.log`, swaps tray icon to red-dot. On next launch, dashboard surfaces *"Last session ended unexpectedly — view log"*.

**Concurrency** → single-slot queue. Clicking *Claim Now* during an active run shows "Already running…" instead of double-spawning.

**Long offline (e.g. she moved her PC for a week)** → no special handling. Next launch detects `lastRunAt` stale, fires single catch-up run after 30 s. Same flow as a normal scheduled run.

## File layout

**Repo (what we build & maintain — `D:\Games\auto-claimer\`):**

```
auto-claimer/
├── ui/
│   ├── main.js                  ← main process: tray, scheduler, runner, notifier
│   ├── preload.js               ← IPC bridge (contextIsolation: true)
│   ├── runner.js                ← child-process wrapper + sentinel parser
│   ├── scheduler.js             ← node-cron + on-launch logic
│   ├── store.js                 ← electron-store wrapper
│   ├── notifier.js              ← Notification API wrapper
│   └── renderer/
│       ├── index.html
│       ├── renderer.js
│       └── style.css
├── free-games-claimer/          ← git submodule, pinned to a known-good commit
├── assets/
│   ├── tray-icon.ico
│   ├── tray-icon-error.ico
│   └── installer-icon.ico
├── package.json                 ← electron, electron-builder, electron-store, node-cron
├── electron-builder.yml         ← portable target, win, x64
└── README.md
```

**Build output (`npm run build` produces):**

```
dist/
└── Auto Claimer/                                    ← zipped & sent to her
    ├── Auto Claimer.exe                             ← electron-builder portable, ~180 MB
    ├── resources/
    │   ├── app.asar                                 ← packed ui/ source
    │   └── free-games-claimer/                      ← unpacked via asarUnpack
    │       ├── epic-games.js, prime-gaming.js, gog.js
    │       ├── src/, node_modules/
    │       └── data/                                ← starts empty; cookies + history land here
    └── (electron runtime files)
```

`free-games-claimer/` must be unpacked (not inside asar) because the claimer writes to `data/` next to its scripts at runtime. `electron-builder`'s `asarUnpack: ['free-games-claimer/**/*']` directive handles this.

Total compressed zip: **~120 MB** (Electron runtime + Playwright Firefox + node_modules).

## Distribution

1. Build on dev PC: `npm run build`
2. Zip `dist/Auto Claimer/` → `AutoClaimer.zip`
3. Send via Discord / Drive / USB
4. She extracts anywhere (Desktop, Documents — fully relocatable, all paths relative to `.exe`)
5. Double-click `Auto Claimer.exe` → first-run flow

**Updates** — when upstream `free-games-claimer` ships fixes (typically Epic captcha workarounds, or store DOM changes): bump the submodule, retest, rebuild, send new zip. README tells her to extract over old folder; her `data/` survives because `asarUnpack` keeps it on disk (and the rebuild's empty `data/` doesn't overwrite an existing populated `data/` if she extracts with "skip existing").

**No autoupdater** — Electron's autoupdater needs a code-signing cert (~$300/yr) and a hosting URL. Not worth it for a 1-user share. Manual zip swap gives full control of when she gets new versions.

## Tech choices summary

| Choice | Why |
|---|---|
| Electron | Native tray + window + notifications + bundled Node, no separate runtime to install on her PC |
| `electron-builder` portable target | Single-folder, zero-install distribution |
| `node-cron` | Simple in-process scheduling; no external service |
| `electron-store` | Tiny JSON-file persistence for settings/history index; no SQLite needed |
| Wrap upstream unmodified | Easy to update via submodule bump; we don't fork |
| Pin upstream commit | Avoids "she updated and stuff broke" surprises |
| Sentinel parsing of stdout | Upstream has no programmatic API; stdout strings are stable enough |
| `SHOW=1` for login, `SHOW=0` for scheduled | Reuses upstream behavior; no special "login-only" mode needed |

## Open questions / future work (out of scope for v1)

- Code-signing the .exe (would remove SmartScreen warning on first launch — currently she'll click "More info → Run anyway" once)
- Notify via Discord / Telegram / email instead of (or alongside) Windows toasts
- Add Unreal Engine asset claiming (uses same Epic login)
- Multi-user support (multiple accounts per store)
- Auto-redeem Prime codes on Steam (would need separate automation per target store)
