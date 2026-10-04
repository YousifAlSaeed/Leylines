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
- **Major** `0.x → 1.0.0`: only when the owners say the game is out of alpha. Never on your own.

Changes that don't touch the game (README, tests only, CI, tooling) don't bump.

When bumping, add a short line for the change under a new top heading in
`CHANGELOG.md` with today's date. Several commits pushed together may share
one bump.

Before bumping, pull `dev` first: two people work on this repo. If a merge
conflicts on the version, take the higher number, then bump once more for
your change.
