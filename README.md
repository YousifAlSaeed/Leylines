<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="client/images/leylines-vertical.svg">
    <img src="client/images/leylines-vertical-on-dark.png" alt="Leylines" width="320">
  </picture>
</h1>

<p align="center">
  A card game of nine squares: a 3×3 card game in the style of Triple Triad (Final Fantasy VIII), with 55 original cards.
</p>

<p align="center">
  <a href="https://leylines.live/"><b>▶ Play online</b></a>
</p>

---

## How to play

Each player brings **5 cards**. You take turns placing one card on the **3×3 board**.

- Every card has 4 numbers: top, right, bottom and left. **X** means 10.
- When you place a card next to an enemy card and your touching side is **higher**, that card flips to your colour.
- When the board is full, your score is the cards you own on the board plus the cards still in your hand. The **higher score wins**.

The in-game **How to play** screen shows every rule with an animated example.

## Game modes

| Mode | Description |
| --- | --- |
| **Solo** | Play the CPU on Easy, Normal or Hard. Hard searches ahead with minimax. |
| **Online** | Play a friend over the internet. The host gets a 5-letter code and an invite link to share, then both wait in a room where the host sets the rules and the friend sees them. The friend taps Ready, then the host starts. |
| **Crossroads** (testing) | Online only, 4 players on a 4×4 board: **2v2** (two teams) or **Free-for-all** (everyone for themselves, each in their own colour). **Host a game** asks 1v1 or Crossroads, friends join with its code, and empty seats can be CPU Easy or CPU Normal. A player who drops out gets a minute to come back before a CPU plays their cards. No trades, no rewards yet. |
| **Couch** | Two players on one device. Each picks 5 cards from every card the account has found (even lost ones); the same card can be picked more than once. No cards are traded. |

## Rules

Each rule can be turned on or off in match setup.

| Rule | What it does |
| --- | --- |
| **Open** | Both hands are played face up. |
| **Same** | When two or more sides of your card equal the touching sides of the cards next to it, those enemy cards flip. |
| **Same wall** | The board edge counts as an X (10) for Same. |
| **Plus** | When two or more touching pairs add up to the same total, those enemy cards flip. |
| **Combo** | Cards flipped by Same or Plus then flip their weaker enemy neighbours, and it can keep chaining. |
| **Elemental** | 1 to 4 squares get an element. A card of the same element gets +1 on every side; any other card gets −1. |
| **Sudden death** | A draw restarts the match. Each player keeps the cards they owned at the end (up to 5 extra rounds). |
| **Random** | Your 5 cards are dealt at random from your collection. |
| **Chaos** | Each turn the game picks a random card from your hand, and you must play it. You only choose the square. |
| **Turn timer** | Off, or 10 to 90 seconds per turn. When time runs out, a random card is played to a random empty square. |
| **Series** | Single match, best of 3 or best of 5. Same 5 cards all series, and whoever went first goes second next match. A draw counts for nobody; most wins takes the series. Cards are traded once, at the end. |

## Trade rules

The trade rule decides which cards the winner takes from the loser.

| Trade | The winner takes |
| --- | --- |
| **None** | Nothing. It's a friendly match. |
| **One** | 1 card of their choice. |
| **Diff** | As many cards as the score difference (max 5), picked only from the loser's cards the winner flipped. |
| **All** | All 5 of the loser's cards. |
| **Sweep** | All 5 cards, but only after owning every square on the board. Any other win trades nothing. |

## Cards and collection

The 55 cards are split into five rarities:

| Rarity | Cards |
| --- | --- |
| 1★ Common | 14 |
| 2★ Uncommon | 14 |
| 3★ Rare | 11 |
| 4★ Epic | 8 |
| 5★ Legendary | 8 |

- You start with 9 weak cards and win better ones in matches.
- **Deck limits:** a deck can have at most **1 card of 5★** and at most **2 cards of 4★ or more**.
- Save up to 3 hands as loadouts, or let **Best 5** pick your strongest legal hand.
- Browse your cards in the **Collection** binder, with one section per rarity.
- **Settings → Unlock all cards** lets you play with every card without touching your collection.

## Store and shards

**Ley Shards** are earned by playing and spent in the **Store** (the tile beside Packs). Everyone starts with 150.

| Earned from | Shards |
| --- | --- |
| Solo win | Easy 10 · Normal 20 · Hard 30 (Daily Duel 25, Gauntlet boss 40) |
| Online match | Win 40 · Draw 20 · Loss 10 |
| Solo draw | Half a win |
| Daily tab | Duel 50 · Puzzle 30 · Gauntlet 75 (once a day, on top of the limit) |

- Matches pay up to **250 shards a game day**. The limit resets at midnight with the dailies.
- Couch and leaving a match early pay nothing.

The Store has two parts:

- **Wandering Merchant:** 4 single cards and a pack at 25% off, new every game day. Three cards and the pack are the same for every player; the fourth (**For you**) is a card you haven't found yet. Each item sells once. Cards cost 30 / 80 / 200 / 600 / 1800 by rarity (1★ to 5★).
- **Pack Counter:** any pack tier, opened right away. Spark 120, Arcane 300, Leyline 700, Mythic 1600 (one Mythic a week, from Monday). Every pack opened adds points toward the 5★ guarantee (Spark 1, Arcane 3, Leyline 5, Mythic 10); the pack that reaches 50 ends with a 5★.

## Settings

- **Theme:** System, Dark or Light
- **Music and sound effects** volume
- **Unlock all cards:** Off / On
- **Reset progress:** erases your cards and stats

## Accounts

Playing as a guest works exactly as before: progress stays on that device. The profile card on the menu (where Wins / Losses / Draws were) offers **Create account**:

- Sign-up takes a username, a password (8+ characters) and an optional email. Your current cards, stats, hands and settings are uploaded to the new account.
- Signed in, every change syncs to the account a couple of seconds later. The card shows *Synced*, *Syncing…* or *Offline*.
- Signing in on a device that already has different progress loads the **account's** progress; the device's is replaced (a message says so).
- If two devices both change progress before syncing, the account's progress wins the same way. There is no "keep this device": it would let anyone undo a loss by keeping an older copy.
- **Settings** shows the account at the top, with **Sign out**. Signing out keeps the progress on that device.
- **Reset progress** while signed in also resets the account.

There's no password reset yet; the email is stored for when there is.

## Running locally

**Just the game:** open `client/index.html` in any modern browser. There's no build step and nothing to install.

**With the server** (Node 20+), which serves the game plus the `/api` routes and the database:

```bash
npm install
npm start
```

Then open http://127.0.0.1:3000. `npm run dev` restarts on file changes, `npm run db:init` creates the database without starting the server. `PORT`, `HOST` and `DB_FILE` can be set as environment variables.

Game progress is saved in the browser's `localStorage`. Accounts (below) need the server; without it the game runs as guest only.

An internet connection is needed for:
- the fonts (Saira and Geist, from Google Fonts)
- **Online** mode, which loads [PeerJS](https://peerjs.com/) from a CDN and connects players peer to peer

### As a phone app

On iPhone, Safari → Share → **Add to Home Screen** (or **Install** on Android) turns the site into an app: full screen, with the game laid out around the notch and home bar. `client/sw.js` keeps a copy of the game's files, so the app still opens without a connection (Solo and Couch work offline) and doesn't wait long when the server is waking up. The screen stays on during a match.

### Tests

```bash
npm test
```

`test/rules.test.js` checks the game rules (captures, Same, Same wall, Plus, Combo, Elemental, Chaos, series) by loading the browser's rule files into Node. `test/api.test.js` runs the server on a throwaway in-memory database and checks accounts, encrypted emails, password resets and the security headers. `test/sw.test.js` checks the offline support against a fake network. GitHub runs them on every push to `dev` or `main` and on every pull request (`.github/workflows/test.yml`).

## Project structure

```
client/                 the game: static files, no build step
  index.html            markup for every screen
  css/                  styles, one file per area (base, menu, cards, game, howto, collection, online)
  js/                   scripts, loaded in order as plain <script> tags sharing one global scope:
    data.js             cards, rules, trades
    save.js             localStorage save
    helpers.js          DOM helpers, audio, layout
    engine.js           pure game rules (used by the UI, the AI and online sync)
    ai.js               computer opponent
    menu.js setup.js deck.js match.js game.js collection.js howto.js settings.js online.js
    account.js          sign up / sign in, the menu's profile card, cloud save sync
                        one file per screen or feature
    store.js            Ley Shards, the Wandering Merchant and the Pack Counter
    main.js             boot: runs last, starts the app
  audio/ images/        music, logos, favicon and app icons
server/                 optional Node server (Express)
  index.js              entry point
  app.js                static files + /api
  routes/auth.js        POST /api/auth/signup, /login, /logout
  routes/me.js          GET /api/me, PUT /api/me/save (the cloud save)
  routes/users.js       GET /api/users/:username (public profile)
  routes/leaderboard.js GET /api/leaderboard (ranks players from the leaderboard table)
  lib/                  password hashing (scrypt), sessions, rate limiting, field checks
  db/index.js           picks the database: Postgres if DATABASE_URL is set, else SQLite
  db/postgres.js        Postgres (Neon in production)
  db/sqlite.js          SQLite via sql.js (WebAssembly, no native build), for local use
  db/schema.*.sql       tables: users, sessions, user_saves, friends, leaderboard… (one file per database, kept in step)
  data/                 the local SQLite file (git-ignored)
index.html              forwards to client/ (for GitHub Pages "deploy from branch")
render.yaml             Render Blueprint for the dev branch
```

A new script goes before `main.js` in `client/index.html`. Code that runs at load time (not inside a function) can only use things defined in earlier files.

## API

All under `/api`, JSON in and out. Signed-in requests send `Authorization: Bearer <token>` (tokens last 60 days of inactivity; only their SHA-256 is stored).

| Route | Does |
| --- | --- |
| `POST /auth/signup` | `{ username, password, email?, displayName?, save? }` → `{ token, user, save }` |
| `POST /auth/login` | `{ username, password }` → `{ token, user, save }` (save includes `data`) |
| `POST /auth/logout` | Ends this session |
| `GET /me` | `{ user, save: { data, rev, updatedAt } \| null }` |
| `PUT /me/save` | `{ data, baseRev, force? }` → `{ rev, updatedAt }`, or **409** if another device saved since `baseRev` |
| `GET /users/:username` | Public profile, with match history unless the player hid it (`profile.history` is then `null`) |
| `GET /leaderboard` | `?by=level\|wins\|streak\|cards&show=all\|friends&q=name` → `{ rows, me, counts }`: the top 50, and your own rank when signed in. `show=friends` needs you signed in |
| `GET /health` | `{ ok: true }` |

Sign-up and sign-in are limited to 20 attempts per 15 minutes per IP.

Server settings (environment variables): `PORT`, `HOST`, `DATABASE_URL` (Postgres connection string; when empty a local SQLite file at `DB_FILE` is used), `CORS_ORIGINS` (comma-separated, default `*`), `TRUST_PROXY` (set to `1` behind Render or another proxy), `SESSION_DAYS`, `EMAIL_KEY` (secret used to encrypt stored emails), `RESEND_API_KEY` (sends password reset emails; without it they are printed to the console locally), `MAIL_FROM` (default `Leylines <noreply@leylines.live>`), `APP_URL` (the site address put in emailed links), `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (turn on push alerts; see below), `VAPID_SUBJECT` (default `mailto:noreply@leylines.live`).

If the client is hosted somewhere other than the server (for example GitHub Pages), set `<meta name="leylines-api" content="https://your-server">` in `client/index.html`.

## Deployment

The game is hosted on: https://leylines.live/ !

### Render

There are two Render services in the **Leylines** project, both made by hand in the dashboard (`render.yaml` records their settings):

| Service | Site | Branch | Use |
| --- | --- | --- | --- |
| `leylines` (Production) | https://leylines.live/ | `main` | the live game |
| `Leylines-dev` (Dev) | https://leylines.onrender.com/ | `dev` | testing new work |

Each redeploys when its branch gets a push. New work goes on `dev`, gets checked on the test site, then goes live through a pull request from `dev` into `main`.

Accounts are stored in a free [Neon](https://neon.tech) Postgres database, because Render's free plan wipes the server's disk on every deploy, restart and idle spin-down (after 15 minutes without traffic). Both services use the same database. To set it up:

1. Create a Neon project and copy its connection string (`postgresql://...?sslmode=require`).
2. In Render, on **each** service → **Environment**: add `DATABASE_URL` with that string.
3. Add `EMAIL_KEY` too: on the first service click **Generate**, then copy that exact value to the other service. Stored emails are encrypted with it, so a leaked database doesn't reveal them; with different keys, one site can't read the emails the other saved. Keep a copy somewhere safe: if it's lost, saved emails can't be read (accounts still work).
4. The server creates the tables on start. The log line `Leylines running ... (database: postgres)` confirms it's connected, and `Encrypted N stored emails` shows old emails being encrypted the first time.

#### Password reset emails

"Forgot password?" emails go out through [Resend](https://resend.com) (free for 3,000 emails a month). One-time setup:

1. Make a Resend account → **Domains** → add `leylines.live`, then add the DNS records it shows where the domain is registered, and wait for it to say **Verified**.
2. Resend → **API Keys** → create a key with sending access.
3. In Render, on **each** service → **Environment**: add `RESEND_API_KEY` with that key, and `APP_URL` with that service's address (`https://leylines.live` for the live one, `https://leylines.onrender.com` for the dev one).

Reset links work once, for 30 minutes; an account gets at most 3 a hour. Without `RESEND_API_KEY` no email is sent on Render.

### Push alerts

Players can turn on **Alerts** in Settings to hear about invites, friend requests and matches they left even with the game closed (on iPhone and iPad only in the home-screen app). The server needs a key pair for this. One-time setup:

1. On your computer, in this folder, run `npx web-push generate-vapid-keys`. It prints a public key and a private key.
2. In Render, on **each** service → **Environment**: add `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` with those two values. Use the same pair on both services.

Keep the private key secret. If it's ever changed, every player has to turn alerts on again. Without the keys, the Alerts setting doesn't show.

Without `DATABASE_URL` the server uses a SQLite file, which is fine locally but on Render loses accounts at every spin-down. The first visit after a spin-down takes about a minute.

