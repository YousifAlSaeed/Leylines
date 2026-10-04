# Changelog

The version shows next to the title on the menu. It lives in
`client/js/version.js`, `package.json` and the top entry below; `npm test`
fails if they don't match. How to bump it is in `CLAUDE.md`.

Versions before 0.6.0 were worked out afterwards from the commit history.

## 0.6.2 (2026-10-04)
- Same screen: pick only from cards this account has found (even lost ones), up to 5 copies of each

## 0.6.1 (2026-10-04)
- NEW tag on cards you've never found when taking cards after a win

## 0.6.0 (2026-10-04)
Friends, leaderboard and the Daily tab.
- Friends: requests, friend list and profiles
- Leaderboard with streaks (online matches only)
- Match history on the profile
- Daily tab: Daily Duel, Daily Puzzle and Gauntlet
- Leaving early costs cards; online players can spare
- Alpha notice on the menu
- The account's progress always wins over the device's
- Version number next to the title

## 0.5.0 (2026-10-02)
Series, iPhone app and emotes.
- Best-of series (single, best of 3, best of 5)
- Online waiting room
- Chaos rule
- Protected player emails, security headers, forgot password
- Automatic tests
- Home-screen app on iPhone
- Online players can come back after dropping out
- Quick emotes
- 10 shows as X on cards

## 0.4.0 (2026-10-01)
Accounts and the server.
- Game split into client, server and database
- Accounts with cloud save (Postgres on Neon)
- Player profiles: level, badges, avatar, showcase
- Card packs: one per level, a daily pack, tear-to-open reveals

## 0.3.0 (2026-09-30)
Collection and decks. The game becomes Leylines.
- Deck picker with saved loadouts
- Card binder collection with page turns
- Rarity (1★ Common to 5★ Legendary) and deck limits
- Music and volume sliders
- Sweep trade rule
- Renamed from Project A to Leylines, with the logo kit

## 0.2.0 (2026-09-29)
Online play and the redesign.
- Online play with names, HOST/GUEST tags and reconnects
- Turn timer
- Full UI redesign, settings and How to play
- Rule cards in match setup

## 0.1.0 (2026-09-29)
- First playable card game (Project A)
