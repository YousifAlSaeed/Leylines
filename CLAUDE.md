# Leylines

## Version number

The game has a version (like `0.6.0`), shown next to the title on the menu.
It is kept in three places that must always match (`npm test` checks):

1. `client/js/version.js` (`const VERSION='…'`)
2. `package.json` (`"version"`, then run `npm install --package-lock-only` so `package-lock.json` matches)
3. The top `## x.y.z (date)` heading in `CHANGELOG.md`

**Every commit that changes the game bumps the version.** Pick the part to bump:

- **Patch** `0.6.0 → 0.6.1`: a fix, a tweak, a small polish.
- **Minor** `0.6.1 → 0.7.0`: a new feature, mode, rule, screen or system.
  Only when it changes how the game plays. Helpers and small extras (a tip,
  a guide, a nicer button) are a **patch**.
- **Major** `0.x → 1.0.0`: only when the owners say the game is out of alpha. Never on your own.

Changes that don't touch the game (README, tests only, CI, tooling) don't bump.

**The developers' control panel never bumps the version and never goes in
`CHANGELOG.md`.** This holds for everyone working on the repo (Yousif and
Jawad alike): fixing it, adding a section or a tool to it, or changing anything
that only developers see through it (`client/js/control.js`, `client/css/control.css`,
`server/routes/admin.js`, `server/lib/boosts.js`, `server/lib/maint.js`,
`server/lib/dbWatch.js`). A commit that also changes the game for players
bumps and logs only that part.

When bumping, add a short line for the change under a new top heading in
`CHANGELOG.md` with today's date. Several commits pushed together may share
one bump.

Before bumping, pull `dev` first: two people work on this repo. If a merge
conflicts on the version, take the higher number, then bump once more for
your change.

## Frutiger Aero (developers only, kept secret)

The game has a hidden look, **Frutiger Aero**: glossy glass, bubbles, a summer
sky by day and an aurora by night. Only developer accounts (`DEV_USERS`) and
local copies can switch it on, from Looks in the control panel's My account
(`client/js/control.js`). It lives in `client/css/aero.css` and `aeroOn()`
(`client/js/save.js`).

Players must not find out it exists, and `CHANGELOG.md` is shown in the game as
What's new. So:

- **Never put it in `CHANGELOG.md`**, and **don't bump the version** for a change
  that only touches it. The owners will decide how to log it when Aero goes on sale.
- Commit messages and pull requests on GitHub can describe it normally.

### Liquid glass (developers only, kept secret too)

A second hidden look: the main menu and the phone's tab bar made of glass, like
iOS 26. Developers pick it in the same Looks row as Aero (**Normal / Aero /
Glass**). It lives in `client/css/glass.css`, `client/js/glass.js` and
`liquidOn()` (`client/js/save.js`).

- **Never put it in `CHANGELOG.md`**, not even as "Small fixes", and **don't
  bump the version** for a change that only touches it (the owners' choice).
  A commit that also changes the game for players bumps and logs only that part.
- Commit messages and pull requests on GitHub can describe it normally.

## Pulling

Two people push to this repo, so always pull `dev` (`git pull origin dev`):

1. At the start of every session, before touching any code.
2. Right before every push, even if you pulled earlier.

If the pull brings conflicts, fix them, run `npm test`, then push.

## Sound effects

Most effects are real CC0 recordings, built by `tools/sfx-recordings.mjs` (the rest by
`tools/generate-sfx.py`, which skips the recorded ones). Every source is credited in
`client/audio/sfx/CREDITS.md`.

To make or change one, you need the source recordings, which are not in the repo.
Remind whoever asks to set up the sound kit first (needs ffmpeg and uv):

```bash
git clone https://github.com/Bodila51/opus-sound-layer sound-layer
uv run sound-layer/scripts/sfx.py kit
```

Keep it outside the repo (about 230 MB). Tunes (win, Same/Plus, Combo) are in A major.
