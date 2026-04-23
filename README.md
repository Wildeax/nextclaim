# NextClaim

Electron wrapper around [vogler/free-games-claimer](https://github.com/vogler/free-games-claimer) that auto-claims daily free games on Epic, Prime Gaming, and GOG, with a tray-based UI styled after Steam.

## Dev
- `npm install`
- `git submodule update --init`
- `cd free-games-claimer && npm install && cd ..`
- `npm start`

## Test
- `npm test`

## Build distributable
- `npm run build` → `dist/NextClaim-<version>.zip`
- Ship the zip to the user. See `DISTRIBUTE-README.txt` for end-user instructions (bundled inside distribution folders).

See `docs/superpowers/specs/2026-04-23-auto-claimer-design.md` for the original design.
