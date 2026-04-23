# Auto Claimer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a portable Windows Electron app that wraps `vogler/free-games-claimer`, gives a non-technical user a tray + dashboard UX, claims free Epic / Prime / GOG games on a schedule, and ships as a single zip.

**Architecture:** Single Electron main process (tray, scheduler, runner, notifier, store) + hidden `BrowserWindow` for the dashboard. Children are unmodified `node free-games-claimer/<store>.js` invocations whose stdout is parsed for sentinel strings. No HTTP server, no autoupdater, no cloud — fully portable folder, all state inside it.

**Tech Stack:** Electron 32+, electron-builder (portable Win target), node-cron, electron-store, Vitest (tests), `vogler/free-games-claimer` as git submodule pinned to a known-good commit.

**Spec:** `docs/superpowers/specs/2026-04-23-auto-claimer-design.md`

---

## File structure

**Created by this plan:**
```
auto-claimer/
├── .gitignore
├── .gitmodules                     ← submodule pin
├── package.json                    ← electron, electron-builder, node-cron, electron-store, vitest
├── package-lock.json
├── electron-builder.yml            ← portable target, asarUnpack
├── README.md                       ← dev README (build instructions)
├── DISTRIBUTE-README.txt           ← README that ships in the zip (for her)
├── ui/
│   ├── main.js                     ← Electron entry: app boot, tray, BrowserWindow, IPC routes
│   ├── preload.js                  ← contextBridge exposing window.api
│   ├── sentinels.js                ← PURE: parseLine(line) → {type, payload}
│   ├── classifier.js               ← PURE: classify(events, exitCode) → {class, summary}
│   ├── store.js                    ← electron-store wrapper (settings, history index, lastRunAt)
│   ├── runner.js                   ← spawn queue, sentinel collection, EventEmitter
│   ├── scheduler.js                ← node-cron + at-launch staleness check
│   ├── notifier.js                 ← Notification API wrapper
│   ├── autostart.js                ← shell:startup shortcut writer
│   └── renderer/
│       ├── index.html
│       ├── renderer.js             ← UI logic, IPC client
│       ├── welcome.js              ← first-run wizard logic
│       └── style.css
├── assets/
│   ├── tray-icon.ico
│   ├── tray-icon-error.ico
│   └── installer-icon.ico
├── tests/
│   ├── sentinels.test.js
│   ├── classifier.test.js
│   ├── store.test.js
│   ├── runner.test.js
│   ├── scheduler.test.js
│   └── fixtures/
│       └── fake-claimer.js          ← stdin-driven fake child for runner tests
├── free-games-claimer/              ← git submodule
└── docs/superpowers/
    ├── specs/2026-04-23-auto-claimer-design.md
    └── plans/2026-04-23-auto-claimer.md   ← this file
```

---

## Task 1: Project scaffold + git init

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`

- [ ] **Step 1: Initialize git**

```bash
git init
git add docs/
git commit -m "chore: initial spec and plan"
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
dist/
data/
logs/
*.log
.DS_Store
Thumbs.db
.vscode/
free-games-claimer/data/
free-games-claimer/node_modules/
```

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "auto-claimer",
  "version": "0.1.0",
  "description": "Friendly Electron wrapper for vogler/free-games-claimer",
  "main": "ui/main.js",
  "type": "module",
  "scripts": {
    "start": "electron .",
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "electron-builder --win portable"
  },
  "devDependencies": {
    "electron": "^32.0.0",
    "electron-builder": "^25.0.0",
    "vitest": "^2.0.0"
  },
  "dependencies": {
    "electron-store": "^10.0.0",
    "node-cron": "^3.0.3"
  }
}
```

- [ ] **Step 4: Create `README.md`** (dev-facing, brief)

```markdown
# Auto Claimer

Electron wrapper around [vogler/free-games-claimer](https://github.com/vogler/free-games-claimer).

## Dev
- `npm install`
- `git submodule update --init`
- `cd free-games-claimer && npm install && cd ..`
- `npm start`

## Test
- `npm test`

## Build distributable
- `npm run build` → `dist/Auto Claimer/`
- Zip `dist/Auto Claimer/` → ship to user.

See `docs/superpowers/specs/2026-04-23-auto-claimer-design.md` for design.
```

- [ ] **Step 5: Install deps**

Run: `npm install`
Expected: completes without errors, `node_modules/` exists, `package-lock.json` written.

- [ ] **Step 6: Commit**

```bash
git add .gitignore package.json package-lock.json README.md
git commit -m "chore: project scaffold"
```

---

## Task 2: Add free-games-claimer submodule

**Files:**
- Create: `.gitmodules`, `free-games-claimer/` (submodule)

- [ ] **Step 1: Add submodule pinned to current HEAD of our fork**

We use a fork (`Wildeax/free-games-claimer-for-non-programmers`) instead of the upstream so we can patch the claimer when needed (e.g. custom sentinels, login-only mode). The submodule directory inside our project is still `free-games-claimer/` for path simplicity.

```bash
git submodule add https://github.com/Wildeax/free-games-claimer-for-non-programmers.git free-games-claimer
cd free-games-claimer
git rev-parse HEAD   # note this commit SHA in your commit message
npm install
cd ..
```

Expected: `free-games-claimer/` populated, `.gitmodules` created, `node_modules` inside it (~150 MB), Playwright Firefox cached to `%USERPROFILE%\AppData\Local\ms-playwright\`.

To pull upstream updates into the fork later: `cd free-games-claimer && git remote add upstream https://github.com/vogler/free-games-claimer.git && git fetch upstream && git merge upstream/main`

- [ ] **Step 2: Sanity-check the claimer runs**

Run: `cd free-games-claimer && SHOW=1 node epic-games.js` (use bash; on PowerShell use `$env:SHOW=1; node epic-games.js`)
Expected: Firefox window opens to Epic Games. Close it, hit Ctrl+C. (We're confirming Playwright works — no need to actually log in here.)

- [ ] **Step 3: Commit**

```bash
git add .gitmodules free-games-claimer
git commit -m "chore: add free-games-claimer submodule (pinned to <SHA>)"
```

---

## Task 3: Sentinel parser (TDD, pure)

**Files:**
- Create: `ui/sentinels.js`, `tests/sentinels.test.js`

- [ ] **Step 1: Write failing tests**

`tests/sentinels.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { parseLine } from '../ui/sentinels.js';

describe('parseLine', () => {
  it('parses "Signed in as <user>"', () => {
    expect(parseLine('Signed in as alice')).toEqual({ type: 'login_ok', user: 'alice' });
  });

  it('parses "Signed in as" with multi-word user', () => {
    expect(parseLine('Signed in as alice@example.com')).toEqual({ type: 'login_ok', user: 'alice@example.com' });
  });

  it('parses "Not signed in anymore."', () => {
    expect(parseLine('Not signed in anymore.')).toEqual({ type: 'login_lost' });
  });

  it('parses "Claimed successfully!" (Epic/GOG)', () => {
    expect(parseLine('Claimed successfully!')).toEqual({ type: 'claimed' });
    expect(parseLine('  Claimed successfully!')).toEqual({ type: 'claimed' });
  });

  it('parses "Redeemed successfully." (Prime)', () => {
    expect(parseLine('  Redeemed successfully.')).toEqual({ type: 'claimed' });
  });

  it('parses "Already in library! Nothing to claim."', () => {
    expect(parseLine('Already in library! Nothing to claim.')).toEqual({ type: 'already_owned' });
  });

  it('parses "Code was already used!" (Prime)', () => {
    expect(parseLine('  Code was already used!')).toEqual({ type: 'already_owned' });
  });

  it('parses "Failed to claim!"', () => {
    expect(parseLine('Failed to claim!')).toEqual({ type: 'failed' });
  });

  it('parses Epic captcha', () => {
    expect(parseLine('Got hcaptcha challenge!')).toEqual({ type: 'captcha' });
  });

  it('parses GOG captcha', () => {
    expect(parseLine('Got a captcha during login (likely due to too many attempts)!')).toEqual({ type: 'captcha' });
  });

  it('parses Prime captcha', () => {
    expect(parseLine('  Got captcha; could not redeem!')).toEqual({ type: 'captcha' });
  });

  it('parses Prime "Code to redeem game: <code>"', () => {
    expect(parseLine('  Code to redeem game: ABC-DEF-GHI')).toEqual({ type: 'code', code: 'ABC-DEF-GHI' });
  });

  it('parses Prime "Account linking is required..."', () => {
    expect(parseLine('  Account linking is required to claim this offer!')).toEqual({ type: 'linking_needed' });
  });

  it('parses Epic region-locked', () => {
    expect(parseLine('This product is unavailable in your region!')).toEqual({ type: 'region_locked' });
  });

  it('returns null for unrecognized lines', () => {
    expect(parseLine('Some random log line')).toBeNull();
    expect(parseLine('')).toBeNull();
  });

  it('strips ANSI color codes', () => {
    expect(parseLine('[32mClaimed successfully![0m')).toEqual({ type: 'claimed' });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- tests/sentinels.test.js`
Expected: all fail with "Cannot find module '../ui/sentinels.js'" or similar.

- [ ] **Step 3: Implement `ui/sentinels.js`**

```javascript
const ANSI_RE = /\[[0-9;]*m/g;

const PATTERNS = [
  { re: /^Signed in as (.+)$/, build: m => ({ type: 'login_ok', user: m[1] }) },
  { re: /^Not signed in anymore\.?$/, build: () => ({ type: 'login_lost' }) },
  { re: /^Claimed successfully!$/, build: () => ({ type: 'claimed' }) },
  { re: /^Redeemed successfully\.$/, build: () => ({ type: 'claimed' }) },
  { re: /^Already in library! Nothing to claim\.$/, build: () => ({ type: 'already_owned' }) },
  { re: /^Code was already used!$/, build: () => ({ type: 'already_owned' }) },
  { re: /^Failed to claim!$/, build: () => ({ type: 'failed' }) },
  { re: /^Got hcaptcha challenge!$/, build: () => ({ type: 'captcha' }) },
  { re: /^Got a captcha during login.*$/, build: () => ({ type: 'captcha' }) },
  { re: /^Got captcha; could not redeem!$/, build: () => ({ type: 'captcha' }) },
  { re: /^Code to redeem game:\s*(\S+)\s*$/, build: m => ({ type: 'code', code: m[1] }) },
  { re: /^Account linking is required to claim this offer!$/, build: () => ({ type: 'linking_needed' }) },
  { re: /^This product is unavailable in your region!$/, build: () => ({ type: 'region_locked' }) },
];

export function parseLine(line) {
  if (!line) return null;
  const stripped = line.replace(ANSI_RE, '').trim();
  for (const { re, build } of PATTERNS) {
    const m = stripped.match(re);
    if (m) return build(m);
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/sentinels.test.js`
Expected: 16/16 passing.

- [ ] **Step 5: Commit**

```bash
git add ui/sentinels.js tests/sentinels.test.js
git commit -m "feat: sentinel parser for free-games-claimer stdout"
```

---

## Task 4: Run classifier (TDD, pure)

**Files:**
- Create: `ui/classifier.js`, `tests/classifier.test.js`

- [ ] **Step 1: Write failing tests**

`tests/classifier.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { classify } from '../ui/classifier.js';

describe('classify', () => {
  it('returns ok_claimed when claimed sentinels present', () => {
    const events = [{ type: 'login_ok', user: 'alice' }, { type: 'claimed' }, { type: 'claimed' }];
    expect(classify(events, 0)).toMatchObject({
      class: 'ok_claimed',
      claimedCount: 2,
    });
  });

  it('returns ok_nothing when only already_owned + login_ok and exit 0', () => {
    const events = [{ type: 'login_ok', user: 'alice' }, { type: 'already_owned' }];
    expect(classify(events, 0)).toMatchObject({ class: 'ok_nothing' });
  });

  it('returns login_expired when login_lost seen', () => {
    const events = [{ type: 'login_lost' }];
    expect(classify(events, 1)).toMatchObject({ class: 'login_expired' });
  });

  it('returns login_expired when exit non-zero and no login_ok ever seen', () => {
    expect(classify([], 1)).toMatchObject({ class: 'login_expired' });
  });

  it('returns captcha when captcha sentinel present', () => {
    const events = [{ type: 'login_ok', user: 'alice' }, { type: 'captcha' }];
    expect(classify(events, 1)).toMatchObject({ class: 'captcha' });
  });

  it('captcha takes precedence over login_expired', () => {
    const events = [{ type: 'login_lost' }, { type: 'captcha' }];
    expect(classify(events, 1)).toMatchObject({ class: 'captcha' });
  });

  it('returns linking_needed when linking_needed sentinel present', () => {
    const events = [{ type: 'login_ok', user: 'alice' }, { type: 'linking_needed' }];
    expect(classify(events, 0)).toMatchObject({ class: 'linking_needed' });
  });

  it('collects codes', () => {
    const events = [
      { type: 'login_ok', user: 'alice' },
      { type: 'code', code: 'ABC-123' },
      { type: 'code', code: 'XYZ-789' },
    ];
    const result = classify(events, 0);
    expect(result.codes).toEqual(['ABC-123', 'XYZ-789']);
  });

  it('returns crash when exit non-zero with login_ok and no other classification', () => {
    const events = [{ type: 'login_ok', user: 'alice' }];
    expect(classify(events, 1)).toMatchObject({ class: 'crash' });
  });

  it('region_locked alone with exit 0 is ok_nothing', () => {
    const events = [{ type: 'login_ok', user: 'alice' }, { type: 'region_locked' }];
    expect(classify(events, 0)).toMatchObject({ class: 'ok_nothing' });
  });

  it('precedence: captcha > linking_needed > login_expired > crash > ok_claimed > ok_nothing', () => {
    const all = [
      { type: 'login_ok', user: 'alice' },
      { type: 'claimed' },
      { type: 'linking_needed' },
      { type: 'captcha' },
    ];
    expect(classify(all, 1).class).toBe('captcha');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- tests/classifier.test.js`
Expected: all fail (module missing).

- [ ] **Step 3: Implement `ui/classifier.js`**

```javascript
export function classify(events, exitCode) {
  const has = type => events.some(e => e.type === type);
  const claimedCount = events.filter(e => e.type === 'claimed').length;
  const codes = events.filter(e => e.type === 'code').map(e => e.code);
  const user = events.find(e => e.type === 'login_ok')?.user ?? null;

  let cls;
  if (has('captcha')) cls = 'captcha';
  else if (has('linking_needed')) cls = 'linking_needed';
  else if (has('login_lost') || (exitCode !== 0 && !has('login_ok'))) cls = 'login_expired';
  else if (exitCode !== 0) cls = 'crash';
  else if (claimedCount > 0) cls = 'ok_claimed';
  else cls = 'ok_nothing';

  return { class: cls, claimedCount, codes, user, exitCode };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/classifier.test.js`
Expected: 11/11 passing.

- [ ] **Step 5: Commit**

```bash
git add ui/classifier.js tests/classifier.test.js
git commit -m "feat: run classifier mapping events+exit code to error class"
```

---

## Task 5: Store wrapper (TDD)

**Files:**
- Create: `ui/store.js`, `tests/store.test.js`

- [ ] **Step 1: Write failing tests**

`tests/store.test.js`:
```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../ui/store.js';

let tmp;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'ac-store-'));
});

describe('createStore', () => {
  it('returns defaults on first run', () => {
    const s = createStore({ cwd: tmp });
    expect(s.get('firstRunCompleted')).toBe(false);
    expect(s.get('scheduleTime')).toBe('03:00');
    expect(s.get('autostartOnLogin')).toBe(true);
    expect(s.get('paused')).toBe(false);
    expect(s.get('lastRunAt')).toBeNull();
    expect(s.get('enabledStores')).toEqual({ epic: true, prime: true, gog: true });
  });

  it('persists writes across instances', () => {
    const s1 = createStore({ cwd: tmp });
    s1.set('scheduleTime', '04:30');
    s1.set('firstRunCompleted', true);
    const s2 = createStore({ cwd: tmp });
    expect(s2.get('scheduleTime')).toBe('04:30');
    expect(s2.get('firstRunCompleted')).toBe(true);
  });

  it('recordRun appends to lastRunPerStore and updates lastRunAt', () => {
    const s = createStore({ cwd: tmp });
    const before = Date.now();
    s.recordRun('epic', { class: 'ok_claimed', claimedCount: 1, codes: [], user: 'alice' });
    const last = s.get('lastRunPerStore');
    expect(last.epic.class).toBe('ok_claimed');
    expect(last.epic.at).toBeGreaterThanOrEqual(before);
    expect(s.get('lastRunAt')).toBeGreaterThanOrEqual(before);
  });

  it('isStale returns true when lastRunAt > 18h ago', () => {
    const s = createStore({ cwd: tmp });
    expect(s.isStale()).toBe(true); // never run
    s.set('lastRunAt', Date.now() - 19 * 3600 * 1000);
    expect(s.isStale()).toBe(true);
    s.set('lastRunAt', Date.now() - 1000);
    expect(s.isStale()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npm test -- tests/store.test.js`
Expected: all fail.

- [ ] **Step 3: Implement `ui/store.js`**

```javascript
import Store from 'electron-store';

const DEFAULTS = {
  firstRunCompleted: false,
  scheduleTime: '03:00',
  autostartOnLogin: true,
  paused: false,
  lastRunAt: null,
  lastRunPerStore: {},
  enabledStores: { epic: true, prime: true, gog: true },
};

const STALE_MS = 18 * 3600 * 1000;

export function createStore({ cwd } = {}) {
  const store = new Store({
    name: 'auto-claimer',
    cwd,
    defaults: DEFAULTS,
  });
  return {
    get: key => store.get(key),
    set: (key, value) => store.set(key, value),
    recordRun(storeName, classification) {
      const now = Date.now();
      const lastRunPerStore = { ...store.get('lastRunPerStore') };
      lastRunPerStore[storeName] = { ...classification, at: now };
      store.set('lastRunPerStore', lastRunPerStore);
      store.set('lastRunAt', now);
    },
    isStale() {
      const last = store.get('lastRunAt');
      if (last == null) return true;
      return Date.now() - last > STALE_MS;
    },
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/store.test.js`
Expected: 4/4 passing.

- [ ] **Step 5: Commit**

```bash
git add ui/store.js tests/store.test.js
git commit -m "feat: electron-store wrapper with run history + staleness check"
```

---

## Task 6: Runner module (TDD with fake child)

**Files:**
- Create: `ui/runner.js`, `tests/runner.test.js`, `tests/fixtures/fake-claimer.js`

- [ ] **Step 1: Create fake child fixture**

`tests/fixtures/fake-claimer.js`:
```javascript
// Reads SCRIPT env var (semicolon-separated lines), prints them with delays, exits with EXIT_CODE.
const lines = (process.env.SCRIPT || '').split(';');
const exitCode = Number(process.env.EXIT_CODE ?? 0);

(async () => {
  for (const line of lines) {
    if (line) console.log(line);
    await new Promise(r => setTimeout(r, 10));
  }
  process.exit(exitCode);
})();
```

- [ ] **Step 2: Write failing tests**

`tests/runner.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRunner } from '../ui/runner.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FAKE = join(__dirname, 'fixtures', 'fake-claimer.js');

function spawnFake(script, exitCode = 0) {
  return {
    cmd: process.execPath,
    args: [FAKE],
    env: { SCRIPT: script, EXIT_CODE: String(exitCode) },
  };
}

describe('runner', () => {
  it('emits run:start, run:line per stdout line, run:end with classification', async () => {
    const runner = createRunner();
    const events = [];
    runner.on('run:start', e => events.push({ t: 'start', ...e }));
    runner.on('run:line', e => events.push({ t: 'line', ...e }));
    runner.on('run:end', e => events.push({ t: 'end', ...e }));

    await runner.runOne('epic', spawnFake('Signed in as alice;Claimed successfully!', 0));

    expect(events[0]).toMatchObject({ t: 'start', store: 'epic' });
    expect(events.filter(e => e.t === 'line')).toHaveLength(2);
    const end = events.find(e => e.t === 'end');
    expect(end).toMatchObject({ store: 'epic', classification: { class: 'ok_claimed', claimedCount: 1 } });
  });

  it('classifies non-zero exit with no login_ok as login_expired', async () => {
    const runner = createRunner();
    let endEvent;
    runner.on('run:end', e => (endEvent = e));

    await runner.runOne('gog', spawnFake('', 1));

    expect(endEvent.classification.class).toBe('login_expired');
  });

  it('queue serializes runs (only one at a time)', async () => {
    const runner = createRunner();
    const ends = [];
    runner.on('run:end', e => ends.push(e.store));

    const p1 = runner.runOne('epic', spawnFake('Signed in as a;Claimed successfully!', 0));
    const p2 = runner.runOne('prime', spawnFake('Signed in as b;Redeemed successfully.', 0));

    await Promise.all([p1, p2]);

    expect(ends).toEqual(['epic', 'prime']);
    expect(runner.isBusy()).toBe(false);
  });

  it('runAll runs three stores in epic→prime→gog order', async () => {
    const runner = createRunner();
    const ends = [];
    runner.on('run:end', e => ends.push(e.store));

    await runner.runAll({
      epic: spawnFake('Signed in as a;Claimed successfully!', 0),
      prime: spawnFake('Signed in as b;Redeemed successfully.', 0),
      gog: spawnFake('Signed in as c;Already in library! Nothing to claim.', 0),
    });

    expect(ends).toEqual(['epic', 'prime', 'gog']);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

Run: `npm test -- tests/runner.test.js`
Expected: all fail.

- [ ] **Step 4: Implement `ui/runner.js`**

```javascript
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { parseLine } from './sentinels.js';
import { classify } from './classifier.js';

export function createRunner() {
  const emitter = new EventEmitter();
  let busy = false;
  const queue = [];

  function next() {
    if (busy || queue.length === 0) return;
    const { store, spec, resolve, reject } = queue.shift();
    busy = true;
    emitter.emit('run:start', { store });

    const child = spawn(spec.cmd, spec.args, {
      env: { ...process.env, ...(spec.env ?? {}) },
      cwd: spec.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const events = [];
    let buf = '';

    const onData = chunk => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) {
        emitter.emit('run:line', { store, line });
        const ev = parseLine(line);
        if (ev) events.push(ev);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('close', exitCode => {
      if (buf) {
        emitter.emit('run:line', { store, line: buf });
        const ev = parseLine(buf);
        if (ev) events.push(ev);
      }
      const classification = classify(events, exitCode ?? 0);
      emitter.emit('run:end', { store, classification });
      busy = false;
      resolve(classification);
      next();
    });

    child.on('error', err => {
      emitter.emit('run:line', { store, line: `[spawn error] ${err.message}` });
      const classification = classify([], 1);
      emitter.emit('run:end', { store, classification });
      busy = false;
      resolve(classification);
      next();
    });
  }

  return Object.assign(emitter, {
    runOne(store, spec) {
      return new Promise((resolve, reject) => {
        queue.push({ store, spec, resolve, reject });
        next();
      });
    },
    async runAll(specs) {
      const order = ['epic', 'prime', 'gog'];
      const results = {};
      for (const store of order) {
        if (specs[store]) results[store] = await this.runOne(store, specs[store]);
      }
      return results;
    },
    isBusy: () => busy,
    queueLength: () => queue.length,
  });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/runner.test.js`
Expected: 4/4 passing.

- [ ] **Step 6: Commit**

```bash
git add ui/runner.js tests/runner.test.js tests/fixtures/fake-claimer.js
git commit -m "feat: child-process runner with sentinel-driven classification"
```

---

## Task 7: Electron main skeleton + tray + hidden window

**Files:**
- Create: `ui/main.js`, `ui/preload.js`, `assets/tray-icon.ico`, `assets/tray-icon-error.ico`

- [ ] **Step 1: Add placeholder icons**

Generate two 32x32 ICO files (anything works for now — a green dot and a red dot). One quick way using PowerShell:

```bash
# Use any online ICO generator, or copy from a known source. Just need two files to exist.
# Place them at:
#   assets/tray-icon.ico
#   assets/tray-icon-error.ico
```

If you have ImageMagick: `magick -size 32x32 xc:green assets/tray-icon.ico` etc. Otherwise download two free ICOs and rename.

- [ ] **Step 2: Create `ui/preload.js`**

```javascript
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('ping'),
  getStatus: () => ipcRenderer.invoke('get-status'),
  getHistory: () => ipcRenderer.invoke('get-history'),
  runAll: () => ipcRenderer.invoke('run-all'),
  login: store => ipcRenderer.invoke('login', store),
  saveSettings: settings => ipcRenderer.invoke('save-settings', settings),
  completeFirstRun: () => ipcRenderer.invoke('complete-first-run'),
  onRunLine: cb => ipcRenderer.on('run:line', (_e, payload) => cb(payload)),
  onRunStart: cb => ipcRenderer.on('run:start', (_e, payload) => cb(payload)),
  onRunEnd: cb => ipcRenderer.on('run:end', (_e, payload) => cb(payload)),
});
```

- [ ] **Step 3: Create minimal `ui/main.js`**

```javascript
import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createStore } from './store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let win = null;
let tray = null;
const store = createStore();

function createWindow() {
  win = new BrowserWindow({
    width: 720,
    height: 560,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(join(__dirname, 'renderer', 'index.html'));
  win.on('close', e => {
    if (!app.isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromPath(join(ROOT, 'assets', 'tray-icon.ico'));
  tray = new Tray(icon);
  tray.setToolTip('Auto Claimer');
  tray.on('click', () => {
    if (win.isVisible()) win.hide();
    else win.show();
  });
  const menu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => win.show() },
    { type: 'separator' },
    { label: 'Exit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

ipcMain.handle('ping', () => 'pong');

app.whenReady().then(() => {
  createWindow();
  createTray();
});

app.on('window-all-closed', e => e.preventDefault());
```

- [ ] **Step 4: Smoke test**

Run: `npm start`
Expected:
- Tray icon appears in system notification area.
- No window visible by default.
- Left-click tray → window shows (renderer empty for now since `index.html` doesn't exist yet — Electron will show a "Failed to load" page; that's fine for this step).
- Right-click tray → menu with "Open Dashboard" and "Exit".
- Clicking Exit quits the app.

If the window fails to open due to missing `index.html`, that's expected — comment out `win.loadFile(...)` temporarily, retest, uncomment after Task 9.

- [ ] **Step 5: Commit**

```bash
git add ui/main.js ui/preload.js assets/
git commit -m "feat: Electron main skeleton with tray and hidden window"
```

---

## Task 8: Renderer HTML skeleton

**Files:**
- Create: `ui/renderer/index.html`, `ui/renderer/renderer.js`, `ui/renderer/style.css`

- [ ] **Step 1: Create `ui/renderer/index.html`**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Auto Claimer</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div id="welcome" class="hidden"></div>
  <div id="dashboard">
    <section id="status-panel"><h2>Status</h2><div id="status-content">Loading…</div></section>
    <section id="actions-panel">
      <h2>Actions</h2>
      <button id="claim-now">Claim Now</button>
      <div id="login-buttons">
        <button data-store="epic">Log in to Epic</button>
        <button data-store="prime">Log in to Prime Gaming</button>
        <button data-store="gog">Log in to GOG</button>
      </div>
    </section>
    <section id="history-panel"><h2>History</h2><div id="history-content">Loading…</div></section>
    <section id="log-panel"><h2>Live log</h2><pre id="log-content"></pre></section>
  </div>
  <script type="module" src="renderer.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `ui/renderer/style.css`**

```css
* { box-sizing: border-box; }
body {
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: #1e1e1e; color: #ddd;
  margin: 0; padding: 16px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
}
section { background: #2a2a2a; border-radius: 8px; padding: 12px; }
h2 { margin: 0 0 8px; font-size: 14px; text-transform: uppercase; color: #999; letter-spacing: 0.05em; }
button { background: #3b82f6; color: white; border: 0; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-size: 14px; }
button:hover { background: #2563eb; }
button:disabled { background: #555; cursor: not-allowed; }
#login-buttons { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
#log-panel { grid-column: 1 / 3; }
#log-content { background: #000; color: #0f0; padding: 8px; border-radius: 4px; height: 180px; overflow-y: auto; font-family: 'Consolas', monospace; font-size: 12px; margin: 0; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
.dot.green { background: #10b981; } .dot.yellow { background: #f59e0b; } .dot.red { background: #ef4444; } .dot.gray { background: #555; }
.hidden { display: none !important; }
.copy-btn { font-size: 11px; padding: 2px 8px; margin-left: 8px; background: #555; }
```

- [ ] **Step 3: Create `ui/renderer/renderer.js` (minimal)**

```javascript
async function init() {
  const pong = await window.api.ping();
  console.log('IPC ping:', pong);
  await refresh();
}

async function refresh() {
  const status = await window.api.getStatus();
  document.getElementById('status-content').textContent = JSON.stringify(status, null, 2);
}

window.api.onRunLine(({ store, line }) => {
  const log = document.getElementById('log-content');
  log.textContent += `[${store}] ${line}\n`;
  log.scrollTop = log.scrollHeight;
});

document.getElementById('claim-now').addEventListener('click', async () => {
  document.getElementById('log-content').textContent = '';
  await window.api.runAll();
  await refresh();
});

document.querySelectorAll('#login-buttons button').forEach(btn => {
  btn.addEventListener('click', async () => {
    document.getElementById('log-content').textContent = '';
    await window.api.login(btn.dataset.store);
    await refresh();
  });
});

init();
```

- [ ] **Step 4: Smoke test**

Run: `npm start`
Expected:
- Tray icon present.
- Click tray → window opens, shows the four panels.
- Status content shows "Loading…" then changes (or stays — depends on whether `get-status` is implemented; will fail in DevTools console for now).
- Open DevTools (Ctrl+Shift+I): no errors except missing IPC handlers (expected, fixed in next task).

- [ ] **Step 5: Commit**

```bash
git add ui/renderer/
git commit -m "feat: renderer HTML skeleton with four panels"
```

---

## Task 9: Wire Status panel + get-status IPC

**Files:**
- Modify: `ui/main.js`, `ui/renderer/renderer.js`

- [ ] **Step 1: Add `get-status` handler to `ui/main.js`**

Insert after the existing `ipcMain.handle('ping', ...)` line:

```javascript
ipcMain.handle('get-status', () => {
  return {
    lastRunAt: store.get('lastRunAt'),
    lastRunPerStore: store.get('lastRunPerStore'),
    scheduleTime: store.get('scheduleTime'),
    paused: store.get('paused'),
    enabledStores: store.get('enabledStores'),
    firstRunCompleted: store.get('firstRunCompleted'),
  };
});
```

- [ ] **Step 2: Update `refresh()` in `ui/renderer/renderer.js`**

Replace the existing `refresh()` function with:

```javascript
async function refresh() {
  const status = await window.api.getStatus();
  const stores = ['epic', 'prime', 'gog'];
  const rows = stores.map(s => {
    const run = status.lastRunPerStore?.[s];
    if (!run) return `<div><span class="dot gray"></span>${s} — never run</div>`;
    const cls = run.class;
    const dot = (cls === 'ok_claimed' || cls === 'ok_nothing') ? 'green'
              : (cls === 'login_expired' || cls === 'captcha' || cls === 'linking_needed') ? 'yellow'
              : 'red';
    const when = new Date(run.at).toLocaleString();
    return `<div><span class="dot ${dot}"></span>${s} — ${cls} (${when})</div>`;
  }).join('');
  const next = status.paused ? 'paused' : `next at ${status.scheduleTime}`;
  document.getElementById('status-content').innerHTML = rows + `<div style="margin-top:8px;color:#999">Schedule: ${next}</div>`;
}
```

- [ ] **Step 3: Smoke test**

Run: `npm start`, click tray, open dashboard.
Expected: Status panel shows three rows ("epic — never run", etc.), schedule note "next at 03:00".

- [ ] **Step 4: Commit**

```bash
git add ui/main.js ui/renderer/renderer.js
git commit -m "feat: status panel wired to electron-store via IPC"
```

---

## Task 10: Wire run-all + login IPC + live log

**Files:**
- Modify: `ui/main.js`

- [ ] **Step 1: Add runner integration to `ui/main.js`**

Add these imports near the top:
```javascript
import { createRunner } from './runner.js';
```

Add after `const store = createStore();`:
```javascript
const runner = createRunner();

const FGC_DIR = join(ROOT, 'free-games-claimer');

function specFor(storeName, { show }) {
  return {
    cmd: process.execPath,
    args: [`${storeName}.js`],
    cwd: FGC_DIR,
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      SHOW: show ? '1' : '0',
    },
  };
}

function broadcast(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

runner.on('run:start', e => broadcast('run:start', e));
runner.on('run:line', e => broadcast('run:line', e));
runner.on('run:end', e => {
  store.recordRun(e.store, e.classification);
  broadcast('run:end', e);
});
```

Map store name to script filename:
```javascript
const SCRIPT_FOR = { epic: 'epic-games', prime: 'prime-gaming', gog: 'gog' };
```

Update `specFor` to use it:
```javascript
function specFor(storeName, { show }) {
  return {
    cmd: process.execPath,
    args: [`${SCRIPT_FOR[storeName]}.js`],
    cwd: FGC_DIR,
    env: { ELECTRON_RUN_AS_NODE: '1', SHOW: show ? '1' : '0' },
  };
}
```

Add the IPC handlers:
```javascript
ipcMain.handle('run-all', async () => {
  const enabled = store.get('enabledStores');
  const specs = {};
  for (const s of ['epic', 'prime', 'gog']) {
    if (enabled[s]) specs[s] = specFor(s, { show: false });
  }
  return runner.runAll(specs);
});

ipcMain.handle('login', async (_e, storeName) => {
  return runner.runOne(storeName, specFor(storeName, { show: true }));
});
```

- [ ] **Step 2: Smoke test (no login yet)**

Run: `npm start`, open dashboard, click "Log in to Epic".
Expected:
- Live log fills with stdout from the spawned `epic-games.js`.
- A visible Firefox window opens to the Epic login page.
- Close Firefox manually (or wait for `LOGIN_TIMEOUT`).
- After exit, status panel updates the Epic row to "login_expired" or "captcha" depending on what happened. Tray app stays alive.

- [ ] **Step 3: Smoke test (real login — optional now, required before Task 11)**

Run "Log in to Epic" again. This time actually log in inside Firefox. Wait for the script to claim and exit. Verify:
- Live log shows `Signed in as <user>` and either `Claimed successfully!` or `Already in library!`.
- Status panel Epic row turns green.
- `free-games-claimer/data/browser/` now contains a Firefox profile.

Repeat for Prime (needs Amazon Prime sub) and GOG.

- [ ] **Step 4: Commit**

```bash
git add ui/main.js
git commit -m "feat: wire run-all and login IPC; live log streaming"
```

---

## Task 11: History panel

**Files:**
- Modify: `ui/main.js`, `ui/renderer/renderer.js`

- [ ] **Step 1: Add `get-history` handler to `ui/main.js`**

Add near other ipcMain handlers:

```javascript
import { readFileSync, existsSync } from 'node:fs';

ipcMain.handle('get-history', () => {
  const FILES = {
    epic: join(FGC_DIR, 'data', 'epic-games.json'),
    prime: join(FGC_DIR, 'data', 'prime-gaming.json'),
    gog: join(FGC_DIR, 'data', 'gog.json'),
  };
  const rows = [];
  for (const [storeName, path] of Object.entries(FILES)) {
    if (!existsSync(path)) continue;
    const db = JSON.parse(readFileSync(path, 'utf8'));
    for (const user of Object.keys(db)) {
      for (const [gameId, game] of Object.entries(db[user] ?? {})) {
        rows.push({
          store: storeName,
          user,
          id: gameId,
          title: game.title,
          time: game.time,
          status: game.status,
          url: game.url,
          code: game.code ?? null,
        });
      }
    }
  }
  rows.sort((a, b) => new Date(b.time) - new Date(a.time));
  return rows.slice(0, 50);
});
```

- [ ] **Step 2: Add history rendering to `ui/renderer/renderer.js`**

Add a new function:

```javascript
async function refreshHistory() {
  const rows = await window.api.getHistory();
  if (rows.length === 0) {
    document.getElementById('history-content').innerHTML = '<div style="color:#999">No games claimed yet.</div>';
    return;
  }
  const html = rows.map(r => {
    const code = r.code ? `<button class="copy-btn" data-code="${r.code}">Copy code</button>` : '';
    const t = new Date(r.time).toLocaleDateString();
    return `<div style="padding:4px 0;border-bottom:1px solid #333"><b>${r.store}</b> — ${r.title} <span style="color:#999">(${t})</span> ${code}</div>`;
  }).join('');
  document.getElementById('history-content').innerHTML = html;
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => navigator.clipboard.writeText(btn.dataset.code));
  });
}
```

Call it from `init()` and from `refresh()`:
```javascript
async function init() {
  await window.api.ping();
  await refresh();
  await refreshHistory();
}
```

Inside the `claim-now` and login click handlers, add `await refreshHistory();` after `await refresh();`.

- [ ] **Step 3: Smoke test**

Run: `npm start`, dashboard. Verify history panel shows games claimed in Task 10's smoke test (or "No games claimed yet" if you skipped real logins).

- [ ] **Step 4: Commit**

```bash
git add ui/main.js ui/renderer/renderer.js
git commit -m "feat: history panel reading free-games-claimer JSON dbs"
```

---

## Task 12: Notifier + error toasts + tray icon swap

**Files:**
- Create: `ui/notifier.js`
- Modify: `ui/main.js`

- [ ] **Step 1: Create `ui/notifier.js`**

```javascript
import { Notification } from 'electron';

const ERROR_MESSAGES = {
  login_expired: store => `${pretty(store)} needs you to log in again — open Auto Claimer`,
  captcha: store => `${pretty(store)} showed a captcha — open Auto Claimer and click Log in to ${pretty(store)}`,
  linking_needed: () => `A Prime offer needs you to link your Twitch/store account — open Auto Claimer`,
  crash: store => `Auto Claimer hit an error on ${pretty(store)} — open to see logs`,
};

const PRETTY = { epic: 'Epic Games', prime: 'Prime Gaming', gog: 'GOG' };
const pretty = s => PRETTY[s] ?? s;

export function notifyError(storeName, classification, onClick) {
  const builder = ERROR_MESSAGES[classification.class];
  if (!builder) return;
  const n = new Notification({ title: 'Auto Claimer', body: builder(storeName) });
  if (onClick) n.on('click', onClick);
  n.show();
}

export function notifyDailySummary(results, onClick) {
  const claimed = [];
  let codeCount = 0;
  for (const [storeName, c] of Object.entries(results)) {
    if (c.class === 'ok_claimed') claimed.push(`${c.claimedCount} from ${pretty(storeName)}`);
    codeCount += c.codes?.length ?? 0;
  }
  if (claimed.length === 0 && codeCount === 0) return;
  const parts = [];
  if (claimed.length) parts.push(`Claimed ${claimed.join(', ')}`);
  if (codeCount) parts.push(`${codeCount} code${codeCount > 1 ? 's' : ''} to redeem`);
  const n = new Notification({ title: 'Auto Claimer', body: parts.join(' — ') });
  if (onClick) n.on('click', onClick);
  n.show();
}
```

- [ ] **Step 2: Wire notifier into `ui/main.js`**

Add import:
```javascript
import { notifyError, notifyDailySummary } from './notifier.js';
```

Add a tray-icon swap helper:
```javascript
function setTrayIcon(variant) {
  const file = variant === 'error' ? 'tray-icon-error.ico' : 'tray-icon.ico';
  tray.setImage(nativeImage.createFromPath(join(ROOT, 'assets', file)));
}
```

Track if any store is in an error state. Replace the `runner.on('run:end', ...)` block with:
```javascript
const ERROR_CLASSES = new Set(['login_expired', 'captcha', 'linking_needed', 'crash']);
runner.on('run:end', e => {
  store.recordRun(e.store, e.classification);
  broadcast('run:end', e);
  if (ERROR_CLASSES.has(e.classification.class)) {
    notifyError(e.store, e.classification, () => win.show());
    setTrayIcon('error');
  }
});
```

After `runAll` completes, fire daily summary and clear icon if no errors. Wrap `run-all` handler:
```javascript
ipcMain.handle('run-all', async () => {
  const enabled = store.get('enabledStores');
  const specs = {};
  for (const s of ['epic', 'prime', 'gog']) {
    if (enabled[s]) specs[s] = specFor(s, { show: false });
  }
  const results = await runner.runAll(specs);
  notifyDailySummary(results, () => win.show());
  const anyError = Object.values(results).some(r => ERROR_CLASSES.has(r.class));
  setTrayIcon(anyError ? 'error' : 'normal');
  return results;
});
```

- [ ] **Step 3: Smoke test**

Force an error toast: temporarily disable network or run with bad cookies (delete `free-games-claimer/data/browser/` and run "Claim Now"). Verify:
- A Windows toast notification appears.
- Tray icon swaps to red variant.
- Clicking the toast brings up the dashboard.

Restore by re-running login.

- [ ] **Step 4: Commit**

```bash
git add ui/notifier.js ui/main.js
git commit -m "feat: error toasts and daily summary, tray icon swaps on error"
```

---

## Task 13: Scheduler

**Files:**
- Create: `ui/scheduler.js`, `tests/scheduler.test.js`
- Modify: `ui/main.js`

- [ ] **Step 1: Write tests for scheduler helpers**

`tests/scheduler.test.js`:
```javascript
import { describe, it, expect } from 'vitest';
import { timeToCron } from '../ui/scheduler.js';

describe('timeToCron', () => {
  it('converts HH:MM to cron expression', () => {
    expect(timeToCron('03:00')).toBe('0 3 * * *');
    expect(timeToCron('14:30')).toBe('30 14 * * *');
    expect(timeToCron('00:00')).toBe('0 0 * * *');
  });

  it('throws on invalid format', () => {
    expect(() => timeToCron('25:00')).toThrow();
    expect(() => timeToCron('abc')).toThrow();
    expect(() => timeToCron('')).toThrow();
  });
});
```

- [ ] **Step 2: Create `ui/scheduler.js`**

```javascript
import cron from 'node-cron';

export function timeToCron(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
  if (!m) throw new Error(`Invalid time: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) throw new Error(`Invalid time: ${hhmm}`);
  return `${min} ${h} * * *`;
}

export function createScheduler({ store, runClaim }) {
  let task = null;

  function start() {
    stop();
    if (store.get('paused')) return;
    const expr = timeToCron(store.get('scheduleTime'));
    task = cron.schedule(expr, () => runClaim('scheduled'));
  }

  function stop() {
    if (task) { task.stop(); task = null; }
  }

  function runOnLaunchIfStale() {
    if (store.get('paused')) return;
    if (!store.isStale()) return;
    setTimeout(() => runClaim('on-launch-catchup'), 30_000);
  }

  return { start, stop, runOnLaunchIfStale };
}
```

- [ ] **Step 3: Run tests**

Run: `npm test -- tests/scheduler.test.js`
Expected: 2/2 passing.

- [ ] **Step 4: Wire scheduler into `ui/main.js`**

Add import:
```javascript
import { createScheduler } from './scheduler.js';
```

Refactor `run-all` body into a callable helper:
```javascript
async function runClaim(_reason) {
  const enabled = store.get('enabledStores');
  const specs = {};
  for (const s of ['epic', 'prime', 'gog']) {
    if (enabled[s]) specs[s] = specFor(s, { show: false });
  }
  const results = await runner.runAll(specs);
  notifyDailySummary(results, () => win.show());
  const anyError = Object.values(results).some(r => ERROR_CLASSES.has(r.class));
  setTrayIcon(anyError ? 'error' : 'normal');
  return results;
}
ipcMain.handle('run-all', () => runClaim('manual'));
```

Initialize scheduler after window/tray creation:
```javascript
const scheduler = createScheduler({ store, runClaim });
app.whenReady().then(() => {
  createWindow();
  createTray();
  scheduler.start();
  scheduler.runOnLaunchIfStale();
});
```

- [ ] **Step 5: Smoke test**

Set schedule to 2 minutes from now via DevTools console:
```javascript
// In renderer DevTools: not directly accessible. Instead, set via electron-store JSON file.
```
Easier: stop app, edit `%APPDATA%/auto-claimer/auto-claimer.json` (or wherever electron-store wrote) and set `"scheduleTime": "HH:MM"` to 2 min from now. Restart app. Wait. Verify a run fires.

Or trust the unit test for now and verify by setting time to current time + 2 min in Settings panel after Task 15.

- [ ] **Step 6: Commit**

```bash
git add ui/scheduler.js tests/scheduler.test.js ui/main.js
git commit -m "feat: cron scheduler with at-launch catchup for stale runs"
```

---

## Task 14: First-run welcome wizard

**Files:**
- Create: `ui/renderer/welcome.js`
- Modify: `ui/renderer/index.html`, `ui/renderer/renderer.js`, `ui/main.js`

- [ ] **Step 1: Add `complete-first-run` handler to `ui/main.js`**

```javascript
ipcMain.handle('complete-first-run', () => {
  store.set('firstRunCompleted', true);
});

ipcMain.handle('save-settings', (_e, settings) => {
  if (settings.scheduleTime) store.set('scheduleTime', settings.scheduleTime);
  if (typeof settings.autostartOnLogin === 'boolean') store.set('autostartOnLogin', settings.autostartOnLogin);
  if (settings.enabledStores) store.set('enabledStores', settings.enabledStores);
  scheduler.start();
});
```

Auto-show window on first launch — modify the `app.whenReady().then(...)` block:
```javascript
app.whenReady().then(() => {
  createWindow();
  createTray();
  scheduler.start();
  scheduler.runOnLaunchIfStale();
  if (!store.get('firstRunCompleted')) {
    win.show();
  }
});
```

- [ ] **Step 2: Create `ui/renderer/welcome.js`**

```javascript
const STORES = [
  { id: 'epic', name: 'Epic Games' },
  { id: 'prime', name: 'Prime Gaming' },
  { id: 'gog', name: 'GOG' },
];

const state = { connected: {}, skipped: {} };

export async function showWelcome() {
  const status = await window.api.getStatus();
  if (status.firstRunCompleted) {
    document.getElementById('welcome').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    return false;
  }
  document.getElementById('welcome').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
  renderCards();
  return true;
}

function renderCards() {
  const html = `
    <h1 style="margin-top:0">Welcome to Auto Claimer</h1>
    <p>Log into the stores you want to claim free games from. You can skip any you don't use.</p>
    ${STORES.map(s => cardFor(s)).join('')}
    <div id="welcome-actions" style="margin-top:16px">
      <button id="welcome-done" disabled>Continue to settings</button>
    </div>
  `;
  document.getElementById('welcome').innerHTML = html;
  STORES.forEach(s => wireCard(s));
  document.getElementById('welcome-done').addEventListener('click', showSettings);
  updateContinue();
}

function cardFor(s) {
  return `
    <div class="welcome-card" data-store="${s.id}" style="background:#2a2a2a;padding:12px;border-radius:8px;margin:8px 0">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div><b>${s.name}</b> <span class="status">— Not connected</span></div>
        <div>
          <button class="login-btn" data-store="${s.id}">Log in</button>
          <button class="skip-btn" data-store="${s.id}" style="background:#555;margin-left:6px">Skip</button>
        </div>
      </div>
      <pre class="card-log" style="background:#000;color:#0f0;font-size:11px;padding:6px;margin:6px 0 0;height:60px;overflow:auto;display:none"></pre>
    </div>`;
}

function wireCard(s) {
  const card = document.querySelector(`.welcome-card[data-store="${s.id}"]`);
  card.querySelector('.login-btn').addEventListener('click', async () => {
    const log = card.querySelector('.card-log');
    log.style.display = 'block'; log.textContent = '';
    const lineHandler = ({ store, line }) => {
      if (store === s.id) { log.textContent += line + '\n'; log.scrollTop = log.scrollHeight; }
    };
    window.api.onRunLine(lineHandler);
    const result = await window.api.login(s.id);
    if (result.class === 'ok_claimed' || result.class === 'ok_nothing') {
      state.connected[s.id] = true;
      card.querySelector('.status').textContent = `— ✓ Connected as ${result.user ?? '(unknown)'}`;
    } else {
      card.querySelector('.status').textContent = `— ⚠ ${result.class} (try again)`;
    }
    updateContinue();
  });
  card.querySelector('.skip-btn').addEventListener('click', () => {
    state.skipped[s.id] = true;
    card.querySelector('.status').textContent = '— Skipped';
    card.querySelector('.login-btn').disabled = true;
    updateContinue();
  });
}

function updateContinue() {
  const allHandled = STORES.every(s => state.connected[s.id] || state.skipped[s.id]);
  document.getElementById('welcome-done').disabled = !allHandled;
}

async function showSettings() {
  const enabledStores = {};
  STORES.forEach(s => { enabledStores[s.id] = !!state.connected[s.id]; });
  document.getElementById('welcome').innerHTML = `
    <h1>Settings</h1>
    <label>Daily run time: <input id="schedule-time" type="time" value="03:00" /></label><br/><br/>
    <label><input id="autostart" type="checkbox" checked /> Start Auto Claimer when I log into Windows</label><br/><br/>
    <button id="settings-done">Done</button>
  `;
  document.getElementById('settings-done').addEventListener('click', async () => {
    await window.api.saveSettings({
      scheduleTime: document.getElementById('schedule-time').value,
      autostartOnLogin: document.getElementById('autostart').checked,
      enabledStores,
    });
    await window.api.completeFirstRun();
    document.getElementById('welcome').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    new Notification('Auto Claimer', {
      body: `Auto Claimer is running. I'll claim your free games every day at ${document.getElementById('schedule-time')?.value ?? '03:00'}.`,
    });
  });
}
```

- [ ] **Step 3: Wire welcome into `ui/renderer/renderer.js`**

Replace the `init()` function:
```javascript
import { showWelcome } from './welcome.js';

async function init() {
  await window.api.ping();
  const showingWelcome = await showWelcome();
  if (!showingWelcome) {
    await refresh();
    await refreshHistory();
  }
}
```

- [ ] **Step 4: Smoke test**

Reset first-run state: edit electron-store JSON file, set `"firstRunCompleted": false`, restart app. Verify:
- Window auto-opens on launch.
- Welcome panel shows three cards with Login/Skip buttons.
- Clicking Log in opens Firefox; after login, card shows "✓ Connected as <user>".
- Skipping a store advances state.
- After all three handled, Continue button enables → Settings panel appears.
- After clicking Done → Welcome hides, dashboard shows, browser notification fires.
- Restart app → straight to dashboard, no welcome.

- [ ] **Step 5: Commit**

```bash
git add ui/renderer/welcome.js ui/renderer/renderer.js ui/main.js
git commit -m "feat: first-run welcome wizard with per-store login + settings"
```

---

## Task 15: Autostart on Windows login

**Files:**
- Create: `ui/autostart.js`
- Modify: `ui/main.js`

- [ ] **Step 1: Create `ui/autostart.js`**

```javascript
import { app } from 'electron';

export function setAutostart(enabled) {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    path: process.execPath,
    args: [],
  });
}

export function isAutostartEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}
```

- [ ] **Step 2: Wire into `ui/main.js`**

Add import:
```javascript
import { setAutostart } from './autostart.js';
```

Update `save-settings` handler:
```javascript
ipcMain.handle('save-settings', (_e, settings) => {
  if (settings.scheduleTime) store.set('scheduleTime', settings.scheduleTime);
  if (typeof settings.autostartOnLogin === 'boolean') {
    store.set('autostartOnLogin', settings.autostartOnLogin);
    setAutostart(settings.autostartOnLogin);
  }
  if (settings.enabledStores) store.set('enabledStores', settings.enabledStores);
  scheduler.start();
});
```

Apply on app boot to keep it in sync if user toggled it externally:
```javascript
app.whenReady().then(() => {
  createWindow();
  createTray();
  setAutostart(store.get('autostartOnLogin'));
  scheduler.start();
  scheduler.runOnLaunchIfStale();
  if (!store.get('firstRunCompleted')) win.show();
});
```

- [ ] **Step 3: Smoke test**

Run app, complete first-run with autostart checked. Quit. Open Task Manager → Startup Apps → verify "Auto Claimer" (or `electron.exe`) appears as enabled. Reboot Windows, verify tray icon appears after login.

- [ ] **Step 4: Commit**

```bash
git add ui/autostart.js ui/main.js
git commit -m "feat: autostart on Windows login via setLoginItemSettings"
```

---

## Task 16: Tray menu Pause + Claim Now

**Files:**
- Modify: `ui/main.js`

- [ ] **Step 1: Expand tray menu**

Replace the tray menu builder in `createTray()`:
```javascript
function rebuildTrayMenu() {
  const paused = store.get('paused');
  const menu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => win.show() },
    { label: 'Claim Now', click: () => runClaim('tray') },
    { type: 'separator' },
    {
      label: paused ? 'Resume schedule' : 'Pause schedule',
      click: () => {
        store.set('paused', !paused);
        scheduler.start();
        rebuildTrayMenu();
      },
    },
    { type: 'separator' },
    { label: 'Exit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}
```

Replace `tray.setContextMenu(menu)` line in `createTray()` with `rebuildTrayMenu();`.

- [ ] **Step 2: Smoke test**

Run app, right-click tray. Verify menu has Pause schedule, Claim Now. Click Pause → label flips to Resume. Click Claim Now → run starts (visible in dashboard).

- [ ] **Step 3: Commit**

```bash
git add ui/main.js
git commit -m "feat: tray menu with Claim Now and Pause/Resume"
```

---

## Task 17: electron-builder config + portable build

**Files:**
- Create: `electron-builder.yml`, `assets/installer-icon.ico`

- [ ] **Step 1: Create `electron-builder.yml`**

```yaml
appId: com.moodstudios.autoclaimer
productName: Auto Claimer
directories:
  output: dist
files:
  - ui/**/*
  - assets/**/*
  - package.json
  - "!free-games-claimer/.git*"
asarUnpack:
  - free-games-claimer/**/*
extraResources:
  - from: free-games-claimer
    to: free-games-claimer
    filter:
      - "**/*"
      - "!.git*"
      - "!data/**"
win:
  target: portable
  icon: assets/installer-icon.ico
portable:
  artifactName: AutoClaimer-${version}.exe
```

NOTE: `extraResources` and `asarUnpack` overlap intentionally — different electron-builder versions handle this differently. If `dist/` lacks `free-games-claimer/`, switch the `files` block to include `free-games-claimer/**/*` and remove `extraResources`.

- [ ] **Step 2: Add icon (placeholder OK)**

Place a 256x256 ICO at `assets/installer-icon.ico`. Same approach as Task 7 step 1.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: completes in 1-3 min, produces `dist/AutoClaimer-0.1.0.exe` (single self-extracting portable executable, ~250 MB).

- [ ] **Step 4: Smoke test the .exe**

Move `dist/AutoClaimer-0.1.0.exe` to a clean folder (e.g. `D:/temp/`). Double-click. Verify:
- It self-extracts and launches (electron-builder portable behavior — extracts to `%TEMP%/<random>/` on each launch by default).
- Tray icon appears.
- First-run flow does NOT appear because electron-store reads from `%APPDATA%/auto-claimer/` which still has your dev state.

To do a clean test, delete `%APPDATA%/auto-claimer/` first, then re-launch. First-run should appear. Log in to a store, verify cookies persist to `%TEMP%/.../resources/free-games-claimer/data/browser/`.

**Caveat:** with default portable behavior, data inside the extracted folder is wiped on next launch (it re-extracts). For true portability per the spec, add `PORTABLE_EXECUTABLE_DIR`-aware paths. Update `ui/store.js` and the FGC data dir handling:

In `ui/main.js`, replace `const FGC_DIR = join(ROOT, 'free-games-claimer');` with:
```javascript
const PORTABLE_DATA_ROOT = process.env.PORTABLE_EXECUTABLE_DIR
  ? join(process.env.PORTABLE_EXECUTABLE_DIR, 'data')
  : join(ROOT, 'portable-data');
const FGC_DIR = process.env.PORTABLE_EXECUTABLE_DIR
  ? join(process.resourcesPath, 'free-games-claimer')
  : join(ROOT, 'free-games-claimer');
```

In the runner spec, set `BROWSER_DIR` env to `join(PORTABLE_DATA_ROOT, 'browser')` and update `get-history` to look in `PORTABLE_DATA_ROOT` for the JSON files. Update `ui/store.js` instantiation in `main.js`:
```javascript
const store = createStore({ cwd: PORTABLE_DATA_ROOT });
```

This way settings + cookies + history all live next to the .exe (in `data/` subfolder), surviving the per-launch extraction. The .exe is then truly portable.

Re-run `npm run build`, smoke-test from a clean folder again.

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml assets/installer-icon.ico ui/main.js ui/store.js
git commit -m "feat: portable Windows build with self-contained data dir"
```

---

## Task 18: User-facing README + distribution dry run

**Files:**
- Create: `DISTRIBUTE-README.txt`

- [ ] **Step 1: Create `DISTRIBUTE-README.txt`** (will ship inside the zip)

```
Auto Claimer — README

What this is:
This little app logs into Epic Games Store, Amazon Prime Gaming, and GOG once a day
and claims any free games for you.

How to use:
1. Put AutoClaimer.exe wherever you want (Desktop, Documents, anywhere).
2. Double-click AutoClaimer.exe.
3. Windows will warn "unrecognized app" — click "More info" then "Run anyway".
   (This is normal for unsigned apps. The code is open-source on GitHub.)
4. A welcome window opens. For each store:
   - Click "Log in", a browser pops up.
   - Log in with your account.
   - The browser will close itself when done.
5. Pick a daily run time (default 3 AM is fine for most people).
6. Done! It runs in your system tray (bottom-right of taskbar).

To open the dashboard later:
- Click the small icon in your system tray.

To turn it off:
- Right-click the tray icon → Exit.

To uninstall:
- Quit it (right-click tray → Exit).
- Delete the AutoClaimer.exe file and the "data" folder next to it.

Where your stuff lives:
- Login cookies and history are stored in the "data" folder created next to AutoClaimer.exe.
- Your passwords are NOT stored anywhere — only browser session cookies, the same as if you'd
  logged into the websites in a normal browser.

Help / questions: ask <your name>.
```

- [ ] **Step 2: Build the distribution**

```bash
npm run build
```

Then in `dist/`, package the .exe + README into a zip:

```bash
cd dist
mkdir -p "Auto Claimer Distribution"
cp AutoClaimer-0.1.0.exe "Auto Claimer Distribution/"
cp ../DISTRIBUTE-README.txt "Auto Claimer Distribution/README.txt"
# Use Windows built-in zip via PowerShell:
powershell -c "Compress-Archive -Path 'Auto Claimer Distribution/*' -DestinationPath 'AutoClaimer.zip'"
```

Expected: `dist/AutoClaimer.zip` (~120-150 MB).

- [ ] **Step 3: Dry run the distribution**

Pretend you are the recipient:
1. Copy `AutoClaimer.zip` to a folder you've never used (e.g. `D:/girlfriend-test/`).
2. Extract.
3. Read the README.
4. Double-click `AutoClaimer.exe`.
5. Click through SmartScreen warning.
6. Walk through first-run wizard. Log into one store with a test account.
7. Verify tray icon, dashboard, claim now, history.
8. Right-click tray → Exit.
9. Re-launch — should go straight to dashboard with prior state intact.

Document any UX rough edges in a follow-up.

- [ ] **Step 4: Commit**

```bash
git add DISTRIBUTE-README.txt
git commit -m "docs: distribution README for end users"
```

- [ ] **Step 5: Tag the release**

```bash
git tag v0.1.0
```

---

## Deferred to v0.2 (intentional gaps from spec)

These spec items are intentionally not implemented in v1. v1 ships without them; v0.2 picks them up:

- **Network-failure auto-retry** (spec §"Error handling"): the spec says the runner should retry the whole run once after 5 min on network failures. v1 simply lets it fail and relies on the next scheduled run + on-launch catchup. Adds complexity (need to distinguish network errors from captcha/login errors in the classifier) without much real benefit for a 1-user share — daily retry is fine.
- **Main-process crash logging** (spec §"Error handling"): `process.on('uncaughtException')` writing to `<portable>/logs/main.log` and surfacing on next launch. Skipped — Electron's default behavior of just dying is acceptable; she'll notice the tray icon is gone and re-launch.
- **Settings panel after first-run** (spec §"First-run experience" implies it): v1 only shows the Settings panel during the welcome wizard. To change schedule/autostart later in v1 she'd have to delete the electron-store JSON and re-run welcome. v0.2 adds a "Settings" button to the dashboard.

## Summary of acceptance

After all tasks, the following must be true:

- `npm test` passes (sentinels, classifier, store, runner, scheduler).
- `npm start` launches with tray icon, hidden window, working scheduler.
- First-run wizard works end-to-end: login to Epic/Prime/GOG, save settings, complete.
- Dashboard shows status, history (with Prime code copy buttons), live log, action buttons.
- Manual "Claim Now" works; daily summary toast fires when claims succeed.
- Error toasts fire for login expired / captcha / linking needed / crash; tray icon swaps red.
- Scheduled run fires at the configured time; on-launch catchup fires if last run > 18 h ago.
- `npm run build` produces a portable .exe; the .exe runs from any folder; data persists next to it.
- Zipped distribution + README extracts and runs cleanly on a fresh user's machine.
